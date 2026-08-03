"""/health: liveness sem banco, readiness multi-banco, e /db deixando de mentir.

Regressão: /health/db sondava só COBwebRCBAUTOS hardcoded. Com o CONSUMER fora,
respondia {"status": "ok"} — e é essa a rota que fetchHealth("todos") chama
(agecob-lens/src/services/api.ts:260), então o banner do SPA e o monitor diziam
saudável enquanto metade do dashboard dava 500. Também não havia rota sem banco:
um monitor de uptime abria um login SQL a cada verificação.
"""
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import config.settings as settings
from api.routers import health


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(health.router)
    return TestClient(app)


def _run_query_por_banco(estado_por_banco):
    def _fn(sql, database_name, *a, **kw):
        estado = estado_por_banco[database_name]
        if isinstance(estado, Exception):
            raise estado
        return estado

    return _fn


TODOS_OK = {db: [{"ok": 1}] for db in settings.ALLOWED_DATABASES}


def test_live_nao_toca_no_banco(client, monkeypatch):
    def _explode(*a, **kw):
        raise AssertionError("liveness não pode consultar o banco")

    monkeypatch.setattr(health, "run_query", _explode)

    resp = client.get("/health/live")

    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_db_ok_quando_todos_respondem(client, monkeypatch):
    monkeypatch.setattr(health, "run_query", _run_query_por_banco(TODOS_OK))

    resp = client.get("/health/db")

    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_db_falha_quando_um_banco_esta_fora(client, monkeypatch):
    """O caso que antes respondia "ok": o primeiro banco de pé, o segundo fora."""
    estados = dict(TODOS_OK)
    estados[settings.ALLOWED_DATABASES[1]] = HTTPException(status_code=500, detail="sem conexão")
    monkeypatch.setattr(health, "run_query", _run_query_por_banco(estados))

    resp = client.get("/health/db")

    assert resp.status_code == 503
    assert settings.ALLOWED_DATABASES[1] in resp.json()["detail"]


def test_ready_reporta_estado_por_banco(client, monkeypatch):
    estados = dict(TODOS_OK)
    estados[settings.ALLOWED_DATABASES[1]] = HTTPException(status_code=500, detail="sem conexão")
    monkeypatch.setattr(health, "run_query", _run_query_por_banco(estados))

    resp = client.get("/health/ready")
    body = resp.json()

    assert resp.status_code == 503
    assert body["status"] == "degraded"
    assert body["databases"][settings.ALLOWED_DATABASES[0]] == "ok"
    assert body["databases"][settings.ALLOWED_DATABASES[1]] != "ok"


def test_ready_expoe_idade_do_etl(client, monkeypatch):
    monkeypatch.setattr(health, "run_query", _run_query_por_banco(TODOS_OK))
    monkeypatch.setattr(health.efetividade_etl, "get_last_run", lambda: None)

    body = client.get("/health/ready").json()

    assert body["status"] == "ok"
    assert "last_run_age_seconds" in body["efetividade_etl"]


def test_db_por_banco_continua_funcionando(client, monkeypatch):
    monkeypatch.setattr(health, "run_query", _run_query_por_banco(TODOS_OK))

    resp = client.get(f"/health/db/{settings.ALLOWED_DATABASES[0]}")

    assert resp.status_code == 200
    assert resp.json()["database"] == settings.ALLOWED_DATABASES[0]
