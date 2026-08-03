"""Envelope das rotas de efetividade com `data` em lista, e truncamento visível.

Regressão: /boletos-detalhe e /curva-quebra montavam o envelope à mão — sem
run_id, sem total_rows, sem quality, com errors: [] fixo. Pior, a query corta em
TOP 500 e nada no envelope dizia isso: quem conciliava o card overdue_unpaid
(calculado sem corte) contra a lista via 500 onde o KPI dizia 3.100.

/resumo fica de fora de propósito: seu `data` é um objeto (kpis/daily/best_day/
worst_day) com tipo próprio no frontend (EfResumoEnvelope), e o envelope padrão
espera lista — converter quebraria a página.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routers import efetividade
from dominios.efetividade.queries import EF_DETALHE_TOP

PERIODO = "date_from=2026-06-01&date_to=2026-06-30"


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(efetividade.router)
    return TestClient(app)


def _stub_rows(monkeypatch, n):
    monkeypatch.setattr(
        efetividade, "run_query",
        lambda *a, **kw: [{"valor_primeira_parcela": float(i)} for i in range(n)],
    )


def test_boletos_detalhe_usa_envelope_padrao(client, monkeypatch):
    _stub_rows(monkeypatch, 3)

    body = client.get(f"/efetividade/boletos-detalhe?kind=quebrados&{PERIODO}").json()

    assert set(body) == {"meta", "data", "errors"}
    assert body["meta"]["total_rows"] == 3
    assert "quality" in body["meta"]


def test_lista_cheia_sinaliza_truncamento(client, monkeypatch):
    _stub_rows(monkeypatch, EF_DETALHE_TOP)

    body = client.get(f"/efetividade/boletos-detalhe?kind=quebrados&{PERIODO}").json()

    assert body["meta"]["pagination"]["truncated"] is True
    assert body["meta"]["pagination"]["limit"] == EF_DETALHE_TOP


def test_lista_curta_nao_sinaliza_truncamento(client, monkeypatch):
    _stub_rows(monkeypatch, 10)

    body = client.get(f"/efetividade/boletos-detalhe?kind=quebrados&{PERIODO}").json()

    assert body["meta"]["pagination"]["truncated"] is False


def test_curva_quebra_usa_envelope_padrao(client, monkeypatch):
    _stub_rows(monkeypatch, 5)

    body = client.get(f"/efetividade/curva-quebra?{PERIODO}").json()

    assert set(body) == {"meta", "data", "errors"}
    assert body["meta"]["total_rows"] == 5


def test_resumo_mantem_data_como_objeto(client, monkeypatch):
    """Contrato distinto de propósito — o frontend tipa como EfResumoEnvelope."""
    monkeypatch.setattr(efetividade, "run_query", lambda *a, **kw: [])

    body = client.get(f"/efetividade/resumo?{PERIODO}").json()

    assert isinstance(body["data"], dict)
    assert "kpis" in body["data"] and "daily" in body["data"]
