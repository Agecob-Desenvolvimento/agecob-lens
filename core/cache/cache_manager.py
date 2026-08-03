import threading
import time
from typing import Any, Callable, Dict, Optional, Tuple

from fastapi import HTTPException

import config.settings as settings
from core.telemetry.agent_logger import _sentry_metric


class CacheManager:
    def __init__(self, ttl_seconds: float) -> None:
        self._ttl = ttl_seconds
        self._store: Dict[str, Tuple[float, Any]] = {}
        self._lock = threading.Lock()
        self._inflight: Dict[str, Dict[str, Any]] = {}

    def get(self, key: str) -> Optional[Any]:
        if self._ttl <= 0:
            return None
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            expires_at, value = entry
            if expires_at < time.time():
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any) -> None:
        if self._ttl <= 0:
            return
        with self._lock:
            now = time.time()
            if len(self._store) >= settings.CACHE_MAX_ENTRIES:
                self._descarta(now)
            self._store[key] = (now + self._ttl, value)

    def _descarta(self, now: float) -> None:
        """Libera espaço. Chamar com o lock tomado.

        Entradas expiradas só saíam no get() da chave exata, então uma chave nunca
        mais consultada ficava para sempre — e as chaves embutem string livre do
        cliente (portfolio/agente/datas), o que fazia o store crescer sem limite.
        """
        for key in [k for k, (expira_em, _) in self._store.items() if expira_em < now]:
            self._store.pop(key, None)
        # Se todas ainda estão válidas, descarta a que expira primeiro.
        while len(self._store) >= settings.CACHE_MAX_ENTRIES:
            self._store.pop(min(self._store, key=lambda k: self._store[k][0]), None)

    def get_or_compute(self, key: str, fetcher: Callable[[], Any]) -> Any:
        """
        Concurrent calls with the same key share one fetcher() execution
        (single-flight) instead of each firing its own duplicate query.
        """
        prefix = key.split("|", 1)[0]
        hit = self.get(key)
        if hit is not None:
            _sentry_metric("count", "cache.hit", 1, cache_key_prefix=prefix)
            return hit

        with self._lock:
            entry = self._store.get(key)
            if entry is not None and entry[0] >= time.time():
                _sentry_metric("count", "cache.hit", 1, cache_key_prefix=prefix)
                return entry[1]
            inflight = self._inflight.get(key)
            if inflight is None:
                inflight = {"event": threading.Event(), "ok": False, "value": None, "error": None}
                self._inflight[key] = inflight
                is_leader = True
            else:
                is_leader = False

        if not is_leader:
            _sentry_metric("count", "cache.hit", 1, cache_key_prefix=prefix)
            # Espera limitada: sem timeout, uma query travada no líder prende todos os
            # seguidores da mesma chave — que é o caso normal (todo mundo no mesmo
            # dashboard), drenando o threadpool inteiro em vez de falhar 1 request.
            if not inflight["event"].wait(timeout=settings.CACHE_LEADER_WAIT_TIMEOUT):
                raise HTTPException(
                    status_code=504,
                    detail="Tempo limite aguardando a consulta em andamento.",
                )
            if inflight["ok"]:
                return inflight["value"]
            # error só é preenchido no except Exception do líder; se ele morreu com
            # BaseException, `raise None` viraria TypeError e mascararia a causa.
            raise inflight["error"] or RuntimeError("Falha na consulta compartilhada.")

        _sentry_metric("count", "cache.miss", 1, cache_key_prefix=prefix)
        try:
            value = fetcher()
            self.set(key, value)
            inflight["ok"] = True
            inflight["value"] = value
            return value
        except Exception as exc:
            inflight["error"] = exc
            raise
        finally:
            with self._lock:
                self._inflight.pop(key, None)
            inflight["event"].set()


cache_manager = CacheManager(ttl_seconds=settings.CACHE_TTL_SECONDS)
