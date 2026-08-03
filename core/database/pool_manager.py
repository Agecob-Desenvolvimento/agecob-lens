import os
import queue
import threading
import time
from contextlib import contextmanager
from typing import Dict, Iterator, Optional

import pyodbc
from fastapi import HTTPException

import config.settings as settings
from core.telemetry.agent_logger import _agent_ndjson, _sentry_log, _sentry_metric


class PoolManager:
    def __init__(self) -> None:
        self._pools: Dict[str, queue.Queue] = {}
        self._lock = threading.Lock()

    def _pool_for(self, database_name: str) -> queue.Queue:
        pool = self._pools.get(database_name)
        if pool is not None:
            return pool
        with self._lock:
            pool = self._pools.get(database_name)
            if pool is None:
                pool = queue.Queue(maxsize=settings._DB_POOL_SIZE)
                self._pools[database_name] = pool
            return pool

    def _open_raw_connection(self, database_name: str) -> pyodbc.Connection:
        driver = os.getenv("DB_DRIVER", "ODBC Driver 17 for SQL Server")
        server = (os.getenv("DB_SERVER") or "").strip()
        username = (os.getenv("DB_USER") or "").strip()
        password = (os.getenv("DB_PASSWORD") or "").strip()
        if not server:
            raise HTTPException(status_code=500, detail="DB_SERVER não configurado.")
        if not username:
            raise HTTPException(status_code=500, detail="DB_USER não configurado.")
        if not password:
            raise HTTPException(
                status_code=500,
                detail="DB_PASSWORD não configurado. Defina no arquivo .env ou nas variáveis de ambiente.",
            )

        conn_str = (
            f"DRIVER={{{driver}}};"
            f"SERVER={server};"
            f"DATABASE={database_name};"
            f"UID={username};"
            f"PWD={password};"
            "TrustServerCertificate=yes;"
        )

        try:
            return pyodbc.connect(conn_str, timeout=10)
        except pyodbc.Error as exc:
            _agent_ndjson(
                "OBS",
                "pool_manager.py:_open_raw_connection:error",
                "db_connect_error",
                {"database": database_name, "error": str(exc)},
            )
            _sentry_log("error", "Erro ao conectar no banco de dados.", database=database_name, error=str(exc))
            raise HTTPException(
                status_code=500,
                detail="Erro ao conectar no banco de dados.",
            ) from exc

    def _conn_is_alive(self, conn: pyodbc.Connection) -> bool:
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            cursor.close()
            return True
        except Exception:
            return False

    @contextmanager
    def get_connection(self, database_name: str) -> Iterator[pyodbc.Connection]:
        acquire_started_at = time.perf_counter()
        pool = self._pool_for(database_name)
        conn: Optional[pyodbc.Connection] = None
        opened_at: float = 0.0

        try:
            conn, opened_at = pool.get_nowait()
        except queue.Empty:
            conn = None

        if conn is not None:
            expired = (time.time() - opened_at) > settings._DB_POOL_MAX_AGE_SECONDS
            if expired or not self._conn_is_alive(conn):
                try:
                    conn.close()
                except Exception:
                    pass
                conn = None

        source = "reused" if conn is not None else "opened"
        if conn is None:
            conn = self._open_raw_connection(database_name)
            opened_at = time.time()

        _sentry_metric(
            "distribution",
            "db.pool_acquire_ms",
            round((time.perf_counter() - acquire_started_at) * 1000, 2),
            unit="millisecond",
            database=database_name,
            source=source,
        )

        ok = False
        try:
            yield conn
            ok = True
        finally:
            if ok:
                try:
                    pool.put_nowait((conn, opened_at))
                except queue.Full:
                    try:
                        conn.close()
                    except Exception:
                        pass
            else:
                try:
                    conn.close()
                except Exception:
                    pass


pool_manager = PoolManager()
