import time
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

import config.settings as settings
from core.database.query_executor import run_query
from core.telemetry.agent_logger import _agent_ndjson, _sentry_log
from core.utils.validation import validate_database
from dominios.efetividade.etl import efetividade_etl

router = APIRouter(prefix="/health")


def _sonda(database_name: str) -> str:
    """'ok' ou a razão da falha. Nunca levanta — health check não derruba a si mesmo."""
    try:
        rows = run_query("SELECT 1 AS ok", database_name)
    except HTTPException as exc:
        return str(exc.detail)
    except Exception as exc:  # noqa: BLE001
        return str(exc)
    return "ok" if rows and rows[0].get("ok") == 1 else "resposta inesperada do banco"


@router.get("/live")
def healthcheck_live() -> Dict[str, str]:
    """Liveness: processo de pé, sem tocar no banco.

    Sem esta rota, um monitor de uptime batendo a cada 30s abria um login real no
    SQL Server a cada verificação.
    """
    return {"status": "ok"}


@router.get("/ready")
def healthcheck_ready() -> Any:
    """Readiness: estado de cada dependência. 503 quando alguma está fora."""
    bancos = {db: _sonda(db) for db in settings.ALLOWED_DATABASES}
    fora = [db for db, estado in bancos.items() if estado != "ok"]

    ultimo_etl = efetividade_etl.get_last_run()
    corpo: Dict[str, Any] = {
        "status": "degraded" if fora else "ok",
        "databases": bancos,
        "efetividade_etl": {
            "last_run_age_seconds": round(time.time() - ultimo_etl, 1) if ultimo_etl else None,
            "ttl_seconds": settings.EFETIVIDADE_ETL_TTL_SECONDS,
        },
    }
    if fora:
        _sentry_log("warning", "Readiness degradado.", databases_fora=",".join(fora))
        return JSONResponse(status_code=503, content=corpo)
    return corpo


@router.get("/db")
def healthcheck_db() -> Dict[str, str]:
    """Estado de TODOS os bancos configurados.

    Antes sondava só COBwebRCBAUTOS hardcoded: com o CONSUMER fora respondia
    {"status": "ok"} e tanto o banner do SPA (fetchHealth("todos") chama esta
    rota) quanto o monitor diziam saudável enquanto metade do dashboard dava 500.
    """
    bancos = {db: _sonda(db) for db in settings.ALLOWED_DATABASES}
    fora = [db for db, estado in bancos.items() if estado != "ok"]
    if fora:
        _agent_ndjson(
            "OBS",
            "health.py:healthcheck_db:error",
            "healthcheck_error",
            {"databases_fora": fora},
        )
        _sentry_log("warning", "Falha no healthcheck do banco.", databases_fora=",".join(fora))
        raise HTTPException(
            status_code=503,
            detail=f"Bancos indisponíveis: {', '.join(fora)}",
        )
    return {
        "status": "ok",
        "database": ", ".join(settings.ALLOWED_DATABASES),
        "connection": "connected",
    }


@router.get("/db/{database_name}")
def healthcheck_db_por_banco(database_name: str) -> Dict[str, str]:
    database_name = validate_database(database_name)
    estado = _sonda(database_name)
    if estado != "ok":
        _agent_ndjson(
            "OBS",
            "health.py:healthcheck_db_por_banco:error",
            "healthcheck_error",
            {"database": database_name, "error": estado},
        )
        _sentry_log("warning", "Falha no healthcheck do banco.", database=database_name, error=estado)
        raise HTTPException(status_code=503, detail="Falha no healthcheck do banco.")
    return {"status": "ok", "database": database_name, "connection": "connected"}
