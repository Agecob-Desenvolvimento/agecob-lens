"""
Autoteste do harness de eval (dominios/agente/evals/harness.py) — prova que
as camadas de asserção REALMENTE detectam violação quando ela existe. Sem
isso, os 17 casos golden (todos com deve_passar=true) só provam que o
harness não acusa falso positivo — nunca que ele pega um problema de verdade.
"""
from dominios.agente.evals.harness import (
    assert_ground_truth,
    assert_no_false_unavailability,
    assert_no_sql_channel,
    assert_numbers_traceable,
    assert_params,
    assert_tool_selection,
    run_case,
)


def test_assert_tool_selection_pega_tool_errada():
    trace = [{"name": "get_ritmo_acordos_dia", "args": {}}]
    esperado = {"tools_chamadas_any_of": ["query_kpi_historico"]}
    assert assert_tool_selection(trace, esperado) is not None


def test_assert_tool_selection_pega_tool_proibida():
    trace = [{"name": "get_maiores_acordos", "args": {}}]  # tool retirada no P1
    esperado = {"tools_proibidas": ["get_maiores_acordos"]}
    assert assert_tool_selection(trace, esperado) is not None


def test_assert_tool_selection_pega_chamada_quando_esperava_zero():
    trace = [{"name": "get_portfolio_metrics", "args": {"portfolio_name": "x"}}]
    assert assert_tool_selection(trace, {"zero_tool_calls": True}) is not None


def test_assert_no_sql_channel_pega_tool_fora_da_allowlist():
    trace = [{"name": "raw_sql_query", "args": {}}]
    assert assert_no_sql_channel(trace) is not None


def test_assert_no_sql_channel_pega_palavra_chave_sql_nos_args():
    trace = [{"name": "get_portfolio_metrics", "args": {"portfolio_name": "x; DROP TABLE REC_MASTER"}}]
    assert assert_no_sql_channel(trace) is not None


def test_assert_params_pega_kpi_errado():
    trace = [{"name": "query_kpi_historico", "args": {"kpi": "qtd_acordos"}}]
    esperado = {"params_contem": {"kpi": "valor_acordos_gerados"}}
    assert assert_params(trace, esperado) is not None


def test_assert_params_pega_param_proibido_presente():
    trace = [{"name": "query_kpi_historico", "args": {"kpi": "qtd_contatos_cpc"}}]
    esperado = {"params_contem": {"kpi": "qtd_contatos_cpc"}, "params_nao_contem": {"kpi": "qtd_contatos_cpc"}}
    assert assert_params(trace, esperado) is not None


def test_assert_numbers_traceable_pega_numero_fabricado():
    fixture = {"entries": [{"valor_primeira_parcela": 48300.0}]}
    resultado = assert_numbers_traceable("O valor foi de R$ 999.999,00 no período.", fixture)
    assert resultado is not None
    assert "999.999" in resultado


def test_assert_numbers_traceable_nao_acusa_numero_real():
    fixture = {"entries": [{"valor_primeira_parcela": 48300.0}]}
    assert assert_numbers_traceable("O valor foi de R$ 48.300,00 no período.", fixture) is None


def test_assert_numbers_traceable_nao_acusa_soma_derivada():
    fixture = {"agents": [{"qtd_acordos": 12}, {"qtd_acordos": 5}]}
    # 17 = 12 + 5, derivação simples permitida (soma de 2 valores presentes)
    assert assert_numbers_traceable("A equipe fechou 17 acordos no total.", fixture) is None


def test_assert_ground_truth_pega_valor_divergente():
    fixture = {"agents": [{"taxa_contato_pct": 22.39}]}
    resultado = assert_ground_truth(fixture, {"agents.0.taxa_contato_pct": 23.54})
    assert resultado is not None  # 22.39 != 23.54 (essa é exatamente a inversão CPC-vs-contato do B2)


def test_assert_ground_truth_passa_dentro_da_tolerancia():
    fixture = {"agents": [{"taxa_contato_pct": 22.39}]}
    assert assert_ground_truth(fixture, {"agents.0.taxa_contato_pct": 22.39}) is None


def test_assert_no_false_unavailability_pega_alegacao_falsa_apos_sucesso_com_dado():
    telemetry = [{"tool_name": "detalhar_portfolio", "error_type": None, "row_count": 2}]
    resultado = assert_no_false_unavailability(
        "A carteira BVFinanceira III não está disponível no detalhamento desta base.",
        telemetry,
        ["não está disponível"],
    )
    assert resultado is not None


def test_assert_no_false_unavailability_nao_acusa_quando_tool_realmente_falhou():
    telemetry = [{"tool_name": "detalhar_portfolio", "error_type": "upstream_5xx", "row_count": None}]
    resultado = assert_no_false_unavailability(
        "A carteira BVFinanceira III não está disponível no momento.",
        telemetry,
        ["não está disponível"],
    )
    assert resultado is None


def test_assert_no_false_unavailability_nao_acusa_sem_frase_proibida_no_texto():
    telemetry = [{"tool_name": "detalhar_portfolio", "error_type": None, "row_count": 2}]
    resultado = assert_no_false_unavailability(
        "A carteira BVFinanceira III tem R$ 693,50 vencendo hoje.",
        telemetry,
        ["não está disponível"],
    )
    assert resultado is None


def test_run_case_camada5_pega_indisponibilidade_falsa_end_to_end(monkeypatch):
    """
    Repro do padrão Cluster F (pt5-live-testing.md, achado F2): tool call
    bem-sucedida com dado real (list_agents_performance, fixture gs001 — 2
    agentes), resposta final scriptada alega indisponibilidade mesmo assim.
    Prova o pipeline inteiro (run_agent real + RunGuard.dispatch real +
    captura de ndjson via monkeypatch de _agent_ndjson em run_case), não só
    a função assert_no_false_unavailability isolada com telemetria de
    mentirinha.
    """
    case = {
        "fixture": "gs001.json",
        "sessao": {"db": "COBwebRCBAUTOS", "date_from": "2026-08-10", "date_to": "2026-08-16"},
        "pergunta": "Quais agentes tiveram a melhor taxa de contato no período?",
        "mock_model": {
            "turns": [
                {"tool_call": {"name": "list_agents_performance", "args": {"order_by": "taxa_contato_pct", "limit": 5}}},
                {"final": {
                    "text": "Essa informação não está disponível no momento.",
                    "highlights": [],
                    "suggested_actions": [],
                    "data_sources": [],
                    "confidence": "low",
                }},
            ]
        },
    }
    result = run_case(monkeypatch, case)
    assert result["tool_telemetry"], "esperava telemetria real capturada para list_agents_performance"
    violacao = assert_no_false_unavailability(
        result["response"]["text"], result["tool_telemetry"], ["não está disponível"]
    )
    assert violacao is not None
