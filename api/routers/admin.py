from typing import Any, Dict

import pyodbc
from fastapi import APIRouter, HTTPException, Query, Request

import config.settings as settings
from api.dependencias import require_auth
from core.telemetry.agent_logger import _agent_ndjson, _sentry_log
from core.utils.index_helpers import apply_indexes_on_database, list_index_status
from core.utils.validation import validate_database

router = APIRouter(prefix="/admin")


def _ensure_index_admin_allowed() -> None:
    if not settings.ENABLE_INDEX_ADMIN:
        raise HTTPException(
            status_code=403,
            detail=(
                "Endpoints de administracao de indices desabilitados. "
                "Habilite com ENABLE_INDEX_ADMIN=true no .env e rode em janela de manutencao."
            ),
        )


@router.get("/indexes/status/{database_name}")
def admin_indexes_status(database_name: str, request: Request) -> Dict[str, Any]:
    require_auth(request)
    _ensure_index_admin_allowed()
    database_name = validate_database(database_name)
    try:
        indexes = list_index_status(database_name)
    except pyodbc.Error as exc:
        _agent_ndjson(
            "OBS",
            "admin.py:admin_indexes_status:error",
            "admin_indexes_status_error",
            {"database": database_name, "error": str(exc)},
        )
        _sentry_log("error", "Erro ao inspecionar indices.", database=database_name, error=str(exc))
        raise HTTPException(status_code=500, detail="Erro ao inspecionar indices.") from exc

    total = len(indexes)
    existing = sum(1 for i in indexes if i["exists"])
    return {
        "database": database_name,
        "total_recommended": total,
        "existing": existing,
        "missing": total - existing,
        "indexes": indexes,
    }


@router.post("/indexes/apply/{database_name}")
def admin_indexes_apply(
    database_name: str,
    request: Request,
    dry_run: bool = Query(True, description="Quando true (padrao), apenas retorna o SQL que seria executado."),
    online: bool = Query(False, description="Tenta ONLINE = ON (requer SQL Server Enterprise)."),
    update_statistics: bool = Query(False, description="Roda UPDATE STATISTICS WITH FULLSCAN para as tabelas afetadas."),
) -> Dict[str, Any]:
    require_auth(request)
    _ensure_index_admin_allowed()
    database_name = validate_database(database_name)
    _agent_ndjson(
        "H1",
        "admin.py:admin_indexes_apply:start",
        "admin_indexes_apply_start",
        {
            "database": database_name,
            "dry_run": dry_run,
            "online": online,
            "update_statistics": update_statistics,
        },
    )
    try:
        result = apply_indexes_on_database(
            database_name,
            online=online,
            dry_run=dry_run,
            update_statistics=update_statistics,
        )
    except HTTPException:
        raise
    except pyodbc.Error as exc:
        _agent_ndjson(
            "OBS",
            "admin.py:admin_indexes_apply:error",
            "admin_indexes_apply_error",
            {"database": database_name, "error": str(exc)},
        )
        _sentry_log("error", "Erro ao aplicar indices.", database=database_name, error=str(exc))
        raise HTTPException(status_code=500, detail="Erro ao aplicar indices.") from exc

    _agent_ndjson(
        "H1",
        "admin.py:admin_indexes_apply:end",
        "admin_indexes_apply_end",
        {
            "database": database_name,
            "dry_run": dry_run,
            "online": online,
            "update_statistics": update_statistics,
            "elapsed_ms": result.get("elapsed_ms"),
            "created": sum(1 for s in result.get("indexes", []) if s.get("action") == "created"),
            "failed": sum(1 for s in result.get("indexes", []) if s.get("action") == "failed"),
        },
    )
    return result
