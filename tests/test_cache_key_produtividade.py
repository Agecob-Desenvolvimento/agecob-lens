"""Chave de cache da produtividade unificada."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routers import dashboard
from core.cache.cache_manager import cache_manager

def test_tres_rotas_de_produtividade_compartilham_uma_execucao(monkeypatch):
    """Mesmo SQL, contexts diferentes: com context na chave rodava 3x por TTL."""
    execucoes = []

    def _fake_run_query(sql, database_name, params=None, run_id=None, context="unknown"):
        execucoes.append(context)
        return [{"CHAVE": "X", "NOME": "X"}]

    monkeypatch.setattr(dashboard, "run_query", _fake_run_query)
    monkeypatch.setattr(dashboard, "validate_produtividade_rows", lambda rows, run_id=None: (rows, {}))
    cache_manager._store.clear()

    app = FastAPI()
    app.include_router(dashboard.router)
    client = TestClient(app)

    for rota in ("comparacao-agentes", "detalhamento-agentes", "produtividade"):
        assert client.get(f"/dashboard/{rota}/COBwebRCBAUTOS").status_code == 200

    assert len(execucoes) == 1, f"query executada {len(execucoes)}x: {execucoes}"
