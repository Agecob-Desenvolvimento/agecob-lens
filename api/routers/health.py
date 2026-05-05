from typing import Dict

from fastapi import APIRouter, HTTPException

from core.database.query_executor import run_query
from core.telemetry.agent_logger import _agent_ndjson
from core.utils.validation import validate_database

router = APIRouter(prefix="/health")


@router.get("/db")
def healthcheck_db() -> Dict[str, str]:
    database_name = "COBwebRCBAUTOS"
    try:
        rows = run_query("SELECT 1 AS ok", database_name)
        if rows and rows[0].get("ok") == 1:
            return {"status": "ok", "database": database_name, "connection": "connected"}
        raise HTTPException(status_code=500, detail="Conexão com o banco sem retorno esperado.")
    except HTTPException as exc:
        _agent_ndjson(
            "OBS",
            "health.py:healthcheck_db:error",
            "healthcheck_error",
            {"database": database_name, "error": str(exc.detail)},
        )
        raise HTTPException(
            status_code=500,
            detail="Falha no healthcheck do banco.",
        ) from exc


@router.get("/db/{database_name}")
def healthcheck_db_por_banco(database_name: str) -> Dict[str, str]:
    database_name = validate_database(database_name)
    try:
        rows = run_query("SELECT 1 AS ok", database_name)
        if rows and rows[0].get("ok") == 1:
            return {"status": "ok", "database": database_name, "connection": "connected"}
        raise HTTPException(status_code=500, detail="Conexão com o banco sem retorno esperado.")
    except HTTPException as exc:
        _agent_ndjson(
            "OBS",
            "health.py:healthcheck_db_por_banco:error",
            "healthcheck_error",
            {"database": database_name, "error": str(exc.detail)},
        )
        raise HTTPException(
            status_code=500,
            detail="Falha no healthcheck do banco.",
        ) from exc
