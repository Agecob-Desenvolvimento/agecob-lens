from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

import config.settings as settings
from core.telemetry.agent_logger import _agent_ndjson, _sentry_log


def validate_database(database_name: str) -> str:
    normalized = database_name.strip().lower()
    if normalized not in settings.ALLOWED_DATABASES_MAP:
        raise HTTPException(
            status_code=400,
            detail=f"Banco inválido. Use um destes: {', '.join(settings.ALLOWED_DATABASES)}",
        )
    return settings.ALLOWED_DATABASES_MAP[normalized]


def validate_database_or_todos(database_name: str) -> str:
    normalized = database_name.strip().lower()
    if normalized == "todos":
        return "todos"
    return validate_database(database_name)


def validate_produtividade_rows(
    rows: List[Dict[str, Any]],
    run_id: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    validated_rows: List[Dict[str, Any]] = []
    numeric_fields = [
        "qtd_acionamentos",
        "qtd_alo",
        "qtd_contatos",
        "cpc_percentual",
        "qtd_acordos",
        "qtd_acordos_por_contrato",
        "acordos_percentual",
        "valor_acordos",
        "acordo_medio",
        "parcelamento_medio",
        "desconto_medio_percentual",
        "valor_primeira_parcela",
        "qtd_rejeitados",
        "valor_rejeitados",
        "idade_media_acordos",
        "horas_trabalhadas",
    ]
    required_fields_missing_count = 0
    numeric_cast_failures = 0
    for row in rows:
        missing = [field for field in settings.PRODUCTIVITY_REQUIRED_FIELDS if field not in row]
        if missing:
            required_fields_missing_count += len(missing)
            _agent_ndjson(
                "OBS",
                "validation.py:validate_produtividade_rows:missing",
                "validation_fail",
                {"missing_fields": missing},
                run_id=run_id,
            )
            _sentry_log("warning", "Campos faltando na resposta de produtividade.", missing_fields=",".join(missing))
            raise HTTPException(status_code=500, detail=f"Productivity response missing fields: {missing}")
        normalized = {**row}
        for field in numeric_fields:
            value = normalized.get(field)
            try:
                if field == "cpc_percentual":
                    normalized[field] = int(float(value)) if value is not None else 0
                else:
                    normalized[field] = float(value) if value is not None else 0.0
            except (TypeError, ValueError):
                numeric_cast_failures += 1
                normalized[field] = 0 if field == "cpc_percentual" else 0.0
        normalized["CHAVE"] = str(normalized.get("CHAVE") or "")
        normalized["NOME"] = str(normalized.get("NOME") or "")
        validated_rows.append(normalized)
    metrics = {
        "required_fields_missing_count": required_fields_missing_count,
        "numeric_cast_failures": numeric_cast_failures,
        "rows_count": len(validated_rows),
    }
    _agent_ndjson(
        "OBS",
        "validation.py:validate_produtividade_rows:ok",
        "validation_ok",
        metrics,
        run_id=run_id,
    )
    return validated_rows, metrics
