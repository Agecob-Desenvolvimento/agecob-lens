"""/dashboard/status-carga: falha de cast numérico é carga degradada, não "ok".

Regressão: o endpoint chamava `rows, _ = validate_produtividade_rows(...)` e
descartava as métricas. Um cast que falha vira 0.0 em silêncio
(core/utils/validation.py), então o endpoint cujo único propósito é confirmar a
carga do dia respondia status "ok" com errors: [] enquanto somava zeros
fabricados.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import config.settings as settings
from api.routers import dashboard
from core.cache.cache_manager import cache_manager


def _linha(valor_acordos):
    """Linha completa o suficiente para passar pelos campos obrigatórios."""
    base = {campo: 0 for campo in settings.PRODUCTIVITY_REQUIRED_FIELDS}
    base.update({"CHAVE": "AG1", "NOME": "AGENTE UM", "valor_acordos": valor_acordos})
    return base


@pytest.fixture
def client(monkeypatch):
    cache_manager._store.clear()
    app = FastAPI()
    app.include_router(dashboard.router)
    return TestClient(app)


def test_carga_integra_reporta_ok(client, monkeypatch):
    monkeypatch.setattr(
        dashboard, "run_query",
        lambda *a, **kw: [_linha(1500.0)],
    )

    body = client.get("/dashboard/status-carga/COBwebRCBAUTOS").json()

    assert body["meta"]["quality"]["status"] == "ok"
    assert body["meta"]["quality"]["numeric_cast_failures"] == 0
    assert body["errors"] == []


def test_cast_que_falha_degrada_para_partial(client, monkeypatch):
    """valor_acordos não-numérico vira 0.0 — o total deixa de ser confiável."""
    monkeypatch.setattr(
        dashboard, "run_query",
        lambda *a, **kw: [_linha("nao-e-numero")],
    )

    body = client.get("/dashboard/status-carga/COBwebRCBAUTOS").json()

    assert body["meta"]["quality"]["status"] == "partial"
    assert body["meta"]["quality"]["numeric_cast_failures"] >= 1
    assert body["errors"], "a falha precisa aparecer em errors[], não só no quality"
    assert body["data"][0]["valor_acordos"] == 0.0  # o zero fabricado segue visível
