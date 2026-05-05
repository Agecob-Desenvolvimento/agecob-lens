from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

import config.settings as settings
from core.utils.response_envelope import build_response_envelope
from core.utils.validation import validate_database
from dominios.efetividade.etl import efetividade_etl


def resolve_ef_db(db: Optional[str]) -> str:
    if not db or db.strip().lower() == "todos":
        return "todos"
    return validate_database(db)


def get_efetividade(key: str, db: Optional[str] = None) -> Dict[str, Any]:
    db_variant = resolve_ef_db(db)
    store_key = f"{key}:{db_variant}"
    with efetividade_etl._lock:
        rows = efetividade_etl._store.get(store_key)
        last_run = efetividade_etl._last_run
    if rows is None:
        raise HTTPException(status_code=503, detail="ETL ainda não concluído. Tente novamente em instantes.")
    sources = settings.ALLOWED_DATABASES if db_variant == "todos" else [db_variant]
    return build_response_envelope(
        rows,
        sources,
        filters={"period": "2026+", "database": db_variant},
        quality={"last_etl_run": datetime.fromtimestamp(last_run, tz=timezone.utc).isoformat() if last_run else None},
    )
