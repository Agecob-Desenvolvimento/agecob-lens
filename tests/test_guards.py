"""
Testes do RunGuard (dominios/agente/guards.py) — protocolo de runtime do
loop de tools (§3 do handoff agente-tools-handoff.md). Sem rede, sem banco:
só o state machine puro.
"""
from fastapi import HTTPException

import dominios.agente.guards as guards_mod
from dominios.agente.guards import RunGuard, RunState, circuit_breaker, tool_cache


def test_steps_exceeded_forca_final():
    state = RunState(RunGuard(MAX_STEPS=2))
    assert state.force_final() is False
    state.dispatch("tool_a", {}, lambda: {"ok": True})
    assert state.force_final() is False
    state.dispatch("tool_b", {}, lambda: {"ok": True})
    assert state.force_final() is True


def test_dispatch_recusa_executar_apos_estourar_step_budget():
    """
    Achado E1 (pt5-live-testing.md): DeepSeek/OpenAI e Anthropic podem devolver
    varios tool_calls numa unica resposta (tool calling paralelo). O loop em
    agente.py so reavalia force_final() ENTRE rodadas, nao entre chamadas de
    um mesmo lote - live testing bateu 11 tool calls com MAX_STEPS=10 porque
    um lote de 4 chamadas foi despachado inteiro mesmo cruzando o teto no
    meio. dispatch() agora se autoprotege: uma vez no limite, recusa executar
    run_fn (nao so sinaliza via force_final() pro chamador respeitar depois).
    """
    state = RunState(RunGuard(MAX_STEPS=2))
    calls = []
    run_fn = lambda: calls.append(1) or {"ok": True}

    state.dispatch("tool_a", {}, run_fn)
    state.dispatch("tool_b", {}, run_fn)
    assert len(calls) == 2

    # simula 2 chamadas extras no MESMO lote (loop ainda nao rechecou force_final)
    result_3 = state.dispatch("tool_c", {}, run_fn)
    result_4 = state.dispatch("tool_d", {}, run_fn)

    assert len(calls) == 2  # run_fn nunca executou pras chamadas 3 e 4
    assert state.steps == 2  # nao incrementa alem do teto
    assert result_3["error_type"] == "step_budget_exceeded"
    assert result_3["ok"] is False
    assert result_4["error_type"] == "step_budget_exceeded"


def test_wall_clock_forca_final(monkeypatch):
    state = RunState(RunGuard(WALL_CLOCK_S=10))
    clock = {"t": 0.0}
    monkeypatch.setattr(guards_mod.time, "monotonic", lambda: clock["t"])
    state._started_at = 0.0
    assert state.force_final() is False
    clock["t"] = 11.0
    assert state.force_final() is True


def test_chamada_identica_2a_vez_memoiza_sem_reexecutar():
    calls = []

    def run_fn():
        calls.append(1)
        return {"valor": 42}

    state = RunState()
    first = state.dispatch("get_x", {"a": 1}, run_fn)
    assert first == {"valor": 42}
    assert len(calls) == 1

    second = state.dispatch("get_x", {"a": 1}, run_fn)
    assert second["resultado_memoizado"] == {"valor": 42}
    assert "nota" in second
    assert len(calls) == 1  # não re-executou
    assert state.force_final() is False  # 2ª vez ainda não força


def test_chamada_identica_3a_vez_forca_desfecho():
    state = RunState()
    run_fn = lambda: {"valor": 1}
    state.dispatch("get_x", {"a": 1}, run_fn)
    state.dispatch("get_x", {"a": 1}, run_fn)
    assert state.force_final() is False
    state.dispatch("get_x", {"a": 1}, run_fn)
    assert state.force_final() is True


def test_args_canonicos_ordem_nao_importa():
    """{"a":1,"b":2} e {"b":2,"a":1} são a mesma chamada."""
    state = RunState()
    calls = []
    run_fn = lambda: calls.append(1) or {"ok": True}
    state.dispatch("get_x", {"a": 1, "b": 2}, run_fn)
    result = state.dispatch("get_x", {"b": 2, "a": 1}, run_fn)
    assert len(calls) == 1
    assert "resultado_memoizado" in result


def test_espiral_a_b_a_b_declara_loop():
    state = RunState()
    run_fn = lambda: {"ok": True}
    # A(x=1) B(x=1) A(x=2) B(x=2) — args diferentes, então não memoiza,
    # mas a SEQUÊNCIA de nomes A->B->A->B é a espiral.
    state.dispatch("tool_a", {"x": 1}, run_fn)
    state.dispatch("tool_b", {"x": 1}, run_fn)
    assert state.force_final() is False
    state.dispatch("tool_a", {"x": 2}, run_fn)
    state.dispatch("tool_b", {"x": 2}, run_fn)
    assert state.force_final() is True


def test_falha_3x_seguidas_desabilita_tool():
    def boom():
        # HTTPException: run_query() (core/database/query_executor.py) normaliza
        # toda falha de rede/DB pra isto — é o tipo que dispara retry+upstream_5xx
        # (achado #9 do review pt4; RuntimeError puro vira internal_error sem retry).
        raise HTTPException(status_code=500, detail="upstream explodiu")

    state = RunState()
    r1 = state.dispatch("tool_c", {"n": 1}, boom)
    assert r1["ok"] is False
    assert r1["error_type"] == "upstream_5xx"
    r2 = state.dispatch("tool_c", {"n": 2}, boom)
    r3 = state.dispatch("tool_c", {"n": 3}, boom)
    assert r3["error_type"] == "upstream_5xx"

    r4 = state.dispatch("tool_c", {"n": 4}, boom)
    assert r4["error_type"] == "tool_disabled"
    assert r4["ok"] is False
    assert r4["retryable"] is False


def test_falha_isolada_por_tool_nao_desabilita_outra():
    def boom():
        raise RuntimeError("x")

    def ok():
        return {"ok": True}

    state = RunState()
    state.dispatch("tool_d", {}, boom)
    state.dispatch("tool_d", {}, boom)
    result = state.dispatch("tool_e", {}, ok)
    assert result == {"ok": True}


def test_sucesso_reseta_contador_de_falha():
    attempts = {"n": 0}

    def flaky():
        attempts["n"] += 1
        # dispatch() agora tenta 2x (retry de §4.2) antes de contar como falha —
        # 4 chamadas cruas cobre as 2 dispatch() falhas abaixo (2 tentativas cada).
        if attempts["n"] <= 4:
            raise HTTPException(status_code=504, detail="transiente")
        return {"ok": True}

    state = RunState()
    state.dispatch("tool_f", {"i": 1}, flaky)
    state.dispatch("tool_f", {"i": 2}, flaky)
    result = state.dispatch("tool_f", {"i": 3}, flaky)
    assert result == {"ok": True}

    # tool não está desabilitada — voltou a funcionar antes de acumular 3 falhas seguidas
    result2 = state.dispatch("tool_f", {"i": 4}, flaky)
    assert result2 == {"ok": True}


# ─── §4.2: retry com backoff+jitter na falha de tool (fecha gap do handoff) ──


def test_retry_absorve_falha_transiente_sem_contar_como_falha():
    calls = {"n": 0}

    def flaky_once():
        calls["n"] += 1
        if calls["n"] == 1:
            raise HTTPException(status_code=504, detail="timeout transiente")
        return {"ok": True}

    state = RunState()
    result = state.dispatch("tool_retry", {}, flaky_once)
    assert result == {"ok": True}
    assert calls["n"] == 2  # 1ª falha + 1 retry, ambos dentro da MESMA dispatch()

    # retentativa bem-sucedida não conta como falha — 3 chamadas OK seguidas
    # (args diferentes, sem memoização) continuam OK, tool nunca é desabilitada
    state.dispatch("tool_retry", {"i": 1}, lambda: {"ok": True})
    state.dispatch("tool_retry", {"i": 2}, lambda: {"ok": True})
    result2 = state.dispatch("tool_retry", {"i": 3}, lambda: {"ok": True})
    assert result2 == {"ok": True}


def test_retry_esgota_e_devolve_erro_estruturado():
    calls = {"n": 0}

    def sempre_falha():
        calls["n"] += 1
        raise HTTPException(status_code=500, detail="upstream fora do ar")

    state = RunState()
    result = state.dispatch("tool_retry_b", {}, sempre_falha)
    assert calls["n"] == 2  # tentativa original + 1 retry, depois desiste
    assert result["ok"] is False
    assert result["error_type"] == "upstream_5xx"


def test_erro_deterministico_nao_retenta_e_usa_taxonomia_propria():
    """
    Achado #9 do review pt4: exceção que não é HTTPException (bug de código —
    run_query já normaliza toda falha de rede/DB pra HTTPException, então
    qualquer outra coisa que escapa daqui pra cima é bug, não falha
    transiente) não deve retentar — retentar vai falhar do mesmo jeito de
    novo, só come ~1s de wall clock à toa. Taxonomia própria (internal_error,
    não upstream_5xx) pro LLM não receber a dica "tente janela menor", que
    não faz sentido pra um bug de código.
    """
    calls = {"n": 0}

    def bug():
        calls["n"] += 1
        raise KeyError("campo_que_nao_existe")

    state = RunState()
    result = state.dispatch("tool_bug", {}, bug)

    assert calls["n"] == 1  # não retentou
    assert result["ok"] is False
    assert result["error_type"] == "internal_error"
    assert result["retryable"] is False


def test_erro_deterministico_conta_pra_desabilitacao_e_breaker():
    """A falta de retry não deve desmontar o resto do protocolo — 3 falhas
    seguidas (deterministicas ou não) ainda desabilitam a tool."""
    def bug():
        raise TypeError("bug de verdade")

    state = RunState()
    state.dispatch("tool_bug_3x", {"n": 1}, bug)
    state.dispatch("tool_bug_3x", {"n": 2}, bug)
    r3 = state.dispatch("tool_bug_3x", {"n": 3}, bug)
    assert r3["error_type"] == "internal_error"

    r4 = state.dispatch("tool_bug_3x", {"n": 4}, bug)
    assert r4["error_type"] == "tool_disabled"


# ─── P3: cache entre requests (§5.1) ────────────────────────────────


def test_cache_entre_requests_evita_rechamar_em_novo_request():
    calls = []

    def run_fn():
        calls.append(1)
        return {"valor": "caro de buscar"}

    state1 = RunState()
    r1 = state1.dispatch("tool_cache_a", {"x": 1}, run_fn, db="COBwebRCBAUTOS")
    assert r1 == {"valor": "caro de buscar"}
    assert len(calls) == 1

    # request NOVO (RunState novo) — mesma tool/db/args deveria vir do cache entre requests
    state2 = RunState()
    r2 = state2.dispatch("tool_cache_a", {"x": 1}, run_fn, db="COBwebRCBAUTOS")
    assert r2 == {"valor": "caro de buscar"}
    assert len(calls) == 1  # não rechamou
    assert state2.last_call_meta["cache_hit"] is True


def test_cache_entre_requests_discrimina_por_db():
    calls = []
    run_fn = lambda: calls.append(1) or {"ok": True}

    RunState().dispatch("tool_cache_b", {"x": 1}, run_fn, db="COBwebRCBAUTOS")
    RunState().dispatch("tool_cache_b", {"x": 1}, run_fn, db="COBwebRCBCONSUMER")
    assert len(calls) == 2  # bancos diferentes = chaves diferentes, sem cache cruzado


def test_erro_fica_em_cache_curto_mas_nao_desabilita_via_cache():
    def boom():
        raise HTTPException(status_code=500, detail="upstream fora do ar")

    state1 = RunState()
    r1 = state1.dispatch("tool_cache_c", {}, boom, db="COBwebRCBAUTOS")
    assert r1["error_type"] == "upstream_5xx"

    state2 = RunState()
    r2 = state2.dispatch("tool_cache_c", {}, boom, db="COBwebRCBAUTOS")
    assert r2["error_type"] == "upstream_5xx"
    assert state2.last_call_meta["cache_hit"] is True  # veio do cache de erro, não rechamou boom


def test_cache_key_discrimina_por_periodo():
    """
    Achado #2 do review pt4: as tools legadas não carregam date_from/date_to
    nos args (o período vem do fechamento da sessão, não do payload da tool
    call) — sem esses campos na chave do cache entre requests, sessão A
    filtrando julho podia servir o número de julho pra sessão B filtrando
    agosto dentro do TTL de 60s.
    """
    calls = []

    def run_fn():
        calls.append(1)
        return {"valor": "depende do periodo filtrado na sessao"}

    RunState().dispatch(
        "tool_periodo", {}, run_fn, db="COBwebRCBAUTOS", date_from="2026-07-01", date_to="2026-07-31",
    )
    RunState().dispatch(
        "tool_periodo", {}, run_fn, db="COBwebRCBAUTOS", date_from="2026-08-01", date_to="2026-08-20",
    )

    assert len(calls) == 2  # períodos diferentes = chaves diferentes, sem cache cruzado


def test_cache_key_ainda_bate_para_mesmo_periodo():
    """Mesmo período/db/args continuam batendo no cache — o fix do #2 não
    quebrou o caso comum, só discrimina quando o período realmente muda."""
    calls = []
    run_fn = lambda: calls.append(1) or {"ok": True}

    RunState().dispatch(
        "tool_periodo_b", {}, run_fn, db="COBwebRCBAUTOS", date_from="2026-07-01", date_to="2026-07-31",
    )
    RunState().dispatch(
        "tool_periodo_b", {}, run_fn, db="COBwebRCBAUTOS", date_from="2026-07-01", date_to="2026-07-31",
    )

    assert len(calls) == 1


def test_falha_memoizada_dentro_do_request_devolve_erro_nao_null():
    """
    Achado #5 do review pt4: run_fn() que falha nunca gravava em
    _call_cache (só o cache ENTRE requests recebia o erro). Uma repetição
    da MESMA chamada (mesmo hash) dentro do MESMO request caía no branch de
    memoização e devolvia resultado_memoizado: null — o contrato de erro
    estruturado (§4.1 do pt1) se perdia e o modelo era instruído a confiar
    num null.
    """
    def sempre_falha():
        raise HTTPException(status_code=500, detail="upstream explodiu")

    state = RunState()
    primeira = state.dispatch("tool_falha_memo", {"x": 1}, sempre_falha)
    assert primeira["ok"] is False

    segunda = state.dispatch("tool_falha_memo", {"x": 1}, sempre_falha)
    assert segunda["resultado_memoizado"] is not None
    assert segunda["resultado_memoizado"]["ok"] is False
    assert segunda["resultado_memoizado"]["error_type"] == primeira["error_type"]


# ─── P3: circuit breaker entre requests (§4.2) ──────────────────────


def test_circuit_breaker_abre_com_taxa_de_erro_alta_entre_requests():
    def boom():
        raise RuntimeError("x")

    # 5 chamadas (amostra mínima), todas falhando -> taxa de erro 100% > 30%
    for i in range(5):
        RunState().dispatch("tool_breaker_a", {"i": i}, boom, db="COBwebRCBAUTOS")

    assert circuit_breaker.is_open("tool_breaker_a") is True

    # request novo, tool diferente de nome mas breaker aberto -> nem chama run_fn
    calls = []
    result = RunState().dispatch("tool_breaker_a", {"i": 99}, lambda: calls.append(1), db="COBwebRCBAUTOS")
    assert not calls
    assert result["error_type"] == "upstream_5xx"
    assert result["retryable"] is True


def test_circuit_breaker_nao_abre_com_amostra_pequena():
    def boom():
        raise RuntimeError("x")

    for i in range(3):  # abaixo da amostra mínima (5)
        RunState().dispatch("tool_breaker_b", {"i": i}, boom, db="COBwebRCBAUTOS")

    assert circuit_breaker.is_open("tool_breaker_b") is False


def test_circuit_breaker_isolado_por_tool():
    def boom():
        raise RuntimeError("x")

    for i in range(5):
        RunState().dispatch("tool_breaker_c", {"i": i}, boom, db="COBwebRCBAUTOS")

    assert circuit_breaker.is_open("tool_breaker_c") is True
    assert circuit_breaker.is_open("tool_breaker_outra") is False


# ─── P3: teto de tokens por tool result e orçamento (§3) ────────────


def test_resultado_grande_e_truncado():
    grande = {"data": ["x" * 100 for _ in range(200)]}  # bem maior que 1800 tokens

    state = RunState(RunGuard(TOOL_RESULT_TOKEN_CAP=100))
    result = state.dispatch("tool_grande", {}, lambda: grande, db="COBwebRCBAUTOS")
    assert result["_truncado"] is True
    assert state.last_call_meta["truncated"] is True


def test_truncamento_usa_heuristica_conservadora_de_chars_por_token():
    """
    Achado #10 do review pt4: cap por cap_tokens*4 caracteres não
    corresponde ao cap real de tokens — conteúdo denso em número/pontuação/
    PT-BR acentuado tokeniza mais perto de 3 chars/token que a prosa em
    inglês, e o resultado "capado" podia passar de 1800 tokens reais mesmo
    depois de truncado.
    """
    grande = {"data": ["x" * 100 for _ in range(200)]}

    state = RunState(RunGuard(TOOL_RESULT_TOKEN_CAP=100))
    result = state.dispatch("tool_denso", {}, lambda: grande, db="COBwebRCBAUTOS")

    assert result["_truncado"] is True
    assert guards_mod._CHARS_PER_TOKEN_ESTIMATE == 3
    assert len(result["_previa"]) == 100 * guards_mod._CHARS_PER_TOKEN_ESTIMATE


def test_resultado_pequeno_nao_e_truncado():
    state = RunState()
    result = state.dispatch("tool_pequeno", {}, lambda: {"ok": True}, db="COBwebRCBAUTOS")
    assert result == {"ok": True}
    assert state.last_call_meta["truncated"] is False


def test_budget_near_limit_acumula_entre_chamadas():
    guard = RunGuard(TOOL_BUDGET_TOKENS=100)  # 80% = 80 tokens ~= 320 chars
    state = RunState(guard)
    assert state.budget_near_limit() is False

    grande = "x" * 400  # ~100 tokens sozinho já estoura 80%
    state.dispatch("tool_budget_a", {"i": 1}, lambda: {"texto": grande}, db="COBwebRCBAUTOS")
    assert state.budget_near_limit() is True


def test_row_count_inferido_de_lista_e_de_meta():
    state = RunState()
    r1 = state.dispatch("tool_row_a", {}, lambda: [1, 2, 3], db="COBwebRCBAUTOS")
    assert state.last_call_meta["row_count"] == 3

    state2 = RunState()
    r2 = state2.dispatch(
        "tool_row_b", {}, lambda: {"data": [], "meta": {"total_rows": 42}}, db="COBwebRCBAUTOS",
    )
    assert state2.last_call_meta["row_count"] == 42
