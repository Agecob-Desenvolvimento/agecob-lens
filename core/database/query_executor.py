import time
from typing import Any, Dict, List, Optional, Tuple

import pyodbc
from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder

import config.settings as settings
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
            # Timeout de execução. pyodbc.connect(timeout=) cobre só o login.
            conn.timeout = settings.DB_QUERY_TIMEOUT_SECONDS
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
        # SQLSTATE HYT00/HYT01 = timeout. Vira 504 p/ o cliente distinguir "lento"
        # de "quebrado" — sem isso todo problema de banco chega como 500 genérico.
        sqlstate = str(exc.args[0]) if exc.args else ""
        timed_out = sqlstate.startswith("HYT")
        _agent_ndjson(
            "OBS",
            "query_executor.py:run_query:error",
            "query_timeout" if timed_out else "query_error",
            {
                "database": database_name,
                "context": context,
                "sqlstate": sqlstate,
                "error": str(exc),
            },
            run_id=run_id,
        )
        _sentry_log("error", "Erro ao executar query.", database=database_name, context=context, error=str(exc))
        raise HTTPException(
            status_code=504 if timed_out else 500,
            detail=(
                "Consulta excedeu o tempo limite no banco de dados."
                if timed_out
                else "Erro ao executar consulta no banco de dados."
            ),
        ) from exc
    except Exception as exc:
        # run_query só traduzia pyodbc.Error; qualquer outro erro (ex.: cursor.description
        # None -> TypeError no zip das colunas) escapava cru como 500 sem envelope.
        _agent_ndjson(
            "OBS",
            "query_executor.py:run_query:error",
            "query_unexpected_error",
            {"database": database_name, "context": context, "error": str(exc)},
            run_id=run_id,
        )
        _sentry_log("error", "Erro inesperado ao executar query.", database=database_name, context=context, error=str(exc))
        raise HTTPException(
            status_code=500,
            detail="Erro ao executar consulta no banco de dados.",
        ) from exc
