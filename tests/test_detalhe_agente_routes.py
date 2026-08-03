"""Rotas /dashboard/*-detalhe-agente/{db}/{agente}.

Regressão: as três chamavam _run_dashboard_chart sem o kwarg obrigatório
cache_key_suffix, então todo request virava TypeError -> 500 antes de qualquer
query. Além do 200, o teste garante que a chave de cache discrimina o agente —
sem o nome na chave, todo agente receberia as linhas do primeiro durante o TTL.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routers import dashboard
from core.cache.cache_manager import cache_manager

ROTAS = [
    "/dashboard/excecoes-detalhe-agente",
    "/dashboard/rejeitados-detalhe-agente",
    "/dashboard/quebrados-detalhe-agente",
]


@pytest.fixture
def client(monkeypatch):
    # run_query devolve uma linha que identifica o agente pedido (vem via params).
    def _fake_run_query(sql, database_name, params=None, run_id=None, context="unknown"):
        return [{"agente": params[0] if params else None, "context": context}]

    monkeypatch.setattr(dashboard, "run_query", _fake_run_query)
    cache_manager._store.clear()

    app = FastAPI()
    app.include_router(dashboard.router)
    with TestClient(app) as c:
        yield c


@pytest.mark.parametrize("rota", ROTAS)
def test_rota_responde_200_com_envelope(client, rota):
    resp = client.get(f"{rota}/COBwebRCBAUTOS/FULANO")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert set(body) == {"meta", "data", "errors"}
    assert body["meta"]["filters"]["agente"] == "FULANO"


@pytest.mark.parametrize("rota", ROTAS)
def test_cache_discrimina_agente(client, rota):
    """Sem o agente na cache_key_suffix os dois agentes colidiriam na mesma chave."""
    primeiro = client.get(f"{rota}/COBwebRCBAUTOS/FULANO").json()
    segundo = client.get(f"{rota}/COBwebRCBAUTOS/BELTRANO").json()

    assert primeiro["data"][0]["agente"] == "FULANO"
    assert segundo["data"][0]["agente"] == "BELTRANO"
