import threading
import time
from typing import Any, Callable, Dict, Optional, Tuple

import config.settings as settings


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
            self._store[key] = (time.time() + self._ttl, value)

    def get_or_compute(self, key: str, fetcher: Callable[[], Any]) -> Any:
        """
        Concurrent calls with the same key share one fetcher() execution
        (single-flight) instead of each firing its own duplicate query.
        """
        hit = self.get(key)
        if hit is not None:
            return hit

        with self._lock:
            entry = self._store.get(key)
            if entry is not None and entry[0] >= time.time():
                return entry[1]
            inflight = self._inflight.get(key)
            if inflight is None:
                inflight = {"event": threading.Event(), "ok": False, "value": None, "error": None}
                self._inflight[key] = inflight
                is_leader = True
            else:
                is_leader = False

        if not is_leader:
            inflight["event"].wait()
            if inflight["ok"]:
                return inflight["value"]
            raise inflight["error"]

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
