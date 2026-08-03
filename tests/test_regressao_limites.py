"""/regressao/agentes: despacho no threadpool e teto de corpo.

Regressão: a rota era `async def` e chamava fit_all_models (numpy/sklearn,
síncrono) direto na thread do event loop, congelando todas as requisições
daquele worker. O corpo vinha de `await request.json()` sem modelo e sem limite,
e /regressao/ nem estava em _RATE_LIMITED_PREFIXES.
"""
import inspect

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencias import _RATE_LIMITED_PREFIXES
from api.routers import regressao
from api.routers.regressao import MAX_PONTOS


def _client():
    app = FastAPI()
    app.include_router(regressao.router)
    return TestClient(app)


def test_rota_nao_e_corrotina():
    """async def faria o sklearn rodar no event loop; def vai para o threadpool."""
    assert not inspect.iscoroutinefunction(regressao.agent_regression)


def test_corpo_acima_do_teto_e_rejeitado():
    pontos = [{"eficiencia": 1.0, "valor": 1.0} for _ in range(MAX_PONTOS + 1)]

    resp = _client().post("/regressao/agentes", json={"pontos": pontos})

    assert resp.status_code == 422


def test_sem_pontos_responde_envelope_com_erro():
    resp = _client().post("/regressao/agentes", json={"pontos": []})

    assert resp.status_code == 200
    assert resp.json()["errors"]


def test_rota_entrou_no_rate_limit():
    """Fit de sklearn é CPU por chamada — precisa do mesmo teto de /dashboard/."""
    assert "/regressao/" in _RATE_LIMITED_PREFIXES
