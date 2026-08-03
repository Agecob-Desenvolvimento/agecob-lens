"""Handler de exceção não tratada (main.py).

Antes: Starlette devolvia PlainTextResponse("Internal Server Error") — corpo não-JSON,
sem envelope e sem X-Run-Id (security_middleware re-levanta, então a linha que grava
o header nunca era alcançada). O parser do frontend caía no genérico "HTTP 500".

A rota de teste precisa ser inserida ANTES do catch-all do SPA
(api/static.py:/{full_path:path}), senão ele responde 404 e os asserts passariam
sem nunca exercitar o handler.
"""
import pytest
from fastapi.testclient import TestClient

import main

ROTA = "/dashboard/_boom_test"
SEGREDO = "senha=hunter2"


@pytest.fixture
def client():
    def _boom():
        raise RuntimeError(f"segredo interno: {SEGREDO}")

    main.app.router.add_api_route(ROTA, _boom, methods=["GET"])
    rota_nova = main.app.router.routes.pop()
    main.app.router.routes.insert(0, rota_nova)  # vence o catch-all do SPA
    try:
        # raise_server_exceptions=False: queremos a resposta que o cliente real veria.
        yield TestClient(main.app, raise_server_exceptions=False)
    finally:
        main.app.router.routes.remove(rota_nova)


def test_rota_de_teste_realmente_explode(client):
    """Guarda contra o teste passar à toa: sem isto um 404 satisfaria os asserts abaixo."""
    assert client.get(ROTA).status_code == 500


def test_erro_nao_tratado_responde_json_com_envelope(client):
    resp = client.get(ROTA, headers={"X-Run-Id": "run-abc123"})

    assert resp.status_code == 500
    body = resp.json()  # falharia com o PlainTextResponse anterior
    assert body["data"] == []
    assert body["errors"][0]["message"]
    assert body["meta"]["run_id"] == "run-abc123"


def test_run_id_volta_no_header_para_correlacionar_com_o_log(client):
    resp = client.get(ROTA, headers={"X-Run-Id": "run-xyz789"})

    assert resp.status_code == 500
    assert resp.headers.get("X-Run-Id") == "run-xyz789"


def test_detalhe_interno_nao_vaza_para_o_cliente(client):
    resp = client.get(ROTA)

    assert resp.status_code == 500
    assert SEGREDO not in resp.text
    assert "RuntimeError" not in resp.text
    # frontend lê body.detail (agecob-lens/src/services/api.ts:202) — contrato preservado
    assert isinstance(resp.json()["detail"], str)
