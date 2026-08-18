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
    # Estado POR CHAVE: last_etl_run global mentia quando só esta série falhava —
    # as linhas antigas continuavam servidas com carimbo de hora nova e errors: [].
    rows, fetched_at, erro = efetividade_etl.get_key_state(store_key)
    if rows is None:
        raise HTTPException(status_code=503, detail="ETL ainda não concluído. Tente novamente em instantes.")
    sources = settings.ALLOWED_DATABASES if db_variant == "todos" else [db_variant]
    return build_response_envelope(
        rows,
        sources,
        errors=[{"source": store_key, "message": f"Última atualização falhou: {erro}"}] if erro else None,
        filters={"period": "2026+", "database": db_variant},
        quality={
            "last_etl_run": datetime.fromtimestamp(fetched_at, tz=timezone.utc).isoformat() if fetched_at else None,
            "stale": bool(erro),
        },
    )
