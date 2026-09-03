"""Forma do SQL de /dashboard/tabela-performance-periodo: quem é `conversao_pct`.

Não toca no banco — inspeciona o SQL gerado.

Regressão: o rename de 2026-08-03 (ver "Name collision resolved" em
docs/data-layer.md) liberou o nome `conversao_pct` para a definição oficial
`qtd_acordos / qtd_contatos` e moveu `pagos / contatos` para
`pagos_por_cpc_pct`. Em build_tabela_performance_periodo_query o rename só foi
aplicado ao branch `todos`: o branch de banco único continuou emitindo
`qtd_boletos_pagos / qtd_contatos` sob o nome `conversao_pct` — e sem expor
`pagos_por_cpc_pct` — de modo que trocar o banco trocava a *definição* da
métrica, não só o escopo. O docstring da própria função já prometia as duas
colunas com as fórmulas corretas.
"""
import pytest

from dominios.acordos.queries import build_tabela_performance_periodo_query

HOJE = "2026-04-01"
AMANHA = "2026-05-06"


def _sql(db: str) -> str:
    return build_tabela_performance_periodo_query(
        db, filter_by_agente=False, date_from=HOJE, date_to_exclusive=AMANHA,
    )


def _expressao_de(sql: str, alias: str) -> str:
    """Trecho do SELECT que produz `alias` — do último CASE WHEN até o AS."""
    antes = sql.split(f"AS {alias},")[0]
    return antes[antes.rindex("CASE WHEN"):]


# ─── as duas colunas existem nos dois branches ───────────────────


@pytest.mark.parametrize("db", ["COBwebRCBAUTOS", "COBwebRCBCONSUMER", "todos"])
def test_expoe_conversao_e_pagos_por_cpc(db):
    """Branches diferentes não podem devolver shapes diferentes."""
    sql = _sql(db)

    assert "AS conversao_pct," in sql
    assert "AS pagos_por_cpc_pct," in sql


# ─── cada nome carrega a sua própria fórmula ─────────────────────


@pytest.mark.parametrize("db", ["COBwebRCBAUTOS", "COBwebRCBCONSUMER", "todos"])
def test_conversao_pct_e_acordos_sobre_cpc(db):
    """Conversão oficial: qtd_acordos / qtd_contatos — nunca boletos pagos."""
    expr = _expressao_de(_sql(db), "conversao_pct")

    assert "qtd_acordos" in expr
    assert "qtd_contatos" in expr
    assert "qtd_boletos_pagos" not in expr


@pytest.mark.parametrize("db", ["COBwebRCBAUTOS", "COBwebRCBCONSUMER", "todos"])
def test_pagos_por_cpc_pct_e_pagos_sobre_cpc(db):
    """A métrica distinta que até 2026-08 ocupava o nome conversao_pct."""
    expr = _expressao_de(_sql(db), "pagos_por_cpc_pct")

    assert "qtd_boletos_pagos" in expr
    assert "qtd_contatos" in expr
    assert "qtd_acordos" not in expr
