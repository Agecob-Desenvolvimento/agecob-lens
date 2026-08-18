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
        # Por chave: quando aquelas linhas foram buscadas, e o erro da última
        # tentativa (se houve). Sem isso, uma chave que falha mantém as linhas
        # antigas e herda um _last_run novo — dado velho carimbado como fresco.
        self._fetched_at: Dict[str, float] = {}
        self._errors: Dict[str, str] = {}
        self._thread_started = False

    def run(self) -> None:
        conn_db = settings.ALLOWED_DATABASES[0]
        results: Dict[str, List[Dict[str, Any]]] = {}
        errors: Dict[str, str] = {}
        for key, builder in _EF_BUILDER_MAP.items():
            for db_variant in _EF_DB_VARIANTS:
                store_key = f"{key}:{db_variant}"
                try:
                    query = builder(db_variant)
                    rows = run_query(query, conn_db, context=f"efetividade-etl/{store_key}")
                    results[store_key] = rows
                except Exception as exc:
                    errors[store_key] = str(exc)
                    _agent_ndjson(
                        "OBS",
                        f"etl.py:efetividade_etl:{store_key}",
                        "etl_error",
                        {"error": str(exc)},
                    )
                    _sentry_log("error", "Falha no ETL de efetividade (background).", store_key=store_key, error=str(exc))
        now = time.time()
        with self._lock:
            self._store.update(results)
            for store_key in results:
                self._fetched_at[store_key] = now
                self._errors.pop(store_key, None)
            self._errors.update(errors)
            # _last_run só avança se algo entrou: rodada 100% falha não é refresh.
            if results:
                self._last_run = now

    def get_key_state(self, store_key: str):
        """(rows, fetched_at, erro_da_ultima_tentativa) para uma chave do store."""
        with self._lock:
            return (
                self._store.get(store_key),
                self._fetched_at.get(store_key),
                self._errors.get(store_key),
            )

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
