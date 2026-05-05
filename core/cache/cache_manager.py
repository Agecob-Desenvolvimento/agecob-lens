import threading
import time
from typing import Any, Callable, Dict, Optional, Tuple

import config.settings as settings


class CacheManager:
    def __init__(self, ttl_seconds: float) -> None:
        self._ttl = ttl_seconds
        self._store: Dict[str, Tuple[float, Any]] = {}
        self._lock = threading.Lock()

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
        hit = self.get(key)
        if hit is not None:
            return hit
        value = fetcher()
        self.set(key, value)
        return value


cache_manager = CacheManager(ttl_seconds=settings.CACHE_TTL_SECONDS)
