"""Degradação do /dashboard/ritmo-dia quando o banco falha.

Regressão: o handler tinha `except HTTPException: raise` antes do `except Exception`,
e run_query traduz todo pyodbc.Error em HTTPException(500) — então o payload
degradado (bandas vazias, em_operacao=True) era inalcançável exatamente na falha
para a qual foi escrito, e o Modo TV recebia 500 cru.
"""
from datetime import datetime

import pytest
from fastapi import HTTPException

from api.routers import ritmo_dia as rd


class _FrozenDT:
    """Horário comercial numa terça — fora disso a rota retorna em_operacao=False."""

    @staticmethod
    def now():
        return datetime(2026, 6, 9, 14, 0, 0)


@pytest.fixture
def em_horario(monkeypatch):
    monkeypatch.setattr(rd, "datetime", _FrozenDT)
    monkeypatch.setattr(rd, "_load_artifacts", lambda: (object(), object()))
    monkeypatch.setattr(rd, "_load_lookup", lambda: {})
    monkeypatch.setattr(rd, "_load_valor_artifacts", lambda: (object(), object()))
    monkeypatch.setattr(rd, "_load_valor_lookup", lambda: {})


@pytest.mark.parametrize("status", [500, 504])
def test_falha_de_banco_degrada_em_vez_de_500(em_horario, monkeypatch, status):
    """500 = pyodbc.Error traduzido; 504 = timeout de query."""
    def _boom(_db):
        raise HTTPException(status_code=status, detail="erro no banco")

    monkeypatch.setattr(rd, "_coletar_dados_por_banco", _boom)

    resp = rd.ritmo_dia("todos")

    assert resp["meta"]["em_operacao"] is True
    assert resp["data"]["bandas"] == []
    assert resp["errors"]


def test_erro_de_cliente_continua_subindo(em_horario, monkeypatch):
    """Degradar um 400 esconderia bug de chamada em vez de sinalizar."""
    def _boom(_db):
        raise HTTPException(status_code=400, detail="parâmetro inválido")

    monkeypatch.setattr(rd, "_coletar_dados_por_banco", _boom)

    with pytest.raises(HTTPException) as exc:
        rd.ritmo_dia("todos")

    assert exc.value.status_code == 400


def test_erro_nao_http_continua_degradando(em_horario, monkeypatch):
    def _boom(_db):
        raise RuntimeError("qualquer outra falha")

    monkeypatch.setattr(rd, "_coletar_dados_por_banco", _boom)

    resp = rd.ritmo_dia("todos")

    assert resp["meta"]["em_operacao"] is True
    assert resp["data"]["bandas"] == []
