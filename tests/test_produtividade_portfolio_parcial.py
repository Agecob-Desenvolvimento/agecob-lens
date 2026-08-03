"""/dashboard/produtividade-hoje com ?portfolio: razões anuladas e escopo sinalizado.

Com portfólio filtrado, acordos são restritos à carteira mas acionamentos/alô/CPC
continuam cobrindo o escritório inteiro — um acionamento não é atribuível a uma
carteira, porque o devedor pode ter dívida em várias e CTO_MASTER só guarda
ID_DEV. Toda razão sobre esse denominador teria numerador filtrado sobre
denominador não filtrado, e o agente filtrado por carteira parecia improdutivo.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import config.settings as settings
from api.routers import dashboard
from core.cache.cache_manager import cache_manager


def _linha():
    base = {campo: 0 for campo in settings.PRODUCTIVITY_REQUIRED_FIELDS}
    base.update({
        "CHAVE": "AG1",
        "NOME": "AGENTE UM",
        "qtd_acionamentos": 1840,
        "qtd_contatos": 97,
        "qtd_acordos": 12,
        "acordos_percentual": 0.65,
        "cpc_percentual": 23,
        "valor_acordos": 48300.0,
    })
    return base


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(dashboard, "run_query", lambda *a, **kw: [_linha()])
    cache_manager._store.clear()
    app = FastAPI()
    app.include_router(dashboard.router)
    return TestClient(app)


def test_sem_portfolio_as_razoes_continuam_vindo(client):
    body = client.get("/dashboard/produtividade-hoje/COBwebRCBAUTOS").json()

    assert body["data"][0]["acordos_percentual"] == 0.65
    assert body["data"][0]["cpc_percentual"] == 23
    assert body["meta"]["filters"]["portfolio_partial"] is False


def test_com_portfolio_as_razoes_sao_anuladas(client):
    body = client.get("/dashboard/produtividade-hoje/COBwebRCBAUTOS?portfolio=CARTEIRA%20X").json()

    assert body["data"][0]["acordos_percentual"] is None
    assert body["data"][0]["cpc_percentual"] is None


def test_com_portfolio_o_escopo_parcial_e_sinalizado(client):
    body = client.get("/dashboard/produtividade-hoje/COBwebRCBAUTOS?portfolio=CARTEIRA%20X").json()

    assert body["meta"]["filters"]["portfolio_partial"] is True
    assert body["meta"]["filters"]["portfolio"] == "CARTEIRA X"


def test_valores_absolutos_seguem_intactos_com_portfolio(client):
    """Só as razões somem — contagens e valores continuam corretos e filtrados."""
    body = client.get("/dashboard/produtividade-hoje/COBwebRCBAUTOS?portfolio=CARTEIRA%20X").json()
    linha = body["data"][0]

    assert linha["qtd_acordos"] == 12
    assert linha["valor_acordos"] == 48300.0
    assert linha["qtd_contatos"] == 97
