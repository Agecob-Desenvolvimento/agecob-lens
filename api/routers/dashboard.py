import json
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

import numpy as np
from fastapi import APIRouter, File, Query, Request, UploadFile

import config.settings as settings
from core.cache.cache_manager import cache_manager
from core.database.query_executor import run_query
from core.telemetry.agent_logger import _agent_ndjson
from core.utils.pagination import extract_total_rows, normalize_pagination
from core.utils.response_envelope import build_response_envelope, print_rows_preview
from core.utils.sql_helpers import (
    build_assessoria_params,
    normalize_assessoria_filter,
)
from core.utils.validation import (
    validate_database,
    validate_database_or_todos,
    validate_produtividade_rows,
)
from dominios.acordos.queries import (
    QUERY_ACORDOS_HOJE,
    build_agreements_tabela_query,
    build_tabela_performance_periodo_query,
)
from dominios.graficos.queries import (
    build_acordos_detalhe_query,
    build_acordos_detalhe_global_query,
    build_acordos_por_portfolio_query,
    build_excecoes_detalhe_query,
    build_excecoes_detalhe_global_query,
    build_excecoes_por_agente_query,
    build_excecoes_por_portfolio_query,
    build_excecoes_sem_portfolio_query,
    build_portfolio_rollup_query,
    build_primeira_parcela_dia_query,
    build_primeira_parcela_por_agente_query,
    build_primeira_parcela_por_portfolio_query,
    build_quebrados_detalhe_query,
    build_quebrados_por_portfolio_query,
    build_rejeitados_detalhe_query,
    build_rejeitados_detalhe_global_query,
    build_rejeitados_por_portfolio_query,
    build_real_por_portfolio_query,
    build_excecoes_detalhe_agente_query,
    build_rejeitados_detalhe_agente_query,
    build_quebrados_detalhe_agente_query,
)
from dominios.produtividade.queries import build_benchmark_query, build_produtividade_query, build_produtividade_hoje_params
from dominios.metas.extrator import processar_pdf, salvar_resultado
from dominios.produtividade.servico import produtividade_servico

router = APIRouter(prefix="/dashboard")


# ─────────────────────────────────────────────────────────────────
# HELPERS INTERNOS
# ─────────────────────────────────────────────────────────────────
def _run_dashboard_chart(
    db: str,
    query_builder,
    context: str,
    request: Optional[Request],
    *,
    query_args: Tuple[Any, ...] = (),
    params: Optional[Tuple[Any, ...]] = None,
    filters_extra: Optional[Dict[str, Any]] = None,
    cache_key_suffix: str,
) -> Dict[str, Any]:
    """Helper central que executa qualquer builder de gráfico/card.

    O resultado (apenas as linhas de dados) é cacheado por CACHE_TTL_SECONDS.
    O envelope continua sendo montado no request para preservar run_id e
    generated_at frescos.
    """
    run_id = getattr(request.state, "run_id", f"srv-{uuid4().hex[:12]}") if request else f"srv-{uuid4().hex[:12]}"
    validated_db = validate_database_or_todos(db)
    conn_db = settings.ALLOWED_DATABASES[0] if validated_db == "todos" else validated_db

    def _compute() -> List[Dict[str, Any]]:
        query = query_builder(validated_db, *query_args)
        return run_query(query, conn_db, params=params, run_id=run_id, context=context)

    cache_key = f"chart|{context}|{validated_db}{cache_key_suffix}"
    rows = cache_manager.get_or_compute(cache_key, _compute)
    sources = settings.ALLOWED_DATABASES if validated_db == "todos" else [validated_db]
    filters = {"date": "today", "database": validated_db}
    if filters_extra:
        filters.update(filters_extra)
    return build_response_envelope(
        rows, sources,
        filters=filters,
        run_id=run_id,
    )


def _parse_period(
    date_from: Optional[str],
    date_to: Optional[str],
) -> tuple:
    """Valida e retorna (date_from_str, date_to_exclusive_str) ou (None, None) para hoje."""
    if not date_from or not date_to:
        return None, None
    try:
        df = date.fromisoformat(date_from)
        dt = date.fromisoformat(date_to)
        return df.isoformat(), (dt + timedelta(days=1)).isoformat()
    except ValueError:
        return None, None


def _get_dashboard_agentes_unificado(
    database_name: str,
    request: Optional[Request],
    context: str,
    date_from: Optional[str] = None,
    date_to_exclusive: Optional[str] = None,
) -> Dict[str, Any]:
    run_id = getattr(request.state, "run_id", f"srv-{uuid4().hex[:12]}") if request else f"srv-{uuid4().hex[:12]}"
    validated_database = validate_database_or_todos(database_name)

    def _compute() -> List[Dict[str, Any]]:
        query = build_produtividade_query(
            validated_database,
            use_distinct_esforco=False,
            date_from=date_from,
            date_to_exclusive=date_to_exclusive,
        )
        return run_query(
            query,
            settings.ALLOWED_DATABASES[0],
            run_id=run_id,
            context=context,
        )

    cache_key = f"produtividade|{context}|{validated_database}|{date_from or 'hoje'}|{date_to_exclusive or 'hoje'}"
    rows = cache_manager.get_or_compute(cache_key, _compute)
    sources = settings.ALLOWED_DATABASES if validated_database == "todos" else [validated_database]
    date_label = f"{date_from}/{date_to_exclusive}" if date_from else "today"
    return build_response_envelope(
        rows,
        sources,
        filters={"date": date_label, "database": validated_database},
        run_id=run_id,
    )


# ─────────────────────────────────────────────────────────────────
# ENDPOINTS: ACORDOS HOJE
# ─────────────────────────────────────────────────────────────────
@router.get("/acordos-hoje")
def get_dashboard_acordos_hoje(
    limit: Optional[int] = Query(default=None, ge=1, le=settings.ACORDOS_HOJE_MAX_LIMIT),
    offset: Optional[int] = Query(default=None, ge=0),
) -> Dict[str, Any]:
    database_name = "COBwebRCBAUTOS"
    lim, off = normalize_pagination(limit, offset)
    raw = run_query(QUERY_ACORDOS_HOJE, database_name, (date.today(), off, lim))
    rows, total = extract_total_rows(raw)
    print_rows_preview(rows, database_name, max_rows=5)
    return build_response_envelope(
        rows, [database_name],
        pagination={"limit": lim, "offset": off, "total": total, "returned": len(rows)},
    )


@router.get("/acordos-hoje/todos")
def get_dashboard_acordos_hoje_todos(
    limit: Optional[int] = Query(default=None, ge=1, le=settings.ACORDOS_HOJE_MAX_LIMIT),
    offset: Optional[int] = Query(default=None, ge=0),
) -> Dict[str, Any]:
    """
    Combina os dois bancos. Paginação aplicada por banco: cada banco recebe a
    mesma janela (limit/offset). Mantém compatibilidade — o frontend só
    pagina a grade detalhada, que naturalmente chega a poucas milhares de linhas.
    """
    all_rows: List[Dict[str, Any]] = []
    today = date.today()
    lim, off = normalize_pagination(limit, offset)
    totals: Dict[str, int] = {}
    for database_name in settings.ALLOWED_DATABASES:
        raw = run_query(QUERY_ACORDOS_HOJE, database_name, (today, off, lim))
        rows, total = extract_total_rows(raw)
        totals[database_name] = total
        print_rows_preview(rows, database_name, max_rows=5)
        for row in rows:
            row["banco_origem"] = database_name
        all_rows.extend(rows)
    return build_response_envelope(
        all_rows, settings.ALLOWED_DATABASES,
        pagination={
            "limit": lim, "offset": off,
            "total": sum(totals.values()),
            "total_por_banco": totals,
            "returned": len(all_rows),
        },
    )


@router.get("/acordos-hoje/{database_name}")
def get_dashboard_acordos_hoje_por_banco(
    database_name: str,
    limit: Optional[int] = Query(default=None, ge=1, le=settings.ACORDOS_HOJE_MAX_LIMIT),
    offset: Optional[int] = Query(default=None, ge=0),
) -> Dict[str, Any]:
    database_name = validate_database(database_name)
    lim, off = normalize_pagination(limit, offset)
    raw = run_query(QUERY_ACORDOS_HOJE, database_name, (date.today(), off, lim))
    rows, total = extract_total_rows(raw)
    print_rows_preview(rows, database_name, max_rows=5)
    return build_response_envelope(
        rows, [database_name],
        pagination={"limit": lim, "offset": off, "total": total, "returned": len(rows)},
    )


@router.get("/acordos-hoje-agente/{db}")
def get_dashboard_acordos_hoje_agente(
    db: str,
    agente: Optional[str] = Query(default=None),
    assessoria: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    run_id = getattr(request.state, "run_id", f"srv-{uuid4().hex[:12]}") if request else f"srv-{uuid4().hex[:12]}"
    validated_db = validate_database_or_todos(db)
    agente_aplicado = (agente or "").strip()
    assessoria_applied, assessoria_token = normalize_assessoria_filter(assessoria)
    filter_by_agente = bool(agente_aplicado and agente_aplicado.lower() != "todos")
    query = build_agreements_tabela_query(validated_db, filter_by_agente, assessoria_token)
    conn_db = settings.ALLOWED_DATABASES[0] if validated_db == "todos" else validated_db
    params_list: List[Any] = list(
        build_assessoria_params(
            assessoria_token,
            2 if validated_db == "todos" else 1,
        )
    )
    if filter_by_agente:
        params_list.append(agente_aplicado)
    params: Optional[Tuple[Any, ...]] = tuple(params_list) if params_list else None
    rows = run_query(
        query,
        conn_db,
        params=params,
        run_id=run_id,
        context="dashboard/acordos-hoje-agente",
    )
    sources = settings.ALLOWED_DATABASES if validated_db == "todos" else [validated_db]
    return build_response_envelope(
        rows,
        sources,
        filters={
            "date": "today",
            "database": validated_db,
            "agente": agente_aplicado or "todos",
            "assessoria": assessoria_applied,
        },
        run_id=run_id,
    )


# ─────────────────────────────────────────────────────────────────
# ENDPOINTS: TABELA PERFORMANCE PERÍODO (2026-04-01 a 2026-05-05)
# ─────────────────────────────────────────────────────────────────
@router.get("/tabela-performance-periodo/{db}")
def get_tabela_performance_periodo(
    db: str,
    agente: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    run_id = getattr(request.state, "run_id", f"srv-{uuid4().hex[:12]}") if request else f"srv-{uuid4().hex[:12]}"
    validated_db = validate_database_or_todos(db)
    agente_aplicado = (agente or "").strip()
    filter_by_agente = bool(agente_aplicado and agente_aplicado.lower() != "todos")
    parsed_from, parsed_to_excl = _parse_period(date_from, date_to)
    query = build_tabela_performance_periodo_query(
        validated_db,
        filter_by_agente,
        date_from=parsed_from or "2026-04-01",
        date_to_exclusive=parsed_to_excl or "2026-05-06",
    )
    conn_db = settings.ALLOWED_DATABASES[0] if validated_db == "todos" else validated_db
    params: Optional[Tuple[Any, ...]] = (agente_aplicado,) if filter_by_agente else None
    rows = run_query(
        query,
        conn_db,
        params=params,
        run_id=run_id,
        context="dashboard/tabela-performance-periodo",
    )
    sources = settings.ALLOWED_DATABASES if validated_db == "todos" else [validated_db]
    date_label = f"{parsed_from}/{date_to}" if parsed_from else "2026-04-01/2026-05-05"
    return build_response_envelope(
        rows,
        sources,
        filters={
            "date": date_label,
            "database": validated_db,
            "agente": agente_aplicado or "todos",
        },
        run_id=run_id,
    )


# ─────────────────────────────────────────────────────────────────
# ENDPOINTS: PORTFOLIO LIST
# ─────────────────────────────────────────────────────────────────
@router.get("/portfolios/{database_name}")
def get_portfolios(database_name: str, request: Request = None) -> Dict[str, Any]:
    run_id = getattr(request.state, "run_id", f"srv-{uuid4().hex[:12]}") if request else f"srv-{uuid4().hex[:12]}"
    validated_db = validate_database(database_name)
    rows = run_query(
        "SELECT DISTINCT CAMPO010 AS id, CAMPO010 AS nome FROM DIV_AUX (NOLOCK) "
        "WHERE CAMPO010 IS NOT NULL AND LTRIM(RTRIM(CAMPO010)) <> '' ORDER BY CAMPO010",
        validated_db,
        run_id=run_id,
        context="dashboard/portfolios",
    )
    return build_response_envelope(
        rows, [validated_db], filters={}, run_id=run_id,
    )


# ─────────────────────────────────────────────────────────────────
# ENDPOINTS: PRODUTIVIDADE
# ─────────────────────────────────────────────────────────────────
@router.get("/produtividade-hoje/{database_name}")
def get_dashboard_produtividade_hoje(
    database_name: str,
    assessoria: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    portfolio: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    endpoint_started_at = time.perf_counter()
    run_id = getattr(request.state, "run_id", f"srv-{uuid4().hex[:12]}") if request else f"srv-{uuid4().hex[:12]}"
    database_name = validate_database(database_name)
    parsed_from, parsed_to_excl = _parse_period(date_from, date_to)
    assessoria_applied, token = normalize_assessoria_filter(assessoria)

    def _compute() -> tuple:
        prod_params = build_produtividade_hoje_params(portfolio)
        raw = run_query(
            build_produtividade_query(
                database_name,
                use_distinct_esforco=True,
                date_from=parsed_from,
                date_to_exclusive=parsed_to_excl,
                portfolio=portfolio,
            ),
            database_name,
            params=prod_params,
            run_id=run_id,
            context="dashboard/produtividade-hoje",
        )
        return validate_produtividade_rows(raw, run_id=run_id)

    cache_key = f"produtividade-hoje|{database_name}|{parsed_from or 'hoje'}|{parsed_to_excl or 'hoje'}|{portfolio or 'all'}|{assessoria_applied or 'all'}"
    rows, validation_metrics = cache_manager.get_or_compute(cache_key, _compute)
    if token:
        rows = [
            row
            for row in rows
            if token in str(row.get("CHAVE", "")).upper()
            or token in str(row.get("NOME", "")).upper()
        ]
    quality = {
        "entrada_ok": True,
        "alimentacao_ok": True,
        "apresentacao_ready": True,
        "endpoint_total_elapsed_ms": round((time.perf_counter() - endpoint_started_at) * 1000, 2),
        **validation_metrics,
    }
    _agent_ndjson(
        "OBS",
        "dashboard.py:get_dashboard_produtividade_hoje:response_envelope",
        "response_envelope",
        {"database": database_name, "assessoria": assessoria_applied, **quality},
        run_id=run_id,
    )
    return build_response_envelope(
        rows,
        [database_name],
        filters={"date": "today", "assessoria": assessoria_applied},
        run_id=run_id,
        quality=quality,
    )


@router.get("/status-carga/{db}")
def get_dashboard_status_carga(
    db: str,
    assessoria: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    run_id = getattr(request.state, "run_id", f"srv-{uuid4().hex[:12]}") if request else f"srv-{uuid4().hex[:12]}"
    validated_db = validate_database_or_todos(db)
    targets = settings.ALLOWED_DATABASES if validated_db == "todos" else [validated_db]
    summaries: List[Dict[str, Any]] = []
    errors: List[Dict[str, str]] = []
    assessoria_applied, assessoria_token = normalize_assessoria_filter(assessoria)

    for source in targets:
        try:
            rows = run_query(
                build_produtividade_query(source, use_distinct_esforco=True),
                source,
                run_id=run_id,
                context="dashboard/status-carga",
            )
            rows, _ = validate_produtividade_rows(rows, run_id=run_id)
            if assessoria_token:
                rows = [
                    row
                    for row in rows
                    if assessoria_token in str(row.get("CHAVE", "")).upper()
                    or assessoria_token in str(row.get("NOME", "")).upper()
                ]
            summaries.append({
                "database": source,
                "agentes": len(rows),
                "qtd_acionamentos": int(sum(float(r.get("qtd_acionamentos", 0) or 0) for r in rows)),
                "qtd_contatos": int(sum(float(r.get("qtd_contatos", 0) or 0) for r in rows)),
                "qtd_acordos": int(sum(float(r.get("qtd_acordos", 0) or 0) for r in rows)),
                "valor_acordos": round(sum(float(r.get("valor_acordos", 0) or 0) for r in rows), 2),
                "qtd_excecoes": int(sum(float(r.get("qtd_excecoes", 0) or 0) for r in rows)),
                "valor_excecoes": round(sum(float(r.get("valor_excecoes", 0) or 0) for r in rows), 2),
            })
        except Exception as exc:
            from fastapi import HTTPException as _HTTPException
            detail = exc.detail if isinstance(exc, _HTTPException) else str(exc)
            errors.append({"source": source, "message": str(detail)})

    if not summaries:
        detail = errors[0]["message"] if errors else "Nenhuma fonte disponível para confirmar carga."
        from fastapi import HTTPException as _HTTPException
        raise _HTTPException(status_code=500, detail=detail)

    if validated_db == "todos" and len(summaries) > 1:
        summaries.append({
            "database": "todos",
            "agentes": sum(int(row.get("agentes", 0) or 0) for row in summaries),
            "qtd_acionamentos": sum(int(row.get("qtd_acionamentos", 0) or 0) for row in summaries),
            "qtd_contatos": sum(int(row.get("qtd_contatos", 0) or 0) for row in summaries),
            "qtd_acordos": sum(int(row.get("qtd_acordos", 0) or 0) for row in summaries),
            "valor_acordos": round(sum(float(row.get("valor_acordos", 0) or 0) for row in summaries), 2),
            "qtd_excecoes": sum(int(row.get("qtd_excecoes", 0) or 0) for row in summaries),
            "valor_excecoes": round(sum(float(row.get("valor_excecoes", 0) or 0) for row in summaries), 2),
        })

    quality = {
        "status": "ok" if not errors else "partial",
        "targets": len(targets),
        "sources_ok": len(summaries),
        "sources_error": len(errors),
    }
    return build_response_envelope(
        summaries,
        targets,
        errors=errors,
        filters={"date": "today", "database": validated_db, "assessoria": assessoria_applied},
        run_id=run_id,
        quality=quality,
    )


@router.get("/comparacao-agentes/{db}")
@router.get("/comparacao-agentes/{database_name}")
def get_dashboard_comparacao_agentes(
    db: Optional[str] = None,
    database_name: Optional[str] = None,
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    target_db = db if db is not None else (database_name or "")
    parsed_from, parsed_to_excl = _parse_period(date_from, date_to)
    return _get_dashboard_agentes_unificado(
        database_name=target_db,
        request=request,
        context="dashboard/comparacao-agentes",
        date_from=parsed_from,
        date_to_exclusive=parsed_to_excl,
    )


@router.get("/detalhamento-agentes/{database_name}")
def get_dashboard_detalhamento_agentes(
    database_name: str,
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    parsed_from, parsed_to_excl = _parse_period(date_from, date_to)
    return _get_dashboard_agentes_unificado(
        database_name=database_name,
        request=request,
        context="dashboard/detalhamento-agentes",
        date_from=parsed_from,
        date_to_exclusive=parsed_to_excl,
    )


@router.get("/produtividade/{database_name}")
def get_dashboard_produtividade(
    database_name: str,
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    parsed_from, parsed_to_excl = _parse_period(date_from, date_to)
    return _get_dashboard_agentes_unificado(
        database_name=database_name,
        request=request,
        context="dashboard/produtividade",
        date_from=parsed_from,
        date_to_exclusive=parsed_to_excl,
    )


@router.get("/produtividade-agentes")
def get_produtividade_agentes(force_refresh: bool = False) -> dict:
    return produtividade_servico.fetch_consolidado(force_refresh=force_refresh)


# ─────────────────────────────────────────────────────────────────
# ENDPOINTS: GRÁFICOS E CARDS
# ─────────────────────────────────────────────────────────────────
@router.get("/primeira-parcela-dia/{db}")
def get_primeira_parcela_dia(
    db: str,
    assessoria: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None, alias="dateFrom"),
    date_to: Optional[str] = Query(default=None, alias="dateTo"),
    request: Request = None,
) -> Dict[str, Any]:
    assessoria_applied, assessoria_token = normalize_assessoria_filter(assessoria)
    validated_db = validate_database_or_todos(db)
    parsed_from, parsed_to_excl = _parse_period(date_from, date_to)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    return _run_dashboard_chart(
        validated_db, build_primeira_parcela_dia_query,
        "dashboard/primeira-parcela-dia", request,
        query_args=(assessoria_token, parsed_from, parsed_to_excl),
        params=build_assessoria_params(
            assessoria_token,
            2 if validated_db == "todos" else 1,
        ) or None,
        filters_extra={"assessoria": assessoria_applied, "date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=f"|assessoria:{assessoria_token or 'todos'}{period_suffix}",
    )


@router.get("/primeira-parcela-por-portfolio/{db}")
def get_primeira_parcela_por_portfolio(
    db: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    """Valor da 1ª parcela agrupado por portfólio (apenas acordos aprovados)."""
    validated_db = validate_database_or_todos(db)
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    return _run_dashboard_chart(
        validated_db, build_primeira_parcela_por_portfolio_query,
        "dashboard/primeira-parcela-por-portfolio", request,
        query_args=(parsed_from, parsed_to_excl),
        filters_extra={"date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=period_suffix,
    )


@router.get("/excecoes-por-portfolio/{db}")
def get_excecoes_por_portfolio(
    db: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    return _run_dashboard_chart(
        db, build_excecoes_por_portfolio_query,
        "dashboard/excecoes-por-portfolio", request,
        query_args=(parsed_from, parsed_to_excl),
        filters_extra={"date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=period_suffix,
    )


@router.get("/excecoes-por-agente/{db}")
def get_excecoes_por_agente(
    db: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    return _run_dashboard_chart(
        db, build_excecoes_por_agente_query,
        "dashboard/excecoes-por-agente", request,
        query_args=(parsed_from, parsed_to_excl),
        filters_extra={"date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=period_suffix,
    )


@router.get("/portfolio-rollup/{db}")
def get_portfolio_rollup(
    db: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    """Cluster A consolidado (Phase 2): um scan agregando por portfólio + status.

    Slices de status reconstroem client-side os 5 endpoints por-portfólio:
    acordos/1ª parcela (1,3,12), exceções (5), rejeitados (7), quebrados (2).
    Reusa o mesmo cache TTL/envelope dos demais charts via _run_dashboard_chart.
    """
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    return _run_dashboard_chart(
        db, build_portfolio_rollup_query,
        "dashboard/portfolio-rollup", request,
        query_args=(parsed_from, parsed_to_excl),
        filters_extra={"date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=period_suffix,
    )


@router.get("/acordos-por-portfolio/{db}")
def get_acordos_por_portfolio(
    db: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    return _run_dashboard_chart(
        db, build_acordos_por_portfolio_query,
        "dashboard/acordos-por-portfolio", request,
        query_args=(parsed_from, parsed_to_excl),
        filters_extra={"date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=period_suffix,
    )


@router.get("/excecoes-sem-portfolio/{db}")
def get_excecoes_sem_portfolio(
    db: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    return _run_dashboard_chart(
        db, build_excecoes_sem_portfolio_query,
        "dashboard/excecoes-sem-portfolio", request,
        query_args=(parsed_from, parsed_to_excl),
        filters_extra={"date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=period_suffix,
    )


@router.get("/rejeitados-por-portfolio/{db}")
def get_rejeitados_por_portfolio(
    db: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    return _run_dashboard_chart(
        db, build_rejeitados_por_portfolio_query,
        "dashboard/rejeitados-por-portfolio", request,
        query_args=(parsed_from, parsed_to_excl),
        filters_extra={"date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=period_suffix,
    )


@router.get("/quebrados-por-portfolio/{db}")
def get_quebrados_por_portfolio(
    db: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    return _run_dashboard_chart(
        db, build_quebrados_por_portfolio_query,
        "dashboard/quebrados-por-portfolio", request,
        query_args=(parsed_from, parsed_to_excl),
        filters_extra={"date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=period_suffix,
    )


@router.get("/excecoes-detalhe/{db}/{portfolio}")
def get_excecoes_detalhe(
    db: str,
    portfolio: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    validated_db = validate_database_or_todos(db)
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    portfolio_params = (portfolio,) * (2 if validated_db == "todos" else 1)
    return _run_dashboard_chart(
        validated_db, build_excecoes_detalhe_query,
        "dashboard/excecoes-detalhe", request,
        query_args=(parsed_from, parsed_to_excl),
        params=portfolio_params,
        filters_extra={"portfolio": portfolio, "date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=f"|portfolio:{portfolio}{period_suffix}",
    )


@router.get("/acordos-detalhe/{db}/{portfolio}")
def get_acordos_detalhe(
    db: str,
    portfolio: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    validated_db = validate_database_or_todos(db)
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    portfolio_params = (portfolio,) * (2 if validated_db == "todos" else 1)
    return _run_dashboard_chart(
        validated_db, build_acordos_detalhe_query,
        "dashboard/acordos-detalhe", request,
        query_args=(parsed_from, parsed_to_excl),
        params=portfolio_params,
        filters_extra={"portfolio": portfolio, "date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=f"|portfolio:{portfolio}{period_suffix}",
    )


@router.get("/rejeitados-detalhe/{db}/{portfolio}")
def get_rejeitados_detalhe(
    db: str,
    portfolio: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    validated_db = validate_database_or_todos(db)
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    portfolio_params = (portfolio,) * (2 if validated_db == "todos" else 1)
    return _run_dashboard_chart(
        validated_db, build_rejeitados_detalhe_query,
        "dashboard/rejeitados-detalhe", request,
        query_args=(parsed_from, parsed_to_excl),
        params=portfolio_params,
        filters_extra={"portfolio": portfolio, "date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=f"|portfolio:{portfolio}{period_suffix}",
    )


@router.get("/acordos-detalhe-todos/{db}")
def get_acordos_detalhe_todos(
    db: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    validated_db = validate_database_or_todos(db)
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    return _run_dashboard_chart(
        validated_db, build_acordos_detalhe_global_query,
        "dashboard/acordos-detalhe-todos", request,
        query_args=(parsed_from, parsed_to_excl),
        filters_extra={"date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=period_suffix,
    )


@router.get("/excecoes-detalhe-todos/{db}")
def get_excecoes_detalhe_todos(
    db: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    validated_db = validate_database_or_todos(db)
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    return _run_dashboard_chart(
        validated_db, build_excecoes_detalhe_global_query,
        "dashboard/excecoes-detalhe-todos", request,
        query_args=(parsed_from, parsed_to_excl),
        filters_extra={"date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=period_suffix,
    )


@router.get("/rejeitados-detalhe-todos/{db}")
def get_rejeitados_detalhe_todos(
    db: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    validated_db = validate_database_or_todos(db)
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    return _run_dashboard_chart(
        validated_db, build_rejeitados_detalhe_global_query,
        "dashboard/rejeitados-detalhe-todos", request,
        query_args=(parsed_from, parsed_to_excl),
        filters_extra={"date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=period_suffix,
    )


@router.get("/quebrados-detalhe/{db}/{portfolio}")
def get_quebrados_detalhe(
    db: str,
    portfolio: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    validated_db = validate_database_or_todos(db)
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    portfolio_params = (portfolio,) * (2 if validated_db == "todos" else 1)
    return _run_dashboard_chart(
        validated_db, build_quebrados_detalhe_query,
        "dashboard/quebrados-detalhe", request,
        query_args=(parsed_from, parsed_to_excl),
        params=portfolio_params,
        filters_extra={"portfolio": portfolio, "date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=f"|portfolio:{portfolio}{period_suffix}",
    )


# ── agent-level detail routes ──────────────────────────────────

@router.get("/excecoes-detalhe-agente/{db}/{agente}")
def get_excecoes_detalhe_agente(
    db: str,
    agente: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    validated_db = validate_database_or_todos(db)
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    agente_params = (agente,) * (2 if validated_db == "todos" else 1)
    return _run_dashboard_chart(
        validated_db, build_excecoes_detalhe_agente_query,
        "dashboard/excecoes-detalhe-agente", request,
        query_args=(parsed_from, parsed_to_excl),
        params=agente_params,
    )


@router.get("/rejeitados-detalhe-agente/{db}/{agente}")
def get_rejeitados_detalhe_agente(
    db: str,
    agente: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    validated_db = validate_database_or_todos(db)
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    agente_params = (agente,) * (2 if validated_db == "todos" else 1)
    return _run_dashboard_chart(
        validated_db, build_rejeitados_detalhe_agente_query,
        "dashboard/rejeitados-detalhe-agente", request,
        query_args=(parsed_from, parsed_to_excl),
        params=agente_params,
    )


@router.get("/quebrados-detalhe-agente/{db}/{agente}")
def get_quebrados_detalhe_agente(
    db: str,
    agente: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    validated_db = validate_database_or_todos(db)
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    agente_params = (agente,) * (2 if validated_db == "todos" else 1)
    return _run_dashboard_chart(
        validated_db, build_quebrados_detalhe_agente_query,
        "dashboard/quebrados-detalhe-agente", request,
        query_args=(parsed_from, parsed_to_excl),
        params=agente_params,
    )


@router.get("/benchmarks/{db}")
def get_benchmarks(
    db: str,
    lookback_months: int = Query(default=3, ge=1, le=12),
    request: Request = None,
) -> Dict[str, Any]:
    """Benchmarks internos (quartis históricos) por banco para KPIs de produtividade."""
    run_id = getattr(request.state, "run_id", f"srv-{uuid4().hex[:12]}") if request else f"srv-{uuid4().hex[:12]}"
    validated_db = validate_database(db)

    def _compute() -> List[Dict[str, Any]]:
        query = build_benchmark_query(validated_db, lookback_months=lookback_months)
        return run_query(query, validated_db, run_id=run_id, context="dashboard/benchmarks")

    cache_key = f"benchmarks|{validated_db}|{lookback_months}m"
    rows = cache_manager.get_or_compute(cache_key, _compute)

    def _quartis(values: List[Any]) -> Dict[str, Any]:
        arr = np.array([
            float(v) for v in values
            if v is not None and not (isinstance(v, float) and np.isnan(v))
        ])
        if arr.size == 0:
            return {"q1": None, "median": None, "q3": None, "top10_mean": None, "mean": None}
        n_top10 = max(1, arr.size // 10)
        top10 = np.sort(arr)[-n_top10:]
        return {
            "q1": round(float(np.percentile(arr, 25)), 2),
            "median": round(float(np.percentile(arr, 50)), 2),
            "q3": round(float(np.percentile(arr, 75)), 2),
            "top10_mean": round(float(np.mean(top10)), 2),
            "mean": round(float(np.mean(arr)), 2),
        }

    data = {
        "taxa_contato": _quartis([r.get("avg_taxa_contato") for r in rows]),
        "taxa_conversao": _quartis([r.get("avg_taxa_conversao") for r in rows]),
        "efetividade_caixa": _quartis([r.get("avg_efetividade_caixa") for r in rows]),
        "pct_excecoes": _quartis([r.get("avg_pct_excecoes") for r in rows]),
        "n_agentes": len(rows),
        "lookback_months": lookback_months,
    }

    return build_response_envelope(
        data,
        [validated_db],
        filters={"database": validated_db, "lookback_months": lookback_months},
        run_id=run_id,
    )


@router.get("/primeira-parcela-por-agente/{db}")
def get_primeira_parcela_por_agente(
    db: str,
    assessoria: Optional[str] = Query(default=None),
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    assessoria_applied, assessoria_token = normalize_assessoria_filter(assessoria)
    validated_db = validate_database_or_todos(db)
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    return _run_dashboard_chart(
        validated_db, build_primeira_parcela_por_agente_query,
        "dashboard/primeira-parcela-por-agente", request,
        query_args=(assessoria_token, parsed_from, parsed_to_excl),
        params=build_assessoria_params(
            assessoria_token,
            2 if validated_db == "todos" else 1,
        ) or None,
        filters_extra={"assessoria": assessoria_applied, "date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=f"|assessoria:{assessoria_token or 'todos'}{period_suffix}",
    )


@router.get("/metas")
def get_metas(request: Request = None) -> Dict[str, Any]:
    """Serve o JSON de metas extraído do PDF via extrator.py.

    Retorna os dados de metas por portfólio extraídos do PDF trimestral.
    Se o arquivo não existir, retorna envelope com errors (não quebra o frontend).
    """
    run_id = str(uuid4())
    metas_path = Path("dados_metas/ultimas_metas.json")

    if not metas_path.is_file():
        return build_response_envelope(
            rows=[],
            sources=[],
            errors=[{"message": "Arquivo de metas não encontrado. Execute extrator.py primeiro."}],
            run_id=run_id,
        )

    with open(metas_path, "r", encoding="utf-8") as f:
        dados = json.load(f)

    return dados


@router.get("/real-por-portfolio/{db}")
def get_real_por_portfolio(
    db: str,
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    """Dados reais agregados por portfolio para MetaVsRealPanel."""
    parsed_from, parsed_to_excl = _parse_period(dateFrom, dateTo)
    period_suffix = f"|period:{parsed_from or 'hoje'}-{parsed_to_excl or 'hoje'}"
    return _run_dashboard_chart(
        db, build_real_por_portfolio_query,
        "dashboard/real-por-portfolio", request,
        query_args=(parsed_from, parsed_to_excl),
        filters_extra={"date": f"{parsed_from}/{parsed_to_excl}" if parsed_from else "today"},
        cache_key_suffix=period_suffix,
    )


@router.post("/metas/upload")
async def upload_metas_pdf(
    file: UploadFile = File(...),
    request: Request = None,
) -> Dict[str, Any]:
    """Recebe um PDF de metas, processa e atualiza ultimas_metas.json."""
    run_id = str(uuid4())

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        return build_response_envelope(
            rows=[],
            sources=[],
            errors=[{"message": "Arquivo inválido. Envie um PDF."}],
            run_id=run_id,
        )

    # CSRF: multipart não dispara preflight CORS, então um <form> cross-origin
    # poderia submeter com a credencial Basic Auth em cache. Rejeita Origin fora da
    # whitelist nesta rota de efeito colateral (F-09). Sem Origin (não-browser) passa.
    origin = (request.headers.get("origin") or "").strip() if request else ""
    if origin and origin not in settings._CORS_ORIGINS:
        return build_response_envelope(
            rows=[],
            sources=[],
            errors=[{"message": "Origin não autorizado para esta operação."}],
            run_id=run_id,
        )

    # Salva em arquivo temporário
    tmp_path = Path(f"dados_metas/_upload_{run_id}.pdf")
    tmp_path.parent.mkdir(exist_ok=True)
    try:
        content = await file.read()
        tmp_path.write_bytes(content)

        dados = processar_pdf(str(tmp_path), nome_origem=file.filename)
        periodo = salvar_resultado(dados, file.filename or "upload.pdf")

        return build_response_envelope(
            rows=[{"periodo": periodo, "total_registros": dados["meta"]["total_registros"]}],
            sources=[file.filename],
            run_id=run_id,
        )
    except ValueError as e:
        return build_response_envelope(
            rows=[],
            sources=[file.filename] if file.filename else [],
            errors=[{"message": str(e)}],
            run_id=run_id,
        )
    except Exception as e:
        return build_response_envelope(
            rows=[],
            sources=[file.filename] if file.filename else [],
            errors=[{"message": f"Erro ao processar PDF: {e}"}],
            run_id=run_id,
        )
    finally:
        if tmp_path.exists():
            tmp_path.unlink()