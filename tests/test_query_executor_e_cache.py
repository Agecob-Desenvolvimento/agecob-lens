"""run_query: mapeamento de erro + timeout; CacheManager: espera limitada do single-flight."""
import threading
from contextlib import contextmanager

import pyodbc
import pytest
from fastapi import HTTPException

import config.settings as settings
from core.cache.cache_manager import CacheManager
from core.database import query_executor


class _Cursor:
    def __init__(self, erro=None, description=(("ok",),), rows=((1,),)):
        self._erro = erro
        self.description = description
        self._rows = rows

    def execute(self, sql, *args):
        if self._erro:
            raise self._erro

    def fetchall(self):
        return list(self._rows)


class _Conn:
    def __init__(self, cursor):
        self._cursor = cursor
        self.timeout = None

    def cursor(self):
        return self._cursor


def _patch_conn(monkeypatch, cursor):
    conn = _Conn(cursor)

    @contextmanager
    def _fake(_db):
        yield conn

    monkeypatch.setattr(query_executor.pool_manager, "get_connection", _fake)
    return conn


def test_aplica_timeout_de_query_na_conexao(monkeypatch):
    conn = _patch_conn(monkeypatch, _Cursor())

    query_executor.run_query("SELECT 1", "COBwebRCBAUTOS")

    assert conn.timeout == settings.DB_QUERY_TIMEOUT_SECONDS


def test_timeout_do_banco_vira_504(monkeypatch):
    """HYT00 é 'timeout expired'. Antes virava 500 genérico, indistinguível de erro real."""
    _patch_conn(monkeypatch, _Cursor(erro=pyodbc.Error("HYT00", "Query timeout expired")))

    with pytest.raises(HTTPException) as exc:
        query_executor.run_query("SELECT 1", "COBwebRCBAUTOS")

    assert exc.value.status_code == 504


def test_erro_de_banco_comum_continua_500(monkeypatch):
    _patch_conn(monkeypatch, _Cursor(erro=pyodbc.Error("42S02", "Invalid object name")))

    with pytest.raises(HTTPException) as exc:
        query_executor.run_query("SELECT 1", "COBwebRCBAUTOS")

    assert exc.value.status_code == 500


def test_erro_nao_pyodbc_tambem_vira_http(monkeypatch):
    """description=None -> TypeError no zip. Antes escapava cru, sem envelope."""
    _patch_conn(monkeypatch, _Cursor(description=None))

    with pytest.raises(HTTPException) as exc:
        query_executor.run_query("SELECT 1", "COBwebRCBAUTOS")

    assert exc.value.status_code == 500


def test_seguidor_do_single_flight_nao_espera_para_sempre(monkeypatch):
    """Sem timeout, um líder travado prende todos os seguidores da mesma chave."""
    monkeypatch.setattr(settings, "CACHE_LEADER_WAIT_TIMEOUT", 0.15)
    cache = CacheManager(ttl_seconds=60)
    solta_lider = threading.Event()
    erro = {}

    def _lider():
        cache.get_or_compute("k", lambda: solta_lider.wait(5) or ["ok"])

    t = threading.Thread(target=_lider, daemon=True)
    t.start()
    threading.Event().wait(0.05)  # garante que o líder registrou o inflight

    def _seguidor():
        try:
            cache.get_or_compute("k", lambda: ["nao deveria computar"])
        except HTTPException as exc:
            erro["status"] = exc.status_code

    s = threading.Thread(target=_seguidor, daemon=True)
    s.start()
    s.join(timeout=3)

    assert not s.is_alive(), "seguidor ficou preso — espera não foi limitada"
    assert erro.get("status") == 504
    solta_lider.set()
    t.join(timeout=5)
