"""
Testes do agente de carteiras (/agente/chat) — sem rede e sem banco.

Cobrem as funções puras (risco, tools, parsing) e o loop de tool-calling
completo com SDKs stubados (Anthropic e DeepSeek/OpenAI).
"""
import json
import sys
import types
from datetime import date, timedelta

import config.settings as settings
from dominios.agente import risco as risco_mod
from dominios.agente.agente import _compact_anthropic_convo, _compact_deepseek_convo, _parse_agent_final_text, run_agent
from dominios.agente.agentes import _agent_entries_from_rows
from dominios.agente.conversao import _trim_diaria, _trim_mensal, _trim_por_agente
from dominios.agente.cruzamento import _cruzamento_summary
from dominios.agente.detalhe_portfolio import _find_portfolio_name, _mask_cpf
from dominios.agente.fases import _fase_summary
from dominios.agente.kpi_historico import _rebucket
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
    assert "aviso_ambiguidade" not in exact

    partial = dispatch_tool("get_portfolio_metrics", {"portfolio_name": "gama"}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert partial["portfolio_name"] == "CARTEIRA GAMA"
    assert "aviso_ambiguidade" not in partial

    missing = dispatch_tool("get_portfolio_metrics", {"portfolio_name": "inexistente"}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert "error" in missing
    assert "BANCO ALFA" in missing["available_portfolios"]


def test_tool_get_portfolio_metrics_substring_ambigua_declara_outras_correspondencias():
    """
    Regressão de achado ao vivo (pt5 handoff, T6): "bv" resolvia em silêncio
    pra BVFinanceira III (primeira correspondência por trecho), escondendo
    BVFinanceira IV e VII, com confidence=high - nenhum sinal de que a busca
    era ambígua. "banco" aqui bate em BANCO ALFA e BANCO BETA (SAMPLE_ENTRIES).
    """
    ambiguo = dispatch_tool("get_portfolio_metrics", {"portfolio_name": "banco"}, SAMPLE_ENTRIES, _NO_AGENTS)
    # ainda devolve a primeira correspondência como dado usável...
    assert ambiguo["portfolio_name"] == "BANCO ALFA"
    # ...mas com um aviso citando a outra carteira que também combina.
    assert "aviso_ambiguidade" in ambiguo
    assert "BANCO BETA" in ambiguo["aviso_ambiguidade"]


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


def test_tool_explicar_metrica():
    known = dispatch_tool("explicar_metrica", {"termo": "risco_composto_formula"}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert known["tipo"] == "kpi"
    assert "MAX" in known["formula"]

    aliased = dispatch_tool("explicar_metrica", {"termo": "CPC"}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert aliased["tipo"] == "kpi"

    status_termo = dispatch_tool("explicar_metrica", {"termo": "excecao"}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert status_termo["tipo"] == "status"
    assert status_termo["valores"] == [5]
    assert "caveat" in status_termo

    unknown = dispatch_tool("explicar_metrica", {"termo": "nao-existe"}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert unknown["ok"] is False
    assert unknown["error_type"] == "validation"
    assert "denominador" in unknown["termos_disponiveis"]

    invalid = dispatch_tool("explicar_metrica", {"termo": ""}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert invalid["ok"] is False
    assert invalid["error_type"] == "validation"


def test_tool_desconhecida():
    result = dispatch_tool("tool_que_nao_existe", {}, SAMPLE_ENTRIES, _NO_AGENTS)
    assert result["ok"] is False
    assert result["error_type"] == "unknown_tool"
    assert result["retryable"] is False
    assert "get_portfolio_metrics" in result["available_tools"]


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
    assert adri["conversao_pct"] == 12.37      # 12 acordos / 97 CPC — Conversão oficial
    assert adri["pagos_por_cpc_pct"] == 3.09   # 3 pagos / 97 CPC — métrica distinta
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
    assert by_conv[0]["login"] == "ADRI"  # 12.37% (12/97) > 10% (2/20)

    # A métrica antiga continua disponível sob o nome correto — e ordena diferente,
    # que é justamente o motivo de as duas não poderem dividir um nome.
    by_pagos = dispatch_tool(
        "list_agents_performance", {"order_by": "pagos_por_cpc_pct", "limit": 1}, SAMPLE_ENTRIES, _AGENTS
    )
    assert by_pagos[0]["login"] == "RVON"  # 10% (2/20) > 3.09% (3/97)

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
    for tool in ("get_ritmo_acordos_dia", "get_acordo_status_breakdown", "get_fase_negociacao"):
        result = dispatch_tool(tool, {}, SAMPLE_ENTRIES, _NO_AGENTS)
        assert "error" in result


_KPI_ARGS = {"db": "COBwebRCBAUTOS", "kpi": "qtd_acordos", "date_from": "2026-08-01", "date_to": "2026-08-10"}


def test_tool_query_kpi_historico_valida_e_despacha():
    seen = {}

    def fake_kpi(**kwargs):
        seen.update(kwargs)
        return {"kpi": kwargs["kpi"]}

    providers = {"query_kpi_historico": fake_kpi}

    ok = dispatch_tool("query_kpi_historico", _KPI_ARGS, SAMPLE_ENTRIES, _NO_AGENTS, providers=providers)
    assert ok == {"kpi": "qtd_acordos"}
    assert seen == {
        "db": "COBwebRCBAUTOS", "kpi": "qtd_acordos",
        "date_from": "2026-08-01", "date_to": "2026-08-10",
        "granularidade": "dia", "page": 1, "portfolio": None,
    }

    bad_kpi = dispatch_tool(
        "query_kpi_historico", {**_KPI_ARGS, "kpi": "taxa_contato_pct"},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert bad_kpi["ok"] is False
    assert bad_kpi["error_type"] == "validation"

    janela_grande = dispatch_tool(
        "query_kpi_historico", {**_KPI_ARGS, "date_from": "2026-01-01"},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert janela_grande["ok"] is False

    # portfolio (achado da sessão de teste ao vivo) é campo real agora — passa
    # direto pro provider, não é mais rejeitado como extra="forbid".
    com_portfolio = dispatch_tool(
        "query_kpi_historico", {**_KPI_ARGS, "portfolio": "gama"},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert com_portfolio == {"kpi": "qtd_acordos"}
    assert seen["portfolio"] == "gama"

    extra_forbidden = dispatch_tool(
        "query_kpi_historico", {**_KPI_ARGS, "banco_extra": "x"},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert extra_forbidden["ok"] is False
    assert extra_forbidden["error_type"] == "validation"


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



# ─── dispatch das tools novas (conversão / cruzamento / ranking / maiores) ───


_COMPARAR_ARGS = {
    "db": "COBwebRCBAUTOS", "date_from": "2026-08-01", "date_to": "2026-08-10",
    "metricas": ["qtd_acordos", "valor_primeira_parcela"],
}


def test_tool_comparar_agentes():
    providers = {"comparar_agentes": lambda **kwargs: SAMPLE_AGENTS}

    ok = dispatch_tool(
        "comparar_agentes", {**_COMPARAR_ARGS, "agent_keys": ["ADRI", "RVON"]},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    by_login = {a["login"]: a for a in ok["agentes"]}
    assert by_login["ADRI"]["qtd_acordos"] == 12
    assert by_login["RVON"]["valor_primeira_parcela"] == 2000.0

    # alias de nome de negócio -> campo real do AgentEntry
    aliased = dispatch_tool(
        "comparar_agentes",
        {**_COMPARAR_ARGS, "agent_keys": ["ADRI", "RVON"], "metricas": ["qtd_contatos_cpc", "taxa_conversao_pct"]},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    adri = next(a for a in aliased["agentes"] if a["login"] == "ADRI")
    assert adri["qtd_contatos_cpc"] == 97          # mapeado de qtd_contatos
    assert adri["taxa_conversao_pct"] == 12.37     # mapeado de conversao_pct

    missing = dispatch_tool(
        "comparar_agentes", {**_COMPARAR_ARGS, "agent_keys": ["ADRI", "nao-existe"]},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert missing["ok"] is False
    assert "não encontrado" in missing["hint"]

    sistema = dispatch_tool(
        "comparar_agentes", {**_COMPARAR_ARGS, "agent_keys": ["ADRI", "COBDESANTOS"]},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert sistema["ok"] is False
    assert "conta de sistema" in sistema["hint"]

    too_few = dispatch_tool(
        "comparar_agentes", {**_COMPARAR_ARGS, "agent_keys": ["ADRI"]},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert too_few["ok"] is False
    assert too_few["error_type"] == "validation"


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


def test_tool_cruzamento_carteira_ambigua_declara_outras_correspondencias():
    """Mesma regressão T6 do get_portfolio_metrics, aplicada ao outro
    dispatch branch que resolve carteira por trecho (`_find_portfolio`)."""
    providers = {"get_cruzamento_agente_carteira": lambda p, a: {"portfolio": p, "ok": 1}}

    resultado = dispatch_tool(
        "get_cruzamento_agente_carteira", {"portfolio": "banco"}, SAMPLE_ENTRIES, _AGENTS, providers=providers
    )
    assert resultado["portfolio"] == "BANCO ALFA"
    assert "aviso_ambiguidade" in resultado
    assert "BANCO BETA" in resultado["aviso_ambiguidade"]


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


_DETALHAR_ARGS = {"db": "COBwebRCBAUTOS", "portfolio": "beta", "date_from": "2026-08-01", "date_to": "2026-08-10"}


def test_tool_detalhar_portfolio_valida_e_despacha():
    seen = {}

    def fake_detalhe(**kwargs):
        seen.update(kwargs)
        return {"ok": 1}

    providers = {"detalhar_portfolio": fake_detalhe}

    ok = dispatch_tool(
        "detalhar_portfolio", {**_DETALHAR_ARGS, "drilldown": "excecao"},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert ok == {"ok": 1}
    assert seen == {
        "db": "COBwebRCBAUTOS", "portfolio": "beta",
        "date_from": "2026-08-01", "date_to": "2026-08-10",
        "drilldown": "excecao", "page": 1, "page_size": 25,
    }

    default_drilldown = dispatch_tool("detalhar_portfolio", _DETALHAR_ARGS, SAMPLE_ENTRIES, _NO_AGENTS, providers=providers)
    assert default_drilldown == {"ok": 1}
    assert seen["drilldown"] == "resumo"

    tipo_ruim = dispatch_tool(
        "detalhar_portfolio", {**_DETALHAR_ARGS, "drilldown": "pagos"},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert tipo_ruim["ok"] is False

    # vencimentos (achado da sessão de teste ao vivo, Q2/Q3): drilldown novo,
    # sem parâmetro extra no schema — só precisa validar como Literal aceito.
    vencimentos = dispatch_tool(
        "detalhar_portfolio", {**_DETALHAR_ARGS, "drilldown": "vencimentos"},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert vencimentos == {"ok": 1}
    assert seen["drilldown"] == "vencimentos"
    assert tipo_ruim["error_type"] == "validation"

    page_size_ruim = dispatch_tool(
        "detalhar_portfolio", {**_DETALHAR_ARGS, "page_size": 99},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert page_size_ruim["ok"] is False


def test_tool_detalhar_portfolio_vencimentos_sem_portfolio_vira_ranking():
    """T3 (pt5-live-testing.md, Cluster G): portfolio omitido + drilldown
    'vencimentos' despacha em modo ranking (todas as carteiras) - nos outros
    5 drilldowns, portfolio continua obrigatório."""
    seen = {}

    def fake_detalhe(**kwargs):
        seen.update(kwargs)
        return {"ok": 1}

    providers = {"detalhar_portfolio": fake_detalhe}
    sem_portfolio = {k: v for k, v in _DETALHAR_ARGS.items() if k != "portfolio"}

    ranking = dispatch_tool(
        "detalhar_portfolio", {**sem_portfolio, "drilldown": "vencimentos"},
        SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
    )
    assert ranking == {"ok": 1}
    assert seen["portfolio"] is None
    assert seen["drilldown"] == "vencimentos"

    for drilldown in ("resumo", "aprovados", "excecao", "rejeitado", "quebrado"):
        sem_portfolio_ruim = dispatch_tool(
            "detalhar_portfolio", {**sem_portfolio, "drilldown": drilldown},
            SAMPLE_ENTRIES, _NO_AGENTS, providers=providers,
        )
        assert sem_portfolio_ruim["ok"] is False
        assert sem_portfolio_ruim["error_type"] == "validation"


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


def test_parse_final_json_com_prosa_antes_e_quebra_de_linha_crua_no_texto():
    """
    Repro do achado live (pt5-live-testing.md): DeepSeek às vezes prefixa a
    resposta final com prosa antes da cerca ```json, E escreve uma quebra de
    linha crua (não escapada) dentro do valor de "text" ao gerar markdown
    multi-parágrafo. json.loads(strict=True, o default) rejeita isso com
    "Invalid control character" -> payload=None -> todo o blob (prosa + JSON
    cru) vira o "text" da resposta, highlights/data_sources somem e confidence
    degrada pra "low", mesmo com o dado real intacto. strict=False resolve.
    """
    raw = (
        "Aqui está a evolução:\n\n"
        "```json\n"
        '{"text": "Parágrafo um.\n\nParágrafo dois.", "confidence": "high",'
        ' "highlights": [], "suggested_actions": [], "data_sources": ["query_kpi_historico"]}\n'
        "```"
    )
    parsed = _parse_agent_final_text(raw)
    assert parsed["confidence"] == "high"
    assert parsed["data_sources"] == ["query_kpi_historico"]
    assert "Parágrafo um." in parsed["text"]
    assert "```" not in parsed["text"]


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


def test_run_agent_ancora_ontem_na_data_real_do_sistema_nao_no_periodo_filtrado(monkeypatch):
    """
    Regressão de achado ao vivo (pt5 handoff, Cluster M): com o período filtrado
    da sessão diferente de hoje real (ex.: usuário olhando um dia passado no
    dashboard e perguntando "ontem" no chat), o contexto injetado só fixava a
    data real de "hoje" - "ontem" ficava por conta do cálculo do modelo, que
    errou ~1 em cada 3 repetições ao vivo (ancorou no dia anterior ao período
    filtrado, não ao dia anterior a hoje real). Fixa as duas datas explícitas
    no prompt para o modelo não precisar calcular nenhuma delas.
    """
    final_json = '{"text": "ok", "confidence": "high"}'

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

    class _FakeCompletions:
        def create(self, **kwargs):
            seen_requests.append(kwargs)
            return fake_responses[len(seen_requests) - 1]

    class _FakeOpenAIClient:
        def __init__(self, api_key, base_url, **kwargs):
            self.chat = _Block(completions=_FakeCompletions())

    fake_sdk = types.ModuleType("openai")
    fake_sdk.OpenAI = _FakeOpenAIClient
    fake_sdk.OpenAIError = type("OpenAIError", (Exception,), {})
    monkeypatch.setitem(sys.modules, "openai", fake_sdk)
    monkeypatch.setattr(settings, "AGENT_PROVIDER", "deepseek")
    monkeypatch.setattr(settings, "AGENT_MODEL", "deepseek-chat")
    _stub_dataset(monkeypatch)

    # Período filtrado da sessão é uma data passada, diferente de hoje real -
    # exatamente o cenário em que o bug apareceu ao vivo.
    dia_filtrado_passado = (date.today() - timedelta(days=5)).isoformat()
    run_agent(
        [{"role": "user", "content": "o que aconteceu ontem?"}],
        "todos", dia_filtrado_passado, dia_filtrado_passado,
    )

    system_content = seen_requests[0]["messages"][0]["content"]
    hoje_real = date.today().isoformat()
    ontem_real = (date.today() - timedelta(days=1)).isoformat()
    assert f"Data real de hoje (sistema): {hoje_real}" in system_content
    assert f"Data real de ontem (sistema): {ontem_real}" in system_content


def test_run_agent_loop_anthropic_forces_final_when_rounds_exhausted(monkeypatch):
    """Regressão: modelo que encadeia tool_use em toda rodada não pode devolver
    resposta vazia quando AGENT_MAX_TOOL_ITERS esgota antes do RunGuard (steps<10,
    wall_clock<90s) forçar final sozinho — a última rodada permitida precisa
    sempre virar uma chamada sem `tools` (nudge de final forçado)."""
    monkeypatch.setattr(settings, "AGENT_MAX_TOOL_ITERS", 2)
    final_json = '{"text": "Só consegui apurar parte dos dados.", "confidence": "low"}'
    tool_use_response = _FakeResponse("tool_use", [
        _Block(type="tool_use", id="tu_x", name="filter_portfolios_by_risk", input={"level": "medio"}),
    ])
    final_response = _FakeResponse("end_turn", [_Block(type="text", text=final_json)])
    seen_requests = []

    class _FakeMessages:
        def create(self, **kwargs):
            seen_requests.append(kwargs)
            return final_response if "tools" not in kwargs else tool_use_response

    class _FakeAnthropic:
        def __init__(self, api_key, **kwargs):
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

    assert result["text"] == "Só consegui apurar parte dos dados."
    assert len(seen_requests) == 3  # 2 rodadas de tool + 1 forçada
    assert "tools" not in seen_requests[-1]  # última rodada é a chamada forçada, sem tools


def test_run_agent_loop_deepseek_forces_final_when_rounds_exhausted(monkeypatch):
    """Mesma regressão no formato OpenAI-compatível usado pelo DeepSeek."""
    monkeypatch.setattr(settings, "AGENT_MAX_TOOL_ITERS", 2)

    class _ToolFn:
        name = "filter_portfolios_by_risk"
        arguments = '{"level": "medio"}'

    class _ToolCall:
        id = "call_x"
        function = _ToolFn()

    final_json = '{"text": "Só consegui apurar parte dos dados.", "confidence": "low"}'
    tool_use_response = _Block(choices=[_Block(message=_Block(content=None, tool_calls=[_ToolCall()]))])
    final_response = _Block(choices=[_Block(message=_Block(content=final_json, tool_calls=None))])
    seen_requests = []

    class _FakeCompletions:
        def create(self, **kwargs):
            seen_requests.append(kwargs)
            return final_response if "tools" not in kwargs else tool_use_response

    class _FakeOpenAIClient:
        def __init__(self, api_key, base_url, **kwargs):
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

    assert result["text"] == "Só consegui apurar parte dos dados."
    assert len(seen_requests) == 3
    assert "tools" not in seen_requests[-1]


def test_run_agent_loop_anthropic_forces_final_nao_duplica_role_user(monkeypatch):
    """
    Achado #3 do review pt4 — regressão do próprio fix de round-exhaustion
    (pt3): force-final sempre dispara depois de pelo menos uma rodada de tool
    já ter anexado {"role": "user", "content": tool_results} em convo. Anexar
    OUTRA mensagem "user" pro nudge de força-final cria duas mensagens "user"
    consecutivas, que a API real da Anthropic rejeita (alternância estrita de
    role). O fake client aqui não valida isso sozinho — por isso o teste de
    round-exhaustion do pt3 (que só confere len(seen_requests) e ausência de
    "tools") não pegou a regressão. A prova é inspecionar a lista de
    mensagens enviada na última chamada e confirmar que nenhum par
    consecutivo repete role.
    """
    monkeypatch.setattr(settings, "AGENT_MAX_TOOL_ITERS", 2)
    final_json = '{"text": "Só consegui apurar parte dos dados.", "confidence": "low"}'
    tool_use_response = _FakeResponse("tool_use", [
        _Block(type="tool_use", id="tu_x", name="filter_portfolios_by_risk", input={"level": "medio"}),
    ])
    final_response = _FakeResponse("end_turn", [_Block(type="text", text=final_json)])
    seen_requests = []

    class _FakeMessages:
        def create(self, **kwargs):
            seen_requests.append(kwargs)
            return final_response if "tools" not in kwargs else tool_use_response

    class _FakeAnthropic:
        def __init__(self, api_key, **kwargs):
            self.messages = _FakeMessages()

    fake_sdk = types.ModuleType("anthropic")
    fake_sdk.Anthropic = _FakeAnthropic
    fake_sdk.APIError = type("APIError", (Exception,), {})
    monkeypatch.setitem(sys.modules, "anthropic", fake_sdk)
    monkeypatch.setattr(settings, "AGENT_PROVIDER", "anthropic")
    _stub_dataset(monkeypatch)

    run_agent(
        [{"role": "user", "content": "qual a carteira de maior risco?"}],
        "todos", "2026-06-10", "2026-06-10",
    )

    ultima_convo = seen_requests[-1]["messages"]
    roles = [m["role"] if isinstance(m, dict) else getattr(m, "role", None) for m in ultima_convo]
    for anterior, atual in zip(roles, roles[1:]):
        assert anterior != atual, f"roles consecutivos repetidos: {roles}"


# ─── kpi_historico._rebucket (P1: query_kpi_historico) ────────────


def test_rebucket_dia_e_identidade():
    points = [{"data": "2026-08-01", "valor": 10.0}, {"data": "2026-08-02", "valor": 20.0}]
    assert _rebucket(points, "valor_acordos_gerados", "dia") == points


def test_rebucket_semana_soma_valor_e_qtd():
    # 2026-08-03 é segunda; 01-02/ago (sáb/dom) caem na semana anterior, cuja
    # segunda-feira é 2026-07-27.
    points = [
        {"data": "2026-08-01", "valor": 10.0},
        {"data": "2026-08-02", "valor": 5.0},
        {"data": "2026-08-03", "valor": 7.0},
        {"data": "2026-08-04", "valor": 3.0},
    ]
    out = {p["data"]: p["valor"] for p in _rebucket(points, "valor_acordos_gerados", "semana")}
    assert out["2026-07-27"] == 15.0
    assert out["2026-08-03"] == 10.0


def test_rebucket_risco_usa_maximo_nao_soma():
    points = [{"data": "2026-08-01", "valor": 30.0}, {"data": "2026-08-02", "valor": 80.0}]
    out = _rebucket(points, "risco_composto_pct", "mes")
    assert out == [{"data": "2026-08-01", "valor": 80.0}]


def test_rebucket_qtd_acordos_vira_int():
    points = [{"data": "2026-08-01", "valor": 3}, {"data": "2026-08-02", "valor": 4}]
    out = _rebucket(points, "qtd_acordos", "mes")
    assert out == [{"data": "2026-08-01", "valor": 7}]
    assert isinstance(out[0]["valor"], int)


# ─── detalhe_portfolio (P1: detalhar_portfolio) ────────────────────


def test_mask_cpf_preserva_esquema_historico():
    assert _mask_cpf("12345678999") == "123.***.***-99"
    assert _mask_cpf("123.456.789-99") == "123.***.***-99"
    assert _mask_cpf("") == "***"
    assert _mask_cpf(None) == "***"


def test_find_portfolio_name_exato_e_substring():
    entries = [{"portfolio_name": "BANCO ALFA"}, {"portfolio_name": "CARTEIRA GAMA"}]
    assert _find_portfolio_name("banco alfa", entries) == "BANCO ALFA"
    assert _find_portfolio_name("gama", entries) == "CARTEIRA GAMA"
    assert _find_portfolio_name("nao-existe", entries) is None


# ─── compaction de contexto (P3: _compact_deepseek_convo / _compact_anthropic_convo) ─


def _deepseek_tool_call(call_id, name):
    return _Block(id=call_id, function=_Block(name=name, arguments="{}"))


def _deepseek_assistant_msg(call_id, name):
    return _Block(role="assistant", content=None, tool_calls=[_deepseek_tool_call(call_id, name)])


def test_compact_deepseek_convo_resume_grupos_antigos_mantem_recente():
    convo = [
        {"role": "system", "content": "prompt"},
        {"role": "user", "content": "pergunta"},
        _deepseek_assistant_msg("call_1", "get_portfolio_metrics"),
        {"role": "tool", "tool_call_id": "call_1", "content": "resultado 1"},
        _deepseek_assistant_msg("call_2", "get_agent_performance"),
        {"role": "tool", "tool_call_id": "call_2", "content": "resultado 2"},
        _deepseek_assistant_msg("call_3", "query_kpi_historico"),
        {"role": "tool", "tool_call_id": "call_3", "content": "resultado 3 (mais recente)"},
    ]

    compactado = _compact_deepseek_convo(convo, keep_recent_groups=1)

    assert compactado[0] == {"role": "system", "content": "prompt"}
    assert compactado[1] == {"role": "user", "content": "pergunta"}
    resumo = compactado[2]
    assert resumo["role"] == "user"
    assert "get_portfolio_metrics" in resumo["content"]
    assert "get_agent_performance" in resumo["content"]
    assert "query_kpi_historico" not in resumo["content"]  # o mais recente não entra no resumo
    # grupo mais recente intacto, sem tool_call órfão
    assert compactado[3] is convo[6]
    assert compactado[4] == {"role": "tool", "tool_call_id": "call_3", "content": "resultado 3 (mais recente)"}
    assert len(compactado) == 5


def test_compact_deepseek_convo_nao_mexe_se_so_tem_1_grupo():
    convo = [
        {"role": "system", "content": "prompt"},
        _deepseek_assistant_msg("call_1", "get_portfolio_metrics"),
        {"role": "tool", "tool_call_id": "call_1", "content": "resultado"},
    ]
    assert _compact_deepseek_convo(convo, keep_recent_groups=1) == convo


def _anthropic_tool_use_block(block_id, name):
    return _Block(type="tool_use", id=block_id, name=name, input={})


def test_compact_anthropic_convo_resume_grupos_antigos_mantem_recente():
    convo = [
        {"role": "user", "content": "pergunta"},
        {"role": "assistant", "content": [_anthropic_tool_use_block("tu_1", "get_portfolio_metrics")]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "tu_1", "content": "resultado 1"}]},
        {"role": "assistant", "content": [_anthropic_tool_use_block("tu_2", "get_agent_performance")]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "tu_2", "content": "resultado 2"}]},
        {"role": "assistant", "content": [_anthropic_tool_use_block("tu_3", "detalhar_portfolio")]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "tu_3", "content": "resultado 3"}]},
    ]

    compactado = _compact_anthropic_convo(convo, keep_recent_groups=1)

    assert compactado[0] == {"role": "user", "content": "pergunta"}
    resumo = compactado[1]
    assert resumo["role"] == "user"
    assert isinstance(resumo["content"], str)
    assert "get_portfolio_metrics" in resumo["content"]
    assert "get_agent_performance" in resumo["content"]
    assert "detalhar_portfolio" not in resumo["content"]
    assert compactado[2] is convo[5]
    assert compactado[3] is convo[6]
    assert len(compactado) == 4
