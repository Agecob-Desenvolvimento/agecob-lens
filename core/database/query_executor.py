import time
from typing import Any, Dict, List, Optional, Tuple

import pyodbc
from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder

from core.database.pool_manager import pool_manager
from core.telemetry.agent_logger import _agent_ndjson, _sentry_log, _sentry_metric


def run_query(
    sql: str,
    database_name: str,
    params: Optional[Tuple[Any, ...]] = None,
    run_id: Optional[str] = None,
    context: str = "unknown",
) -> List[Dict[str, Any]]:
    """
    Executa query e retorna lista de dicionários (linhas).
    """
    try:
        started_at = time.perf_counter()
        _agent_ndjson(
            "OBS",
            "query_executor.py:run_query:start",
            "query_start",
            {"database": database_name, "context": context},
            run_id=run_id,
        )
        with pool_manager.get_connection(database_name) as conn:
            cursor = conn.cursor()
            if params:
                cursor.execute(sql, params)
            else:
                cursor.execute(sql)

            columns = [column[0] for column in cursor.description]
            rows = cursor.fetchall()
            result = [dict(zip(columns, row)) for row in rows]
            query_elapsed_ms = round((time.perf_counter() - started_at) * 1000, 2)
            _agent_ndjson(
                "OBS",
                "query_executor.py:run_query:end",
                "query_end",
                {
                    "database": database_name,
                    "context": context,
                    "rows_count": len(result),
                    "query_elapsed_ms": query_elapsed_ms,
                },
                run_id=run_id,
            )
            _sentry_metric(
                "distribution",
                "db.query_duration_ms",
                query_elapsed_ms,
                unit="millisecond",
                context=context,
                database=database_name,
            )
            return jsonable_encoder(result)
    except HTTPException:
        raise
    except pyodbc.Error as exc:
        _agent_ndjson(
            "OBS",
            "query_executor.py:run_query:error",
            "query_error",
            {
                "database": database_name,
                "context": context,
                "error": str(exc),
            },
            run_id=run_id,
        )
        _sentry_log("error", "Erro ao executar query.", database=database_name, context=context, error=str(exc))
        raise HTTPException(
            status_code=500,
            detail="Erro ao executar consulta no banco de dados.",
        ) from exc
