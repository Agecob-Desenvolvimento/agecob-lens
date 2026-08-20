# HANDOFF PT3 — Agente de Dashboard: fechamento parcial dos gaps do §6 (pt2)

**Autor:** Claude Sonnet (sessão nova, sem memória da sessão que escreveu pt1/pt2) · **Data:** 2026-08-19 · **Base:** [`agente-tools-handoff.md`](agente-tools-handoff.md) (pt1) + [`agente-tools-handoff-pt2.md`](agente-tools-handoff-pt2.md) (pt2) · **Regra do escopo:** este documento assume que quem lê já leu pt1 (D1–D10, §11) e pt2 (DoD mapeado, §4 achados, §6 gaps) inteiros. Só registra o que mudou desde o fechamento do pt2.

**Baseline confirmado no início desta sessão:** `python -m pytest tests/ -q` → `193 passed` — bate exatamente com pt2 §5. Nada foi commitado ainda (mesmo estado do pt2 §7: usuário não pediu commit).

**Caminho escolhido pelo usuário** (pt2 §8 oferecia 3 opções): **fechar gaps do §6**, com um item extra priorizado antes de começar — o risco de resposta vazia por esgotamento de rounds (pt2 §6 item 4).

---

## 1. Item 4 do §6 (pt2) — resolvido

**O que pt2 documentava:** `AGENT_MAX_TOOL_ITERS` (default 4 rounds) podia esgotar em pleno meio de tool-calling sem `RunGuard.force_final()` disparar a tempo.

**Confirmado nesta sessão antes de qualquer edição** (não assumido de memória — CLAUDE.md exige verificar contra código real): `RunGuard.MAX_STEPS` default é 10; o loop externo em `agente.py` roda `for _ in range(settings.AGENT_MAX_TOOL_ITERS + 1)` = 5 iterações com o default. Como cada rodada de tool-calling do DeepSeek normalmente consome 1 step (D6: sem paralelismo), 5 rodadas esgotam o range muito antes de `steps` chegar a 10. `force_final()` só olha `steps_exceeded() | wall_clock_exceeded() | loop_declared` — nenhum dos três está ligado ao teto de rounds. Se o modelo encadeia `tool_use` em toda rodada, o `for` termina por exaustão do `range()` (sem `break`), e o `return "".join(...)` final lê o último `response`, que só tem blocos `tool_use` — devolve string vazia.

**Fix** (`dominios/agente/agente.py`, ambos os loops — `_loop_anthropic` linha ~365 e `_loop_deepseek` linha ~458): a última iteração permitida do `for` agora força o desfecho incondicionalmente, não só quando `state.force_final()` já é `True`:

```python
for i in range(settings.AGENT_MAX_TOOL_ITERS + 1):
    if state.force_final() or i == settings.AGENT_MAX_TOOL_ITERS:
        convo.append({"role": "user", "content": _FORCE_FINAL_NUDGE})
        response = client.messages.create(...)  # sem `tools` — nudge, não nova rodada de tool
        break
```

A última rodada nunca mais tenta abrir mais uma chamada de tool — sempre sintetiza com o que já foi apurado, reusando o mesmo caminho de nudge que já existia para o gatilho do RunGuard.

**Teste de regressão** (`tests/test_agente.py`): `test_run_agent_loop_anthropic_forces_final_when_rounds_exhausted` e `test_run_agent_loop_deepseek_forces_final_when_rounds_exhausted`. Fake `create()`/`create()` decide a resposta pela presença/ausência de `tools` nos kwargs — agnóstico a qual código está rodando, então o teste falha de verdade contra o código pré-fix (3ª chamada ainda leva `tools`, devolve `tool_use`, função retorna `""`) e passa contra o pós-fix. `AGENT_MAX_TOOL_ITERS` monkeypatched para 2 nos testes (velocidade; a lógica não depende do valor).

---

## 2. Item 1 do §6 (pt2) — resolvido: retry com backoff+jitter

**O que pt1 pedia (§4.2, 1ª metade)** e pt2 confirmou nunca ter sido implementado: "Timeout do cliente HTTP menor que o do gateway → 1 retry com backoff exponencial + jitter (~1s) → falhou: erro estruturado." Só a 2ª metade (circuit breaker) tinha sido feita no P3.

**Ajuste de escopo:** pt1 fala em "cliente HTTP", mas pt2 §4 achado #8 já havia confirmado que não existe hop HTTP interno — as tools chamam `run_query()` (pyodbc) direto. O retry foi implementado no ponto real de falha (exceção de `run_fn()` dentro de `RunState.dispatch`), não em um cliente HTTP inexistente. A parte de "timeout por endpoint" do §4.2 (que dependeria de latência p95 medida em produção — pt1 §10 item 2, pt2 §6 item 2) **continua em aberto**, deliberadamente — não dava para inventar um número sem dado real, e a retentativa não depende dele para funcionar.

**Implementação** (`dominios/agente/guards.py`, `RunState.dispatch`): na falha de `run_fn()`, dorme `~1s ± 0.3s` de jitter (`RETRY_BASE_DELAY_S=1.0`, `RETRY_JITTER_S=0.3`, `random.uniform`) e tenta de novo, **dentro da mesma chamada de `dispatch()`** — não conta como um novo step do RunGuard nem como uma nova falha do circuit breaker/desabilitação por 3x. Só se a *segunda* tentativa também falhar é que o contrato de erro existente (`upstream_5xx`, `_fail_counts`, `circuit_breaker.record(ok=False)`, cache de erro 8s) entra em ação — inalterado.

```python
try:
    result = run_fn()
except Exception:
    time.sleep(_retry_delay())
    try:
        result = run_fn()
    except Exception as exc:
        ...  # caminho de falha existente, sem mudança
```

**Efeito colateral em teste existente:** `test_sucesso_reseta_contador_de_falha` (`tests/test_guards.py`) codificava implicitamente "1 chamada crua por `dispatch()`". Com retry, uma `dispatch()` que falha consome 2 chamadas cruas antes de desistir. Ajustado o limiar do fixture `flaky()` de `attempts <= 2` para `attempts <= 4` para preservar a intenção original do teste (2 `dispatch()` falhando, 3ª recupera, contador zera) — comentário no teste explica o porquê. Nenhum outro teste existente dependia de contagem de chamadas cruas (`boom()` sempre falha, independente de quantas vezes é chamado).

**Testes novos** (`tests/test_guards.py`): `test_retry_absorve_falha_transiente_sem_contar_como_falha` (falha 1x, sucesso na retentativa, não conta pro contador de desabilitação) e `test_retry_esgota_e_devolve_erro_estruturado` (falha 2x seguidas dentro da mesma `dispatch()`, devolve o erro estruturado de sempre).

**Custo em tempo de teste:** `time.sleep` real de ~1s por falha teria somado segundos reais à suíte (vários testes de `test_guards.py`/`test_agente.py` simulam falha). Adicionado fixture `autouse` em `tests/conftest.py` que faz `monkeypatch.setattr(guards_mod.time, "sleep", lambda *a, **k: None)` — produção continua dormindo de verdade, suíte não perde velocidade (`test_guards.py` + `test_agente.py`: 1.69s).

---

## 3. O que continua em aberto (pt2 §6, itens não tocados nesta sessão)

| Item (pt2 §6) | Status | Por quê não foi tocado |
|---|---|---|
| 2 — §10 pt1 itens 1/2 (budget de tokens vs. plano DeepSeek; latência p95 por endpoint definindo timeout por tool) | Continua sem verificação | Não verificável sem acesso à conta DeepSeek/métricas de produção — mesma limitação que pt2 já registrava. Não é código a escrever, é dado a medir. |
| 3 — Live eval mode (P2) | Não construído | Fora do caminho escolhido pelo usuário nesta sessão (pt2 §8 oferecia como opção separada; usuário escolheu "fechar gaps do §6", não este). `compute_metrics()` já está pronta para quando alguém decidir construir. |
| 5 — Capability gaps (`por_agente`/portfolio-scoping ausentes de `query_kpi_historico`/`comparar_agentes`, achado #2 do pt2 §4) | Não tocado, de propósito | Resolver isso significa adicionar parâmetro/tool nova, o que reabre o teto de 15 tools travado em D10 (pt1 — "não relitigar"). Decisão de negócio pendente, não bug de implementação; não assumi qual caminho tomar sem perguntar. |

---

## 4. Estado dos testes ao final desta sessão

```bash
python -m pytest tests/ -q
```
**Resultado:** `197 passed, 13 warnings` (era 193 no baseline do pt2/início desta sessão; +2 do fix de round-exhaustion, +2 do retry).

```bash
python -m pytest tests/test_guards.py tests/test_agente.py -q
```
**Resultado:** `71 passed in 1.69s` — confirma que o `sleep` do retry não vazou tempo real para a suíte.

---

## 5. Próximo passo exato

Não há mais nenhum item do §6 do pt2 que seja puro trabalho de código sem decisão de negócio pendente. Se a continuação for:

- **Item 2 (§10 pt1)** → precisa de acesso a métricas de produção (latência p95 por endpoint, plano de tokens contratado no DeepSeek) — não é tarefa de implementação, é levantamento operacional.
- **Item 3 (live eval)** → já tem o esqueleto pronto em `harness.py`/`compute_metrics()`; falta decidir gastar chamadas reais ao DeepSeek (custo, não-determinismo) — mesma pergunta que pt2 §3 já fez e o usuário respondeu "offline" naquela sessão. Perguntar de novo antes de construir.
- **Item 5 (capability gaps)** → decisão de negócio: vale estourar o teto de 15 tools do D10, ou aceitar a perda de capacidade permanentemente? Não assumir.
- **Commitar o que existe** → segue sem ter sido pedido nesta sessão.

Nenhum desses foi pedido ainda.
