"""
_build_ef_resumo_por_portfolio_sql / _params — resumo de efetividade
(vencendo x recebido) para UM portfólio, resolvido por NOME (não pelo
id_portfolio de _build_ef_resumo_sql, chave diferente). Sem rede e sem banco:
só forma da query e dos params (mesmo padrão de test_produtividade_query_shape.py).

Origem: gap achado ao vivo (Q2/Q3 de uma sessão de teste) — "quanto projetamos/
recebemos de vencimentos de hoje/ontem por carteira" não tinha tool nenhuma,
apesar de amount_maturing/amount_received já existirem e serem testados em
_build_ef_resumo_sql (usado pela página Efetividade). Nova função reusa
pago_expr/recv_expr verbatim e a mesma resolução de nome (OUTER APPLY
DIV_AUX) que _build_ef_detalhe_sql já usa — não inventa filtro novo.
"""
from dominios.efetividade.queries import (
    _build_ef_resumo_por_portfolio_params,
    _build_ef_resumo_por_portfolio_sql,
)


def test_sql_resolve_portfolio_por_nome_nao_por_id_carteira():
    sql = _build_ef_resumo_por_portfolio_sql("COBwebRCBAUTOS", "primeira")
    assert "DA.portfolio_name = ?" in sql
    assert "R.ID_CARTEIRA = ?" not in sql  # essa é a chave de _build_ef_resumo_sql, não desta
    assert "OUTER APPLY" in sql
    assert "DIV_AUX" in sql


def test_sql_reusa_expressoes_de_pagamento_do_resumo_geral():
    sql = _build_ef_resumo_por_portfolio_sql("COBwebRCBAUTOS", "primeira")
    assert "amount_maturing" in sql
    assert "amount_received" in sql
    assert "DATEADD(DAY, 5, DT_VENCIMENTO)" in sql  # pago_expr — mesma regra de 5 dias de carência


def test_sql_parcela_condicional_primeira_vs_colchao():
    primeira = _build_ef_resumo_por_portfolio_sql("COBwebRCBAUTOS", "primeira")
    colchao = _build_ef_resumo_por_portfolio_sql("COBwebRCBAUTOS", "colchao")
    assert "R.PARCELA = 0" in primeira
    assert "R.PARCELA > 0" in colchao


def test_sql_todos_bancos_gera_union_all_dobrando_selects():
    sql_um_banco = _build_ef_resumo_por_portfolio_sql("COBwebRCBAUTOS", "primeira")
    sql_todos = _build_ef_resumo_por_portfolio_sql("todos", "primeira")
    assert sql_um_banco.count("DA.portfolio_name = ?") == 1
    assert sql_todos.count("DA.portfolio_name = ?") == 2
    assert "UNION ALL" in sql_todos


def test_params_um_banco_vs_todos():
    um_banco = _build_ef_resumo_por_portfolio_params("COBwebRCBAUTOS", "20260819", "20260819", "BANCO ALFA")
    assert um_banco == ("20260819", "20260819", "BANCO ALFA")

    todos = _build_ef_resumo_por_portfolio_params("todos", "20260819", "20260819", "BANCO ALFA")
    assert todos == ("20260819", "20260819", "BANCO ALFA", "20260819", "20260819", "BANCO ALFA")
