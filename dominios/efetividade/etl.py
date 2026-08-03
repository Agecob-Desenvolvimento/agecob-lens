import threading
import time
from typing import Any, Dict, List, Optional

import config.settings as settings
from core.database.query_executor import run_query
from core.telemetry.agent_logger import _agent_ndjson, _sentry_log
from dominios.efetividade.queries import _EF_BUILDER_MAP, _EF_DB_VARIANTS


class EfetividadeETL:
    def __init__(self) -> None:
        self._store: Dict[str, List[Dict[str, Any]]] = {}
        self._lock = threading.Lock()
        self._last_run: Optional[float] = None
        self._thread_started = False

    def run(self) -> None:
        conn_db = settings.ALLOWED_DATABASES[0]
        results: Dict[str, List[Dict[str, Any]]] = {}
        for key, builder in _EF_BUILDER_MAP.items():
            for db_variant in _EF_DB_VARIANTS:
                store_key = f"{key}:{db_variant}"
                try:
                    query = builder(db_variant)
                    rows = run_query(query, conn_db, context=f"efetividade-etl/{store_key}")
                    results[store_key] = rows
                except Exception as exc:
                    _agent_ndjson(
                        "OBS",
                        f"etl.py:efetividade_etl:{store_key}",
                        "etl_error",
                        {"error": str(exc)},
                    )
                    _sentry_log("error", "Falha no ETL de efetividade (background).", store_key=store_key, error=str(exc))
        with self._lock:
            self._store.update(results)
            self._last_run = time.time()

    def loop(self) -> None:
        self.run()
        while True:
            time.sleep(settings.EFETIVIDADE_ETL_TTL_SECONDS)
            self.run()

    def start_background(self) -> None:
        if self._thread_started:
            return
        worker = threading.Thread(
            target=self.loop,
            name="efetividade-etl",
            daemon=True,
        )
        worker.start()
        self._thread_started = True

    def get_store(self) -> Dict[str, List[Dict[str, Any]]]:
        with self._lock:
            return dict(self._store)

    def get_last_run(self) -> Optional[float]:
        with self._lock:
            return self._last_run


efetividade_etl = EfetividadeETL()
