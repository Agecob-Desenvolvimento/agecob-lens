"""/dashboard/metas/upload: despacho no threadpool, teto de tamanho, caminho absoluto.

Regressão: a rota era `async def` e fazia `await file.read()` (upload inteiro em
memória, sem limite) seguido de write_bytes + processar_pdf (pdfplumber) — tudo
síncrono na thread do event loop, congelando o worker durante o parse. O tmp_path
era relativo, dependendo do AppDirectory do NSSM.
"""
import inspect
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import config.settings as settings
from api.routers import dashboard


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(dashboard, "processar_pdf", lambda p, nome_origem=None: {"meta": {"total_registros": 3}})
    monkeypatch.setattr(dashboard, "salvar_resultado", lambda dados, nome: "2026-Q3")
    app = FastAPI()
    app.include_router(dashboard.router)
    return TestClient(app)


def test_rota_nao_e_corrotina():
    assert not inspect.iscoroutinefunction(dashboard.upload_metas_pdf)


def test_upload_valido_processa(client):
    resp = client.post(
        "/dashboard/metas/upload",
        files={"file": ("metas.pdf", b"%PDF-1.4 conteudo", "application/pdf")},
    )

    body = resp.json()
    assert body["errors"] == []
    assert body["data"][0]["periodo"] == "2026-Q3"


def test_arquivo_acima_do_teto_e_recusado(client, monkeypatch):
    monkeypatch.setattr(settings, "METAS_UPLOAD_MAX_BYTES", 1024)

    resp = client.post(
        "/dashboard/metas/upload",
        files={"file": ("grande.pdf", b"x" * 5000, "application/pdf")},
    )

    body = resp.json()
    assert body["data"] == []
    assert "limite" in body["errors"][0]["message"].lower()


def test_nao_pdf_e_recusado(client):
    resp = client.post(
        "/dashboard/metas/upload",
        files={"file": ("planilha.xlsx", b"qualquer", "application/octet-stream")},
    )

    assert resp.json()["errors"]


def test_temporario_nao_fica_para_tras(client):
    dir_metas = Path(settings.BASE_DIR) / "dados_metas"
    antes = set(dir_metas.glob("_upload_*.pdf")) if dir_metas.exists() else set()

    client.post(
        "/dashboard/metas/upload",
        files={"file": ("metas.pdf", b"%PDF-1.4 conteudo", "application/pdf")},
    )

    depois = set(dir_metas.glob("_upload_*.pdf")) if dir_metas.exists() else set()
    assert depois == antes
