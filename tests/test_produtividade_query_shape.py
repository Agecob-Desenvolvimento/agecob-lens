"""Forma do SQL de produtividade: chave de portfólio e âncora da tabela final.

Não toca no banco — inspeciona o SQL gerado. Duas regressões:

1. O filtro de portfólio casava REC_DIVIDAS só por NR_RECEBIMENTO. Todo o resto do
   código resolve portfólio pela chave composta (NR_RECEBIMENTO, ID_CARTEIRA) — ver
   o CROSS APPLY em dominios/graficos/queries.py e o índice
   IX_REC_DIVIDAS_NR_CARTEIRA. Sem ID_CARTEIRA, um NR_RECEBIMENTO presente em mais
   de uma carteira casa pela carteira errada e infla os valores do portfólio.

2. O branch use_distinct_esforco=False ancorava em CTE_Esforco com
   `qtd_acionamentos > 0`, então o agente que gerou acordo sem acionar no mesmo dia
   sumia de /comparacao-agentes, /detalhamento-agentes e /produtividade. O branch
   True já tinha sido corrigido para isso.
"""
import pytest

from dominios.produtividade.queries import build_produtividade_query

CTES_COM_FILTRO_DE_PORTFOLIO = [
    "CTE_Acordos",
    "CTE_Saldo_Original",
    "CTE_Horas_Agente",
    "CTE_Boletos_Agente",
]


def _com_portfolio():
    return build_produtividade_query("COBwebRCBAUTOS", use_distinct_esforco=True, portfolio="CARTEIRA X")


# ─── chave composta do portfólio ─────────────────────────────────


def test_filtro_de_portfolio_usa_chave_composta():
    assert "RD2.ID_CARTEIRA = RM.ID_CARTEIRA" in _com_portfolio()


def test_filtro_chega_em_todas_as_ctes_financeiras():
    sql = _com_portfolio()

    assert sql.count("EXISTS (SELECT 1 FROM REC_DIVIDAS RD2") == len(CTES_COM_FILTRO_DE_PORTFOLIO)


def test_sem_portfolio_nao_injeta_filtro():
    sql = build_produtividade_query("COBwebRCBAUTOS", use_distinct_esforco=True)

    assert "REC_DIVIDAS RD2" not in sql


def test_portfolio_entra_como_parametro_e_nao_interpolado():
    """O nome da carteira vem da URL — tem que viajar como ?, nunca concatenado."""
    sql = _com_portfolio()

    assert "CARTEIRA X" not in sql
    assert "DA2.CAMPO010 = ?" in sql


# ─── âncora da tabela final ──────────────────────────────────────


@pytest.mark.parametrize("db", ["COBwebRCBAUTOS", "todos"])
def test_branch_false_ancora_em_usuarios(db):
    sql = build_produtividade_query(db, use_distinct_esforco=False)

    assert "FROM CTE_Usuarios U" in sql
    assert "FROM CTE_Esforco E" not in sql


@pytest.mark.parametrize("db", ["COBwebRCBAUTOS", "todos"])
def test_branch_false_nao_exige_acionamento(db):
    """`qtd_acionamentos > 0` era o que derrubava quem tinha acordo e nenhuma ligação."""
    sql = build_produtividade_query(db, use_distinct_esforco=False)

    assert "E.qtd_acionamentos > 0" not in sql
    assert "(E.ID_USUARIO IS NOT NULL OR F.ID_USUARIO IS NOT NULL)" in sql


@pytest.mark.parametrize("db", ["COBwebRCBAUTOS", "todos"])
def test_colunas_de_esforco_toleram_left_join(db):
    """Com LEFT JOIN as colunas de esforço podem vir NULL; precisam de ISNULL."""
    sql = build_produtividade_query(db, use_distinct_esforco=False)

    for coluna in ("qtd_acionamentos", "qtd_alo", "qtd_contatos"):
        assert f"ISNULL(E.{coluna}, 0) AS {coluna}" in sql


@pytest.mark.parametrize("db", ["COBwebRCBAUTOS", "todos"])
def test_branch_true_mantem_a_ancora_que_ja_estava_certa(db):
    sql = build_produtividade_query(db, use_distinct_esforco=True)

    assert "FROM USU_MASTER U (NOLOCK)" in sql
    assert "(E.ID_USUARIO IS NOT NULL OR F.ID_USUARIO IS NOT NULL)" in sql
