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
    _build_ef_resumo_por_portfolio_ranking_sql,
    _build_ef_resumo_por_portfolio_sql,
    _build_geracao_por_portfolio_ranking_sql,
    _ef_date_params,
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


# _build_ef_resumo_por_portfolio_ranking_sql — T3 (pt5-live-testing.md, Cluster G):
# mesma consulta acima, mas para TODAS as carteiras da janela numa chamada só,
# ranqueada por valor vencendo. Sem isso o agente perguntava carteira por
# carteira e sub-amostrava em silêncio (BVFinanceira III, R$12k+ vencendo,
# ficou fora de um "consolidado" que só cobriu 7 de 20 carteiras reais).


def test_ranking_nao_filtra_por_nome_agrupa_por_carteira():
    sql = _build_ef_resumo_por_portfolio_ranking_sql("COBwebRCBAUTOS", "primeira")
    assert "DA.portfolio_name = ?" not in sql  # essa é a chave do resumo de UMA carteira, não desta
    assert "GROUP BY portfolio_name" in sql
    assert "ORDER BY amount_maturing DESC" in sql
    assert "OUTER APPLY" in sql


def test_ranking_exclui_linhas_sem_carteira_resolvida():
    sql = _build_ef_resumo_por_portfolio_ranking_sql("COBwebRCBAUTOS", "primeira")
    assert "DA.portfolio_name IS NOT NULL" in sql  # senão o grupo "sem carteira" entra no ranking


def test_ranking_reusa_expressoes_de_pagamento_do_resumo_geral():
    sql = _build_ef_resumo_por_portfolio_ranking_sql("COBwebRCBAUTOS", "primeira")
    assert "amount_maturing" in sql
    assert "amount_received" in sql
    assert "DATEADD(DAY, 5, DT_VENCIMENTO)" in sql


def test_ranking_parcela_condicional_primeira_vs_colchao():
    primeira = _build_ef_resumo_por_portfolio_ranking_sql("COBwebRCBAUTOS", "primeira")
    colchao = _build_ef_resumo_por_portfolio_ranking_sql("COBwebRCBAUTOS", "colchao")
    assert "R.PARCELA = 0" in primeira
    assert "R.PARCELA > 0" in colchao


def test_ranking_todos_bancos_gera_union_all():
    sql_um_banco = _build_ef_resumo_por_portfolio_ranking_sql("COBwebRCBAUTOS", "primeira")
    sql_todos = _build_ef_resumo_por_portfolio_ranking_sql("todos", "primeira")
    assert "UNION ALL" in sql_todos
    assert "UNION ALL" not in sql_um_banco


def test_ranking_usa_ef_date_params_sem_portfolio():
    # a ranking query nao tem parametro de nome de carteira - reusa o
    # helper generico de data (_ef_date_params), nao um _params dedicado
    um_banco = _ef_date_params("COBwebRCBAUTOS", "20260819", "20260819")
    assert um_banco == ("20260819", "20260819")

    todos = _ef_date_params("todos", "20260819", "20260819")
    assert todos == ("20260819", "20260819", "20260819", "20260819")


# _build_geracao_por_portfolio_ranking_sql — T3b (pt5-live-testing.md, Cluster L,
# "residual gap"): mesmo padrão de _build_ef_resumo_por_portfolio_ranking_sql
# (T3/Cluster G) acima, mas pra geração (valor_acordos_gerados/qtd_acordos) em
# vez de vencimento — ranking de TODAS as carteiras da janela numa chamada só.
# Sem isso, "ranking de geração por carteira" pra um dia fora da janela da
# sessão não tinha tool direta: filter_portfolios_by_value só reflete o
# date_from/date_to da sessão.


def test_geracao_ranking_agrupa_por_carteira_ordena_por_valor():
    sql = _build_geracao_por_portfolio_ranking_sql("COBwebRCBAUTOS")
    assert "GROUP BY portfolio_name" in sql
    assert "ORDER BY valor_acordos_gerados DESC" in sql
    assert "OUTER APPLY" in sql


def test_geracao_ranking_exclui_linhas_sem_carteira_resolvida():
    sql = _build_geracao_por_portfolio_ranking_sql("COBwebRCBAUTOS")
    assert "DA.portfolio_name IS NOT NULL" in sql  # senão o grupo "sem carteira" entra no ranking


def test_geracao_ranking_filtra_status_gerados_e_primeira_parcela():
    sql = _build_geracao_por_portfolio_ranking_sql("COBwebRCBAUTOS")
    # STATUS_GERADOS_SQL (1,2,3,10,12) — base de valor por data-layer.md, não o
    # STATUS_APROVADOS mais estreito (1,3,12) — o erro mais provável desta tarefa.
    assert "R.ID_REC_STATUS IN (1, 2, 3, 10, 12)" in sql
    assert "R.PARCELA = 0" in sql


def test_geracao_ranking_filtra_por_dt_emissao_nao_dt_vencimento():
    sql = _build_geracao_por_portfolio_ranking_sql("COBwebRCBAUTOS")
    assert "R.DT_EMISSAO >= CONVERT(DATE, ?, 112)" in sql
    # limite superior EXCLUSIVO (dia seguinte), não <= como a ranking de
    # vencimentos: DT_EMISSAO carrega hora real (DT_VENCIMENTO é sempre meia-
    # noite) — um <= inclusivo bateria só em linhas exatamente à meia-noite e
    # zeraria o resultado (achado ao vivo, verificação ground truth 20/08).
    assert "R.DT_EMISSAO < DATEADD(DAY, 1, CONVERT(DATE, ?, 112))" in sql
    assert "R.DT_EMISSAO <= CONVERT(DATE, ?, 112)" not in sql
    assert "DT_VENCIMENTO" not in sql  # geração é sobre quando o acordo nasceu, não quando a parcela vence


def test_geracao_ranking_usa_filtro_de_agentes_padrao_nao_o_de_efetividade():
    sql = _build_geracao_por_portfolio_ranking_sql("COBwebRCBAUTOS")
    assert "SISTEMA%" in sql  # FILTRO_AGENTES_EXCLUIDOS_SQL — o padrão que series.py usa pra este KPI
    assert "SERASA" not in sql  # FILTRO_AGENTES_EFETIVIDADE_SQL — só a família Efetividade deste módulo usa


def test_geracao_ranking_todos_bancos_gera_union_all():
    sql_um_banco = _build_geracao_por_portfolio_ranking_sql("COBwebRCBAUTOS")
    sql_todos = _build_geracao_por_portfolio_ranking_sql("todos")
    assert "UNION ALL" in sql_todos
    assert "UNION ALL" not in sql_um_banco


def test_geracao_ranking_usa_ef_date_params_sem_portfolio():
    # mesmo helper generico de data que a ranking de vencimentos reusa — sem
    # parametro de nome de carteira, sem _params dedicado.
    um_banco = _ef_date_params("COBwebRCBAUTOS", "20260820", "20260820")
    assert um_banco == ("20260820", "20260820")

    todos = _ef_date_params("todos", "20260820", "20260820")
    assert todos == ("20260820", "20260820", "20260820", "20260820")
