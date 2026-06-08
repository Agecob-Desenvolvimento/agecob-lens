from datetime import date, datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query

import config.settings as settings
from core.database.query_executor import run_query
from dominios.efetividade.queries import _build_ef_curva_quebra_query, _build_ef_resumo_params, _build_ef_resumo_sql
from dominios.efetividade.servico import get_efetividade, resolve_ef_db

router = APIRouter(prefix="/efetividade")


@router.get("/diaria-primeira")
def get_ef_diaria_primeira(db: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return get_efetividade("diaria-primeira", db)


@router.get("/mensal-primeira")
def get_ef_mensal_primeira(db: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return get_efetividade("mensal-primeira", db)


@router.get("/diaria-colchao")
def get_ef_diaria_colchao(db: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return get_efetividade("diaria-colchao", db)


@router.get("/mensal-colchao")
def get_ef_mensal_colchao(db: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return get_efetividade("mensal-colchao", db)


@router.get("/mensal-agente-primeira")
def get_ef_mensal_agente_primeira(db: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return get_efetividade("mensal-agente-primeira", db)


@router.get("/mensal-agente-colchao")
def get_ef_mensal_agente_colchao(db: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return get_efetividade("mensal-agente-colchao", db)


@router.get("/mensal-agente-colchao-vencimento")
def get_ef_mensal_agente_colchao_vencimento(db: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return get_efetividade("mensal-agente-colchao-vencimento", db)


@router.get("/diaria-colchao-vencimento")
def get_ef_diaria_colchao_vencimento(db: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return get_efetividade("diaria-colchao-vencimento", db)


@router.get("/mensal-colchao-vencimento")
def get_ef_mensal_colchao_vencimento(db: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    return get_efetividade("mensal-colchao-vencimento", db)


@router.get("/resumo")
def get_ef_resumo(
    date_from: str = Query(..., description="Start date YYYY-MM-DD (DT_VENCIMENTO >=)"),
    date_to: str = Query(..., description="End date YYYY-MM-DD (DT_VENCIMENTO <=)"),
    db: Optional[str] = Query(default=None),
    parcela_tipo: str = Query(default="primeira"),
    id_portfolio: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    if parcela_tipo not in ("primeira", "colchao"):
        raise HTTPException(status_code=422, detail="parcela_tipo must be 'primeira' or 'colchao'")
    try:
        date_from_obj = date.fromisoformat(date_from)
        date_to_obj = date.fromisoformat(date_to)
    except ValueError:
        raise HTTPException(status_code=422, detail="date_from and date_to must be YYYY-MM-DD")
    # YYYYMMDD literals embedded in SQL — safe (validated above) and unambiguous in SQL Server
    date_from_lit = date_from_obj.strftime("%Y%m%d")
    date_to_lit = date_to_obj.strftime("%Y%m%d")
    db_variant = resolve_ef_db(db)
    kpi_sql, daily_sql = _build_ef_resumo_sql(db_variant, parcela_tipo, date_from_lit, date_to_lit, id_portfolio)
    params = _build_ef_resumo_params(db_variant, id_portfolio)
    conn_db = settings.ALLOWED_DATABASES[0]

    kpi_rows = run_query(kpi_sql, conn_db, params=params, context="ef-resumo/kpi")
    daily_rows = run_query(daily_sql, conn_db, params=params, context="ef-resumo/daily")

    # Serialize date objects to ISO strings for JSON transport
    for row in daily_rows:
        if hasattr(row.get("dia"), "isoformat"):
            row["dia"] = row["dia"].isoformat()

    kpi: Dict[str, Any] = kpi_rows[0] if kpi_rows else {
        "generated": 0, "to_mature": 0, "overdue_unpaid": 0, "paid_on_time": 0, "broken": 0, "conversion_pct": 0.0,
        "amount_maturing": 0.0, "amount_received": 0.0, "effectiveness_pct": 0.0,
    }

    valid_days = [d for d in daily_rows if d.get("generated", 0) > 0]
    best_day = max(valid_days, key=lambda d: d["effectiveness_pct"], default=None) if valid_days else None
    worst_day = min(valid_days, key=lambda d: d["effectiveness_pct"], default=None) if valid_days else None

    sources = settings.ALLOWED_DATABASES if db_variant == "todos" else [db_variant]
    return {
        "meta": {
            "generated_at": datetime.now(tz=timezone.utc).isoformat(),
            "sources": sources,
            "filters": {
                "date_from": date_from,
                "date_to": date_to,
                "parcela_tipo": parcela_tipo,
                "db": db_variant,
                "id_portfolio": id_portfolio,
            },
        },
        "data": {
            "kpis": kpi,
            "daily": daily_rows,
            "best_day": best_day,
            "worst_day": worst_day,
        },
        "errors": [],
    }


@router.get("/curva-quebra")
def get_ef_curva_quebra(
    date_from: str = Query(..., description="Start date YYYY-MM-DD (DT_VENCIMENTO >=)"),
    date_to: str = Query(..., description="End date YYYY-MM-DD (DT_VENCIMENTO <=)"),
    db: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    try:
        date_from_obj = date.fromisoformat(date_from)
        date_to_obj = date.fromisoformat(date_to)
    except ValueError:
        raise HTTPException(status_code=422, detail="date_from and date_to must be YYYY-MM-DD")
    date_from_lit = date_from_obj.strftime("%Y%m%d")
    date_to_lit = date_to_obj.strftime("%Y%m%d")
    db_variant = resolve_ef_db(db)
    query = _build_ef_curva_quebra_query(db_variant, date_from_lit, date_to_lit)
    conn_db = settings.ALLOWED_DATABASES[0]
    rows = run_query(query, conn_db, context="ef-curva-quebra")
    sources = settings.ALLOWED_DATABASES if db_variant == "todos" else [db_variant]
    return {
        "meta": {
            "generated_at": datetime.now(tz=timezone.utc).isoformat(),
            "sources": sources,
            "filters": {"db": db_variant, "date_from": date_from, "date_to": date_to},
        },
        "data": rows,
        "errors": [],
    }