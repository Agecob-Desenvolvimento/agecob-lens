"""Tetos de memória: entradas do cache e buckets do rate limit.

Regressão: nenhum dos dois tinha limite. Entradas expiradas do cache só saíam no
get() daquela chave exata, e as chaves embutem string livre do cliente
(portfolio/agente/datas). O dict de buckets do rate limit nunca era podado.
"""
from collections import deque

import pytest

import config.settings as settings
from api import dependencias
from core.cache.cache_manager import CacheManager


# ─── cache ───────────────────────────────────────────────────────


def test_cache_respeita_teto_de_entradas(monkeypatch):
    monkeypatch.setattr(settings, "CACHE_MAX_ENTRIES", 16)
    cache = CacheManager(ttl_seconds=300)

    for i in range(200):
        cache.set(f"chave-{i}", [i])

    assert len(cache._store) <= 16


def test_cache_descarta_expiradas_antes_das_validas(monkeypatch):
    monkeypatch.setattr(settings, "CACHE_MAX_ENTRIES", 4)
    cache = CacheManager(ttl_seconds=300)

    # 3 entradas já vencidas + 1 válida, e o teto force um descarte
    for i in range(3):
        cache._store[f"velha-{i}"] = (0.0, ["expirada"])
    cache.set("viva", ["ok"])
    cache.set("nova", ["ok"])

    assert not [k for k in cache._store if k.startswith("velha-")]
    assert cache.get("viva") == ["ok"]
    assert cache.get("nova") == ["ok"]


def test_cache_ainda_serve_o_que_guardou():
    cache = CacheManager(ttl_seconds=300)
    cache.set("k", [1, 2])

    assert cache.get("k") == [1, 2]


# ─── rate limit ──────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def limpa_buckets():
    dependencias._RATE_LIMIT_BUCKETS.clear()
    yield
    dependencias._RATE_LIMIT_BUCKETS.clear()


def test_poda_remove_janelas_vencidas():
    agora = 10_000.0
    vencido = agora - settings.RATE_LIMIT_WINDOW_SECONDS - 1
    dependencias._RATE_LIMIT_BUCKETS["antigo"] = deque([vencido])
    dependencias._RATE_LIMIT_BUCKETS["vazio"] = deque()
    dependencias._RATE_LIMIT_BUCKETS["ativo"] = deque([agora - 1])

    dependencias._poda_buckets(agora)

    assert set(dependencias._RATE_LIMIT_BUCKETS) == {"ativo"}
