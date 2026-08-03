"""
Testes do agente de carteiras (/agente/chat) — sem rede e sem banco.

Cobrem as funções puras (risco, tools, parsing) e o loop de tool-calling
completo com SDKs stubados (Anthropic e DeepSeek/OpenAI).
"""
import sys
import types

import config.settings as settings
from dominios.agente import risco as risco_mod
from dominios.agente.agente import _parse_agent_final_text, run_agent
from dominios.agente.agentes import _agent_entries_from_rows
from dominios.agente.conversao import _trim_diaria, _trim_mensal, _trim_por_agente
from dominios.agente.cruzamento import _cruzamento_summary
from dominios.agente.detalhe import _maiores_por_valor_total
from dominios.agente.fases import _fase_summary
from dominios.agente.risco import _portfolio_entries_from_rollup, _status_breakdown_from_rows
from dominios.agente.series import _series_from_rows, _tendencia
from dominios.agente.tools import AGENT_TOOLS, dispatch_tool


def _rollup_row(portfolio, status, qtd, valor):
    return {"portfolio_name": portfolio, "id_rec_status": status, "qtd": qtd, "valor": valor}


def _entries_for(rows):
    return _portfolio_entries_from_rollup(rows, data_referencia="2026-06-10")


def _single_entry(rows):
    entries = _entries_for(rows)
    assert len(entries) == 1
    return entries[0]


# ─── _portfolio_entries_from_rollup ──────────────────────────────


def test_entries_denominador_universo_e_composto_max():
    # GERADOS: 1=600, 2=300, 12=100 → vp=1000 / qtd=10. Status 2 conta nos
    # dois lados (gerado E quebrado), como manda a regra (baldes distintos).
    # Universo = gerados + exceções + rejeitados = 1000 + 600 + 400 = 2000.
    rows = [
        _rollup_row("ALFA", 1, 6, 600),
        _rollup_row("ALFA", 2, 3, 300),
        _rollup_row("ALFA", 12, 1, 100),
        _rollup_row("ALFA", 5, 1, 600),
        _rollup_row("ALFA", 7, 1, 400),
    ]
    entry = _single_entry(rows)
    assert entry["valor_primeira_parcela"] == 1000.0
    assert entry["qtd_acordos"] == 10
    assert entry["decomposicao"] == {
        "excecoes_pct": 30.0,
        "quebrados_pct": 15.0,
        "rejeitados_pct": 20.0,
    }
    # composto = MAX, nunca soma (30 + 15 + 20 = 65 seria errado)
    assert entry["risco_composto"] == 30.0
    assert entry["nivel_risco"] == "medio"
    assert entry["anomalia"] is False
    assert entry["data_referencia"] == "2026-06-10"


def test_entries_thresholds_baixo_medio_alto():
    def entry_with_quebra(valor_quebrado):
        rows = [
            _rollup_row("X", 1, 10, 1000 - valor_quebrado),
            _rollup_row("X", 2, 1, valor_quebrado),
        ]
        return _single_entry(rows)

    assert entry_with_quebra(250)["nivel_risco"] == "baixo"   # exatamente 25%
    assert entry_with_quebra(500)["nivel_risco"] == "medio"   # exatamente 50%
    assert entry_with_quebra(501)["nivel_risco"] == "alto"    # 50.1%


def test_entries_excecoes_maiores_que_gerados_viram_fatia_do_universo():
    # Exceções (5) ficam fora de STATUS_GERADOS: 300 de exceção contra 200
    # gerados é risco real (60% do universo de 500), não anomalia de dados.
    rows = [
        _rollup_row("BETA", 1, 2, 200),
        _rollup_row("BETA", 5, 5, 300),
    ]
    entry = _single_entry(rows)
    assert entry["decomposicao"]["excecoes_pct"] == 60.0
    assert entry["risco_composto"] == 60.0
    assert entry["nivel_risco"] == "alto"
    assert entry["anomalia"] is False


def test_entries_sem_gerados_excecao_e_fatia_total():
    rows = [_rollup_row("GAMA", 5, 2, 500)]  # nenhum gerado
    entry = _single_entry(rows)
    assert entry["valor_primeira_parcela"] == 0.0
    assert entry["decomposicao"]["excecoes_pct"] == 100.0
    assert entry["nivel_risco"] == "alto"
    assert entry["anomalia"] is False


def test_entries_ordenadas_por_valor_e_sem_nome_vazio():
    rows = [
        _rollup_row("MENOR", 1, 1, 100),
        _rollup_row("MAIOR", 1, 1, 900),
        _rollup_row("", 1, 1, 500),
        _rollup_row(None, 1, 1, 500),
    ]
    entries = _entries_for(rows)
    assert [e["portfolio_name"] for e in entries] == ["MAIOR", "MENOR"]


# ─── dispatch_tool ───────────────────────────────────────────────


SAMPLE_ENTRIES = _portfolio_entries_from_rollup(
    [
        _rollup_row("BANCO ALFA", 1, 10, 1000),
        _rollup_row("BANCO ALFA", 2, 1, 100),
        _rollup_row("BANCO BETA", 1, 5, 500),
        _rollup_row("BANCO BETA", 2, 3, 300),
        _rollup_row("CARTEIRA GAMA", 1, 2, 50),
        _rollup_row("CARTEIRA GAMA", 5, 4, 90),
    ],
    data_referencia="2026-06-10",
)

# Tools de carteira nunca devem carregar o dataset de agentes (loader lazy).
def _NO_AGENTS():
    raise AssertionError("get_agents não deveria ser chamado por tools de carteira")


def test_tool_get_portfolio_metrics_exato_e_substring():
    exact = dispatch_tool("get_portfolio_metrics", {"portfolio_name": "banco alfa"}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert exact["portfolio_name"] == "BANCO ALFA"

    partial = dispatch_tool("get_portfolio_metrics", {"portfolio_name": "gama"}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert partial["portfolio_name"] == "CARTEIRA GAMA"

    missing = dispatch_tool("get_portfolio_metrics", {"portfolio_name": "inexistente"}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert "error" in missing
    assert "BANCO ALFA" in missing["available_portfolios"]


def test_tool_filter_by_risk():
    # Universo = gerados + exceções + rejeitados. ALFA: quebrados 100/1100 ≈ 9.09
    # → baixo; BETA: 300/800 = 37.5 → medio; GAMA: exceções 90/(50+90) ≈ 64.29 → alto.
    baixo = dispatch_tool("filter_portfolios_by_risk", {"level": "baixo"}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert [e["portfolio_name"] for e in baixo] == ["BANCO ALFA"]

    medio = dispatch_tool("filter_portfolios_by_risk", {"level": "médio"}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert [e["portfolio_name"] for e in medio] == ["BANCO BETA"]

    alto = dispatch_tool("filter_portfolios_by_risk", {"level": "alto"}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert [e["portfolio_name"] for e in alto] == ["CARTEIRA GAMA"]

    invalid = dispatch_tool("filter_portfolios_by_risk", {"level": "altissimo"}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert "error" in invalid


def test_tool_filter_by_value():
    result = dispatch_tool("filter_portfolios_by_value", {"min_value": 500}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert [e["portfolio_name"] for e in result] == ["BANCO ALFA", "BANCO BETA"]

    limited = dispatch_tool("filter_portfolios_by_value", {"min_value": 0, "limit": 1}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert len(limited) == 1
    assert limited[0]["portfolio_name"] == "BANCO ALFA"  # ordenado por valor desc


def test_tool_compare_portfolios():
    result = dispatch_tool(
        "compare_portfolios",
        {"names": ["alfa", "beta", "nao-existe"], "metric": "risco_composto"},
        SAMPLE_ENTRIES,
        _NO_AGENTS,
    )
    assert [e["portfolio_name"] for e in result["portfolios"]] == ["BANCO ALFA", "BANCO BETA"]
    assert result["metric"] == "risco_composto"
    assert result["not_found"] == ["nao-existe"]

    empty = dispatch_tool("compare_portfolios", {"names": []}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert "error" in empty


def test_tool_explain_business_rule():
    known = dispatch_tool("explain_business_rule", {"rule_name": "risco_composto_formula"}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert "MAX" in known["explanation"]

    unknown = dispatch_tool("explain_business_rule", {"rule_name": "nao-existe"}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert "error" in unknown
    assert "denominador" in unknown["available_rules"]


def test_tool_desconhecida():
    result = dispatch_tool("tool_que_nao_existe", {}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert "error" in result


# ─── performance por agente (AgentEntry + tools) ─────────────────


def _agent_row(origem, nome, chave, **kwargs):
    row = {
        "origem": origem, "NOME": nome, "CHAVE": chave,
        "qtd_acionamentos": 0, "qtd_alo": 0, "qtd_contatos": 0, "qtd_acordos": 0,
        "qtd_boletos_emitidos": 0, "qtd_boletos_pagos": 0, "valor_total_acordos": 0.0,
        "valor_primeira_parcela": 0.0, "qtd_excecoes": 0, "valor_excecoes": 0.0,
    }
    row.update(kwargs)
    return row


SAMPLE_AGENTS = _agent_entries_from_rows(
    [
        _agent_row("AUTOS", "ADRIANNA SILVA", "ADRI", qtd_acionamentos=1000, qtd_alo=250,
                   qtd_contatos=60, qtd_acordos=8, qtd_boletos_emitidos=5, qtd_boletos_pagos=2,
                   valor_total_acordos=30000.0, valor_primeira_parcela=6000.0),
        _agent_row("CONSUMER", "ADRIANNA SILVA", "ADRI", qtd_acionamentos=840, qtd_alo=162,
                   qtd_contatos=37, qtd_acordos=4, qtd_boletos_emitidos=3, qtd_boletos_pagos=1,
                   valor_total_acordos=18300.0, valor_primeira_parcela=3700.0),
        _agent_row("AUTOS", "RONIE VON", "RVON", qtd_acionamentos=500, qtd_alo=100,
                   qtd_contatos=20, qtd_acordos=2, qtd_boletos_emitidos=2, qtd_boletos_pagos=2,
                   valor_total_acordos=9000.0, valor_primeira_parcela=2000.0),
    ],
    data_referencia="2026-06-10",
)


def _AGENTS():
    return SAMPLE_AGENTS


def test_agent_entries_agrega_origens_e_recalcula_taxas():
    # 'todos' devolve uma linha por origem: somas por agente, razões recalculadas.
    adri = next(a for a in SAMPLE_AGENTS if a["login"] == "ADRI")
    assert adri["qtd_acionamentos"] == 1840
    assert adri["qtd_alo"] == 412
    assert adri["qtd_contatos"] == 97
    assert adri["taxa_contato_pct"] == 22.39   # 412/1840
    assert adri["taxa_cpc_pct"] == 23.54       # 97/412
    assert adri["qtd_acordos"] == 12
    assert adri["valor_acordos"] == 48300.0
    assert adri["ticket_medio"] == 4025.0
    assert adri["conversao_pct"] == 3.09       # 3 pagos / 97 CPC
    assert adri["data_referencia"] == "2026-06-10"
    # ordenado por valor_acordos desc
    assert [a["login"] for a in SAMPLE_AGENTS] == ["ADRI", "RVON"]


def test_tool_get_agent_performance_nome_login_e_substring():
    by_name = dispatch_tool("get_agent_performance", {"agent_name": "adrianna"}, SAMPLE_ENTRIES, _AGENTS)
    assert by_name["login"] == "ADRI"

    by_login = dispatch_tool("get_agent_performance", {"agent_name": "rvon"}, SAMPLE_ENTRIES, _AGENTS)
    assert by_login["agent_name"] == "RONIE VON"

    missing = dispatch_tool("get_agent_performance", {"agent_name": "inexistente"}, SAMPLE_ENTRIES, _AGENTS)
    assert "error" in missing
    assert "ADRIANNA SILVA" in missing["available_agents"]


def test_tool_list_agents_performance():
    default = dispatch_tool("list_agents_performance", {}, SAMPLE_ENTRIES, _AGENTS)
    assert [a["login"] for a in default] == ["ADRI", "RVON"]  # valor_acordos desc

    by_conv = dispatch_tool(
        "list_agents_performance", {"order_by": "conversao_pct", "limit": 1}, SAMPLE_ENTRIES, _AGENTS
    )
    assert len(by_conv) == 1
    assert by_conv[0]["login"] == "RVON"  # 10% (2/20) > 3.09% (3/97)

    # order_by fora do enum (ex.: campo string) é rejeitado, não quebra o sort
    invalid = dispatch_tool("list_agents_performance", {"order_by": "login"}, SAMPLE_ENTRIES, _AGENTS)
    assert "error" in invalid
    assert "valor_acordos" in invalid["available_metrics"]


# ─── série temporal (_series_from_rows / _tendencia) ─────────────


def _daily_row(dia, status, qtd, valor):
    return {"dia": dia, "id_rec_status": status, "qtd": qtd, "valor": valor}


def test_series_valor_qtd_e_preenchimento_de_dias_vazios():
    rows = [
        _daily_row("2026-06-08", 1, 5, 500),
        _daily_row("2026-06-08", 2, 1, 100),
        _daily_row("2026-06-10", 1, 2, 200),
    ]
    valor = _series_from_rows(rows, "valor", "2026-06-08", "2026-06-10")
    # 09/06 sem linhas vira 0 (eixo contínuo); status 2 conta como gerado.
    assert valor == [
        {"data": "2026-06-08", "valor": 600.0},
        {"data": "2026-06-09", "valor": 0.0},
        {"data": "2026-06-10", "valor": 200.0},
    ]
    qtd = _series_from_rows(rows, "qtd", "2026-06-08", "2026-06-10")
    assert [p["valor"] for p in qtd] == [6, 0, 2]


def test_series_risco_e_max_sobre_universo_do_dia():
    # Dia: gerados 500 (com 100 de quebra), exceções 300, rejeitados 200.
    # Universo = 500 + 300 + 200 = 1000 → MAX(30, 10, 20) = 30.
    rows = [
        _daily_row("2026-06-10", 1, 4, 400),
        _daily_row("2026-06-10", 2, 1, 100),
        _daily_row("2026-06-10", 5, 1, 300),
        _daily_row("2026-06-10", 7, 1, 200),
    ]
    serie = _series_from_rows(rows, "risco", "2026-06-10", "2026-06-10")
    assert serie == [{"data": "2026-06-10", "valor": 30.0}]


def test_tendencia_crescente_decrescente_estavel():
    def pontos(valores):
        return [{"data": f"2026-06-{i + 1:02d}", "valor": v} for i, v in enumerate(valores)]

    tend, var = _tendencia(pontos([100, 100, 200, 200]))
    assert tend == "crescente"
    assert var == 100.0

    tend, _ = _tendencia(pontos([200, 200, 100, 100]))
    assert tend == "decrescente"

    tend, var = _tendencia(pontos([100, 100, 102, 101]))
    assert tend == "estavel"

    # 1ª metade zero: variação indefinida (None), nunca divisão por zero.
    tend, var = _tendencia(pontos([0, 0, 50, 50]))
    assert tend == "crescente"
    assert var is None


# ─── breakdown por status ────────────────────────────────────────


def test_status_breakdown_agrega_rotula_e_ordena_por_valor():
    rows = [
        _rollup_row("ALFA", 1, 5, 500),
        _rollup_row("BETA", 1, 3, 300),
        _rollup_row("ALFA", 5, 2, 900),
        _rollup_row("BETA", 7, 1, 100),
        _rollup_row("BETA", 99, 1, 50),  # status fora do universo é ignorado
    ]
    out = _status_breakdown_from_rows(rows, data_referencia="2026-06-10")
    assert [s["label"] for s in out["status"]] == ["PENDENTE (Exceção)", "ATIVO", "REJEITADO"]
    ativo = next(s for s in out["status"] if s["id_rec_status"] == 1)
    assert ativo["qtd"] == 8
    assert ativo["valor"] == 800.0
    assert out["total_qtd"] == 11
    assert out["total_valor"] == 1800.0
    assert out["data_referencia"] == "2026-06-10"


# ─── fases de negociação (_fase_summary) ─────────────────────────


def _fase_row(portfolio, fase, qtd, valor_aberto):
    return {"portfolio_name": portfolio, "fase": fase, "qtd": qtd, "valor_aberto": valor_aberto}


FASE_ROWS = [
    _fase_row("ALFA", "inicio", 6, 6000),
    _fase_row("ALFA", "final", 4, 1000),
    _fase_row("BETA", "final", 1, 3000),
    _fase_row("BETA", "quitado", 9, 0),
    _fase_row("GAMA", "fase-desconhecida", 5, 500),  # ignorada
]


def test_fase_summary_totais_e_percentuais():
    out = _fase_summary(FASE_ROWS, fase=None, data_referencia="2026-06-10")
    assert out["total_acordos"] == 20
    assert out["fases"]["inicio"] == {"qtd": 6, "valor_aberto": 6000.0, "percentual": 30.0}
    assert out["fases"]["final"] == {"qtd": 5, "valor_aberto": 4000.0, "percentual": 25.0}
    assert out["fases"]["quitado"]["qtd"] == 9
    assert out["fases"]["meio"]["qtd"] == 0
    assert "carteiras" not in out


def test_fase_summary_detalha_carteiras_da_fase():
    out = _fase_summary(FASE_ROWS, fase="final", data_referencia="2026-06-10")
    assert out["fase"] == "final"
    # ordenadas por valor_aberto desc; pct sobre os acordos da própria carteira
    assert [c["portfolio_name"] for c in out["carteiras"]] == ["BETA", "ALFA"]
    beta = out["carteiras"][0]
    assert beta["valor_aberto"] == 3000.0
    assert beta["pct_dos_acordos_da_carteira"] == 10.0  # 1 de 10
    alfa = out["carteiras"][1]
    assert alfa["pct_dos_acordos_da_carteira"] == 40.0  # 4 de 10


# ─── dispatch das tools com provider próprio ─────────────────────


def test_tools_com_provider_ausente_degradam_para_erro():
    for tool in ("get_ritmo_acordos_dia", "get_time_series", "get_acordo_status_breakdown", "get_fase_negociacao"):
        args = {"metric": "valor", "period": "7d"} if tool == "get_time_series" else {}
        result = dispatch_tool(tool, args, SAMPLE_ENTRIES, _NO_AGENTS)
        assert "error" in result


def test_tool_get_time_series_valida_e_resolve_carteira():
    seen = {}

    def fake_series(metric, period, portfolio):
        seen.update(metric=metric, period=period, portfolio=portfolio)
        return {"metric": metric}

    providers = {"get_time_series": fake_series}

    ok = dispatch_tool(
        "get_time_series", {"metric": "risco", "period": "30d", "portfolio": "gama"},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert ok == {"metric": "risco"}
    # nome parcial resolvido para o nome canônico do dataset da sessão
    assert seen["portfolio"] == "CARTEIRA GAMA"

    bad_metric = dispatch_tool(
        "get_time_series", {"metric": "ticket", "period": "7d"},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert "error" in bad_metric
    assert "valor" in bad_metric["available_metrics"]

    bad_period = dispatch_tool(
        "get_time_series", {"metric": "valor", "period": "15d"},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert "error" in bad_period

    missing_portfolio = dispatch_tool(
        "get_time_series", {"metric": "valor", "period": "7d", "portfolio": "nao-existe"},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert "error" in missing_portfolio
    assert "BANCO ALFA" in missing_portfolio["available_portfolios"]


def test_tool_get_fase_negociacao_valida_fase():
    calls = []
    providers = {"get_fase_negociacao": lambda fase: calls.append(fase) or {"ok": True}}

    sem_fase = dispatch_tool("get_fase_negociacao", {}, SAMPLE_ENTRIES, _NO_AGENTS, providers=providers)
    assert sem_fase == {"ok": True}
    com_fase = dispatch_tool("get_fase_negociacao", {"fase": "FINAL"}, SAMPLE_ENTRIES, _NO_AGENTS, providers=providers)
    assert com_fase == {"ok": True}
    assert calls == [None, "final"]

    invalida = dispatch_tool(
        "get_fase_negociacao", {"fase": "encerrado"}, SAMPLE_ENTRIES, _NO_AGENTS, providers=providers
    )
    assert "error" in invalida
    assert "final" in invalida["available_fases"]


def test_tools_sem_args_encaminham_para_provider():
    providers = {
        "get_ritmo_acordos_dia": lambda: {"acumulado_atual": 42},
        "get_acordo_status_breakdown": lambda: {"total_qtd": 7},
    }
    ritmo = dispatch_tool("get_ritmo_acordos_dia", {}, SAMPLE_ENTRIES, _NO_AGENTS, providers=providers)
    assert ritmo == {"acumulado_atual": 42}
    breakdown = dispatch_tool("get_acordo_status_breakdown", {}, SAMPLE_ENTRIES, _NO_AGENTS, providers=providers)
    assert breakdown == {"total_qtd": 7}


# ─── conversão de boletos (trim do ETL de efetividade) ───────────


def _ef_mensal_row(ano, mes, gerados, pagos, agente=None):
    row = {"Ano": ano, "Mes": mes, "Boletos_Gerados": gerados, "Pagos_No_Prazo": pagos,
           "Conversao_Prazo_5d": round(pagos * 100.0 / gerados, 2) if gerados else 0.0}
    if agente is not None:
        row["Agente"] = agente
    return row


def test_trim_mensal_janela_12_meses_e_total():
    rows = [_ef_mensal_row(2025, m, 100, 50) for m in range(1, 13)] + [
        _ef_mensal_row(2026, 1, 200, 100),
        _ef_mensal_row(2026, 2, 100, 80),
    ]
    out = _trim_mensal(rows)
    assert len(out["data"]) == 12
    assert out["data"][0] == {"ano": 2025, "mes": 3, "boletos_gerados": 100, "pagos_no_prazo": 50, "conversao_pct": 50.0}
    assert out["data"][-1]["mes"] == 2
    # total recalculado sobre a janela, não média das taxas
    assert out["total"] == {"boletos_gerados": 1300, "pagos_no_prazo": 680, "conversao_pct": 52.31}


def test_trim_diaria_janela_30_dias():
    rows = [{"Dia_Emissao": f"2026-05-{d:02d}", "Boletos_Gerados": 10, "Pagos_No_Prazo": 5,
             "Conversao_Prazo_5d": 50.0} for d in range(1, 32)] + [
        {"Dia_Emissao": "2026-06-01", "Boletos_Gerados": 20, "Pagos_No_Prazo": 20, "Conversao_Prazo_5d": 100.0},
    ]
    out = _trim_diaria(rows)
    assert len(out["data"]) == 30
    assert out["data"][-1] == {"dia": "2026-06-01", "boletos_gerados": 20, "pagos_no_prazo": 20, "conversao_pct": 100.0}
    assert out["data"][0]["dia"] == "2026-05-03"


def test_trim_por_agente_top_por_volume_e_filtro():
    rows = [
        _ef_mensal_row(2026, 4, 50, 10, agente="ADRIANNA SILVA"),
        _ef_mensal_row(2026, 5, 30, 15, agente="ADRIANNA SILVA"),
        _ef_mensal_row(2026, 5, 100, 20, agente="RONIE VON"),
        _ef_mensal_row(2026, 3, 999, 0, agente="ANTIGO"),
    ]
    # meses presentes na base: 2026-03/04/05 → janela de 3 meses cobre todos
    geral = _trim_por_agente(rows, agente=None)
    assert geral["meses_considerados"] == ["2026-03", "2026-04", "2026-05"]
    assert [a["agente"] for a in geral["data"]] == ["ANTIGO", "RONIE VON", "ADRIANNA SILVA"]
    adri = next(a for a in geral["data"] if a["agente"] == "ADRIANNA SILVA")
    assert adri == {"agente": "ADRIANNA SILVA", "boletos_gerados": 80, "pagos_no_prazo": 25, "conversao_pct": 31.25}

    um = _trim_por_agente(rows, agente="adrianna silva")
    assert um["agente"] == "ADRIANNA SILVA"
    assert um["total"]["boletos_gerados"] == 80

    nada = _trim_por_agente(rows, agente="inexistente")
    assert "error" in nada


# ─── cruzamento agente × carteira ────────────────────────────────


def _cross_row(agente, portfolio, status, qtd, valor):
    return {"agente": agente, "portfolio_name": portfolio, "id_rec_status": status, "qtd": qtd, "valor": valor}


def test_cruzamento_summary_agrupa_contraparte_por_dimensao():
    rows = [
        _cross_row("ADRI", "ALFA", 1, 5, 500),
        _cross_row("ADRI", "ALFA", 2, 1, 100),   # quebra conta como gerado E quebrado
        _cross_row("ADRI", "ALFA", 5, 2, 300),
        _cross_row("RVON", "ALFA", 1, 1, 900),
        _cross_row("RVON", "ALFA", 7, 1, 50),
    ]
    # filtro = carteira ALFA → contraparte = agente
    entries = _cruzamento_summary(rows, "agente", data_referencia="2026-06-10")
    assert [e["agente"] for e in entries] == ["RVON", "ADRI"]  # valor gerado desc
    adri = entries[1]
    assert adri["qtd_acordos"] == 6
    assert adri["valor_primeira_parcela"] == 600.0
    assert adri["valor_quebrados"] == 100.0
    assert adri["valor_excecoes"] == 300.0
    rvon = entries[0]
    assert rvon["valor_rejeitados"] == 50.0


# ─── maiores acordos (detalhe) ───────────────────────────────────


def test_maiores_por_valor_total_ordena_e_limita():
    rows = [
        {"NR_RECEBIMENTO": 1, "valor_primeira_parcela": 100, "valor_total": 1200, "total_parcelas": 12,
         "agente": "ADRI", "nome_devedor": "FULANO", "cpf_mask": "123.***.***-99",
         "data_acordo": "2026-06-10", "data_vencimento": "2026-06-15"},
        {"NR_RECEBIMENTO": 2, "valor_primeira_parcela": 900, "valor_total": 900, "total_parcelas": 1,
         "agente": "RVON", "nome_devedor": "BELTRANO", "cpf_mask": "456.***.***-11",
         "data_acordo": "2026-06-10", "data_vencimento": "2026-06-12"},
        {"NR_RECEBIMENTO": 3, "valor_primeira_parcela": 50, "valor_total": 5000, "total_parcelas": 10,
         "agente": "ADRI", "nome_devedor": "CICLANO", "cpf_mask": "789.***.***-22",
         "data_acordo": "2026-06-10", "data_vencimento": "2026-07-10"},
    ]
    top2 = _maiores_por_valor_total(rows, limit=2)
    assert [a["nr_recebimento"] for a in top2] == [3, 1]  # valor_total desc, não 1ª parcela
    assert top2[0]["valor_total"] == 5000.0
    assert top2[0]["cpf_mask"] == "789.***.***-22"


# ─── dispatch das tools novas (conversão / cruzamento / ranking / maiores) ───


def test_tool_conversao_valida_visao_e_resolve_agente():
    seen = {}
    providers = {"get_efetividade_conversao": lambda visao, agente: seen.update(visao=visao, agente=agente) or {"ok": 1}}

    ok = dispatch_tool("get_efetividade_conversao", {"visao": "mensal"}, SAMPLE_ENTRIES, _AGENTS, providers=providers)
    assert ok == {"ok": 1}
    assert seen == {"visao": "mensal", "agente": None}

    com_agente = dispatch_tool(
        "get_efetividade_conversao", {"visao": "por_agente", "agent_name": "rvon"},
        SAMPLE_ENTRIES, _AGENTS, providers=providers,
    )
    assert com_agente == {"ok": 1}
    assert seen["agente"] == "RONIE VON"

    invalida = dispatch_tool("get_efetividade_conversao", {"visao": "anual"}, SAMPLE_ENTRIES, _AGENTS, providers=providers)
    assert "error" in invalida


def test_tool_cruzamento_exige_exatamente_um_lado():
    seen = {}
    providers = {"get_cruzamento_agente_carteira": lambda p, a: seen.update(p=p, a=a) or {"ok": 1}}

    nenhum = dispatch_tool("get_cruzamento_agente_carteira", {}, SAMPLE_ENTRIES, _AGENTS, providers=providers)
    assert "error" in nenhum
    ambos = dispatch_tool(
        "get_cruzamento_agente_carteira", {"portfolio": "alfa", "agent_name": "rvon"},
        SAMPLE_ENTRIES, _AGENTS, providers=providers,
    )
    assert "error" in ambos

    por_carteira = dispatch_tool(
        "get_cruzamento_agente_carteira", {"portfolio": "gama"}, SAMPLE_ENTRIES, _AGENTS, providers=providers
    )
    assert por_carteira == {"ok": 1}
    assert seen == {"p": "CARTEIRA GAMA", "a": None}

    por_agente = dispatch_tool(
        "get_cruzamento_agente_carteira", {"agent_name": "adrianna"}, SAMPLE_ENTRIES, _AGENTS, providers=providers
    )
    assert por_agente == {"ok": 1}
    assert seen == {"p": None, "a": "ADRIANNA SILVA"}


def test_tool_ranking_dimensao_e_limite():
    seen = {}
    providers = {"get_ranking_agentes_por_dimensao": lambda d, l: seen.update(d=d, l=l) or {"ok": 1}}

    ok = dispatch_tool(
        "get_ranking_agentes_por_dimensao", {"dimensao": "quebrados", "limit": 999},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert ok == {"ok": 1}
    assert seen == {"d": "quebrados", "l": 50}  # clamp

    invalida = dispatch_tool(
        "get_ranking_agentes_por_dimensao", {"dimensao": "ticket"}, SAMPLE_ENTRIES, _NO_AGENTS, providers=providers
    )
    assert "error" in invalida
    assert "gerados" in invalida["available_dimensoes"]


def test_tool_maiores_acordos_valida_tipo_e_carteira():
    seen = {}
    providers = {"get_maiores_acordos": lambda t, p, l: seen.update(t=t, p=p, l=l) or {"ok": 1}}

    ok = dispatch_tool(
        "get_maiores_acordos", {"tipo": "excecoes", "portfolio": "beta", "limit": 99},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert ok == {"ok": 1}
    assert seen == {"t": "excecoes", "p": "BANCO BETA", "l": 20}  # clamp 20

    tipo_ruim = dispatch_tool(
        "get_maiores_acordos", {"tipo": "pagos", "portfolio": "beta"}, SAMPLE_ENTRIES, _NO_AGENTS, providers=providers
    )
    assert "error" in tipo_ruim

    carteira_ruim = dispatch_tool(
        "get_maiores_acordos", {"tipo": "acordos", "portfolio": "nao-existe"},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert "error" in carteira_ruim
    assert "BANCO ALFA" in carteira_ruim["available_portfolios"]


def test_tool_list_agents_aceita_novas_metricas():
    por_ticket = dispatch_tool(
        "list_agents_performance", {"order_by": "ticket_medio", "limit": 1}, SAMPLE_ENTRIES, _AGENTS
    )
    assert len(por_ticket) == 1
    assert por_ticket[0]["login"] == "RVON"  # 4500 > 4025


# ─── parsing / normalização da resposta final ────────────────────


def test_parse_final_json_valido():
    raw = (
        '{"text": "ok", "highlights": [{"type": "anomaly", "label": "GAMA", "value": "180%"}],'
        ' "suggested_actions": [{"label": "Ver alto risco", "prompt": "carteiras de alto risco"}],'
        ' "data_sources": ["filter_portfolios_by_risk"], "confidence": "high"}'
    )
    parsed = _parse_agent_final_text(raw)
    assert parsed["text"] == "ok"
    assert parsed["highlights"] == [{"type": "anomaly", "label": "GAMA", "value": "180%"}]
    assert parsed["suggested_actions"] == [{"label": "Ver alto risco", "prompt": "carteiras de alto risco"}]
    assert parsed["confidence"] == "high"


def test_parse_final_json_com_cerca_de_codigo():
    raw = '```json\n{"text": "cercado", "confidence": "medium"}\n```'
    parsed = _parse_agent_final_text(raw)
    assert parsed["text"] == "cercado"
    assert parsed["confidence"] == "medium"


def test_parse_final_texto_invalido_degrada_para_low():
    parsed = _parse_agent_final_text("resposta solta sem json")
    assert parsed["text"] == "resposta solta sem json"
    assert parsed["confidence"] == "low"
    assert parsed["highlights"] == []


def test_parse_final_normaliza_tipos_invalidos():
    raw = (
        '{"text": "x", "highlights": [{"type": "estranho", "label": "L"}, {"label": ""}],'
        ' "suggested_actions": [{"label": "Sem prompt"}], "confidence": "talvez"}'
    )
    parsed = _parse_agent_final_text(raw)
    assert parsed["highlights"] == [{"type": "metric", "label": "L"}]
    assert parsed["suggested_actions"] == [{"label": "Sem prompt"}]
    assert parsed["confidence"] == "low"


# ─── run_agent: loop de tool-calling com SDK e SQL stubados ──────


class _Block:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class _FakeResponse:
    def __init__(self, stop_reason, content):
        self.stop_reason = stop_reason
        self.content = content


def _stub_dataset(monkeypatch):
    rollup_rows = [
        _rollup_row("BANCO BETA", 1, 5, 500),
        _rollup_row("BANCO BETA", 2, 3, 300),
    ]
    monkeypatch.setattr(risco_mod, "run_query", lambda *a, **k: rollup_rows)
    monkeypatch.setattr(risco_mod.cache_manager, "_ttl", 0)  # sem cache entre testes


def test_run_agent_loop_anthropic_offline(monkeypatch):
    """user → modelo pede tool → dispatch → modelo responde JSON final."""
    final_json = (
        '{"text": "BANCO BETA é a de maior risco.",'
        ' "highlights": [{"type": "portfolio", "label": "BANCO BETA"}],'
        ' "suggested_actions": [], "data_sources": ["filter_portfolios_by_risk"],'
        ' "confidence": "high"}'
    )
    responses = [
        _FakeResponse("tool_use", [
            _Block(type="tool_use", id="tu_1", name="filter_portfolios_by_risk", input={"level": "medio"}),
        ]),
        _FakeResponse("end_turn", [_Block(type="text", text=final_json)]),
    ]
    seen_requests = []

    class _FakeMessages:
        def create(self, **kwargs):
            seen_requests.append(kwargs)
            return responses[len(seen_requests) - 1]

    client_kwargs = {}

    class _FakeAnthropic:
        def __init__(self, api_key, **kwargs):
            client_kwargs.update(kwargs)
            self.messages = _FakeMessages()

    fake_sdk = types.ModuleType("anthropic")
    fake_sdk.Anthropic = _FakeAnthropic
    fake_sdk.APIError = type("APIError", (Exception,), {})
    monkeypatch.setitem(sys.modules, "anthropic", fake_sdk)
    monkeypatch.setattr(settings, "AGENT_PROVIDER", "anthropic")
    _stub_dataset(monkeypatch)

    result = run_agent(
        [{"role": "user", "content": "qual a carteira de maior risco?"}],
        "todos", "2026-06-10", "2026-06-10",
    )

    assert result["text"] == "BANCO BETA é a de maior risco."
    assert result["confidence"] == "high"
    assert result["data_referencia"] == "2026-06-10"

    # sem timeout explícito o SDK usa 600s com retries e prende uma thread do pool
    assert client_kwargs["timeout"] == settings.AGENT_HTTP_TIMEOUT_SECONDS
    assert client_kwargs["max_retries"] == 1

    # segunda chamada carrega o tool_result do dispatch real
    second = seen_requests[1]["messages"]
    assert second[-1]["role"] == "user"
    tool_result = second[-1]["content"][0]
    assert tool_result["type"] == "tool_result"
    assert tool_result["tool_use_id"] == "tu_1"
    assert "BANCO BETA" in tool_result["content"]

    # contrato da chamada: tools e system prompt com data de referência
    assert seen_requests[0]["tools"] is AGENT_TOOLS
    assert "2026-06-10" in seen_requests[0]["system"]


def test_run_agent_loop_deepseek_offline(monkeypatch):
    """Mesmo fluxo no formato OpenAI-compatível usado pelo DeepSeek."""
    final_json = '{"text": "Apenas BANCO BETA está em risco médio.", "confidence": "high"}'

    class _ToolFn:
        name = "filter_portfolios_by_risk"
        arguments = '{"level": "medio"}'

    class _ToolCall:
        id = "call_1"
        function = _ToolFn()

    fake_responses = [
        _Block(choices=[_Block(message=_Block(content=None, tool_calls=[_ToolCall()]))]),
        _Block(choices=[_Block(message=_Block(content=final_json, tool_calls=None))]),
    ]
    seen_requests = []

    client_kwargs = {}

    class _FakeCompletions:
        def create(self, **kwargs):
            seen_requests.append(kwargs)
            return fake_responses[len(seen_requests) - 1]

    class _FakeOpenAIClient:
        def __init__(self, api_key, base_url, **kwargs):
            client_kwargs.update(kwargs)
            self.chat = _Block(completions=_FakeCompletions())

    fake_sdk = types.ModuleType("openai")
    fake_sdk.OpenAI = _FakeOpenAIClient
    fake_sdk.OpenAIError = type("OpenAIError", (Exception,), {})
    monkeypatch.setitem(sys.modules, "openai", fake_sdk)
    monkeypatch.setattr(settings, "AGENT_PROVIDER", "deepseek")
    monkeypatch.setattr(settings, "AGENT_MODEL", "deepseek-chat")
    _stub_dataset(monkeypatch)

    result = run_agent(
        [{"role": "user", "content": "alguma carteira em risco médio?"}],
        "todos", "2026-06-10", "2026-06-10",
    )

    assert result["text"] == "Apenas BANCO BETA está em risco médio."
    assert result["confidence"] == "high"

    # sem timeout explícito o SDK usa 600s com retries e prende uma thread do pool
    assert client_kwargs["timeout"] == settings.AGENT_HTTP_TIMEOUT_SECONDS
    assert client_kwargs["max_retries"] == 1

    # primeira chamada: system como primeira mensagem + tools no formato OpenAI
    first = seen_requests[0]
    assert first["messages"][0]["role"] == "system"
    assert "2026-06-10" in first["messages"][0]["content"]
    assert first["tools"][0]["type"] == "function"
    assert first["tools"][0]["function"]["name"] == "get_portfolio_metrics"

    # segunda chamada: tool_result no formato role=tool com o dispatch real
    second = seen_requests[1]["messages"]
    assert second[-1]["role"] == "tool"
    assert second[-1]["tool_call_id"] == "call_1"
    assert "BANCO BETA" in second[-1]["content"]
