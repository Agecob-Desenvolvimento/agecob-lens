"""
detalhar_portfolio (P1, §2.3 do handoff agente-tools-handoff.md): drill-down
de UM portfólio por status de acordo.

'resumo' reusa o dataset em memória de get_portfolio_metrics
(build_portfolio_entries) — zero SQL extra. Os outros 4 drilldowns usam as
queries *-detalhe reais (dominios/graficos/queries.py, já usadas pelos
endpoints REST) — zero SQL nova, mas elas não têm paginação nativa (sem
parâmetro LIMIT/OFFSET/page nas rotas correspondentes): pagina-se aqui,
client-side, sobre o resultado completo.

Correção contra o código real (o rascunho do handoff não bateu aqui):
drilldown='aprovados' usa build_acordos_detalhe_query, que filtra por
STATUS_GERADOS (1,2,3,10,12) — não por STATUS_APROVADOS (1,3,12) como a
prosa do handoff §2.3 "validações" afirmava. Mesmo universo usado por
query_kpi_historico e por build_status_breakdown. excecao=(5,), rejeitado=
(7,), quebrado=(2,) — esses três batem com o handoff (D4).

Mascara CPF (LEFT 3 + right 2 — mesmo esquema histórico da coluna cpf_mask
antes de 2026-08-06) e remove nome_devedor do retorno: a API REST manda
CPF/nome completos por decisão de produto (ver memória do projeto), mas
aqui o dado sai da LAN para o provedor de LLM externo — o handoff exige
mascarar neste caminho especificamente (§2.3 validações, §5 LGPD/PII).
"""
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

import config.settings as settings
from core.database.query_executor import run_query
from core.utils.validation import validate_database_or_todos
from dominios.agente.risco import build_portfolio_entries
from dominios.efetividade.queries import (
    _build_ef_resumo_por_portfolio_params,
    _build_ef_resumo_por_portfolio_ranking_sql,
    _build_ef_resumo_por_portfolio_sql,
    _ef_date_params,
)
from dominios.graficos.queries import (
    build_acordos_detalhe_query,
    build_excecoes_detalhe_query,
    build_quebrados_detalhe_query,
    build_rejeitados_detalhe_query,
)

_DETALHE_QUERY_BUILDERS = {
    "aprovados": build_acordos_detalhe_query,
    "excecao": build_excecoes_detalhe_query,
    "rejeitado": build_rejeitados_detalhe_query,
    "quebrado": build_quebrados_detalhe_query,
}


def _mask_cpf(raw: Any) -> str:
    digits = "".join(ch for ch in str(raw or "") if ch.isdigit())
    if len(digits) < 5:
        return "***"
    return f"{digits[:3]}.***.***-{digits[-2:]}"


def _find_portfolio_name(name: str, entries: List[Dict[str, Any]]) -> Optional[str]:
    wanted = (name or "").strip().lower()
    for entry in entries:
        if entry["portfolio_name"].lower() == wanted:
            return entry["portfolio_name"]
    for entry in entries:
        if wanted in entry["portfolio_name"].lower():
            return entry["portfolio_name"]
    return None


def _build_vencimentos_ranking(
    validated_db: str, date_from: str, date_to: str, limit: int, run_id: Optional[str],
) -> Dict[str, Any]:
    """T3 (pt5-live-testing.md, Cluster G): vencimentos de TODAS as carteiras
    da janela numa chamada só, ranqueado por valor vencendo - sem isso o
    agente tinha que perguntar carteira por carteira e sub-amostrava em
    silêncio. `limit` reusa page_size do schema (10/25/50); sem paginação de
    verdade porque um ranking não se beneficia de "página 2" do jeito que
    uma lista de casos individuais se beneficia."""
    conn_db = settings.ALLOWED_DATABASES[0] if validated_db == "todos" else validated_db
    query = _build_ef_resumo_por_portfolio_ranking_sql(validated_db, "primeira")
    params = _ef_date_params(validated_db, date_from.replace("-", ""), date_to.replace("-", ""))
    rows = run_query(
        query, conn_db, params=params, run_id=run_id,
        context="agente/detalhe-portfolio/vencimentos-ranking",
    )
    ranking = [
        {
            "portfolio": row.get("portfolio_name"),
            "boletos_gerados": int(row.get("generated") or 0),
            "boletos_pagos_no_prazo": int(row.get("paid_on_time") or 0),
            "valor_vencendo": float(row.get("amount_maturing") or 0),
            "valor_recebido": float(row.get("amount_received") or 0),
            "efetividade_pct": float(row.get("effectiveness_pct") or 0),
        }
        for row in rows[:limit]
    ]
    return {
        "drilldown": "vencimentos_ranking",
        "db": validated_db,
        "date_from": date_from,
        "date_to": date_to,
        "total_carteiras_no_periodo": len(rows),
        "carteiras_retornadas": len(ranking),
        "ranking": ranking,
        "truncated": len(rows) > limit,
    }


def build_detalhe_portfolio(
    db: str,
    portfolio: Optional[str],
    date_from: str,
    date_to: str,
    drilldown: str,
    page: int,
    page_size: int,
    run_id: Optional[str] = None,
) -> Dict[str, Any]:
    validated_db = validate_database_or_todos(db)

    if drilldown == "vencimentos" and not portfolio:
        return _build_vencimentos_ranking(validated_db, date_from, date_to, page_size, run_id)

    entries = build_portfolio_entries(validated_db, date_from, date_to, run_id=run_id)
    resolved_name = _find_portfolio_name(portfolio, entries)
    if resolved_name is None:
        return {
            "error": "Carteira não encontrada no período.",
            "available_portfolios": [e["portfolio_name"] for e in entries],
        }

    if drilldown == "resumo":
        for entry in entries:
            if entry["portfolio_name"] == resolved_name:
                return entry

    conn_db = settings.ALLOWED_DATABASES[0] if validated_db == "todos" else validated_db

    if drilldown == "vencimentos":
        query = _build_ef_resumo_por_portfolio_sql(validated_db, "primeira")
        params = _build_ef_resumo_por_portfolio_params(
            validated_db, date_from.replace("-", ""), date_to.replace("-", ""), resolved_name,
        )
        rows = run_query(
            query, conn_db, params=params, run_id=run_id,
            context="agente/detalhe-portfolio/vencimentos",
        )
        row = rows[0] if rows else {}
        return {
            "portfolio": resolved_name,
            "drilldown": "vencimentos",
            "date_from": date_from,
            "date_to": date_to,
            "boletos_gerados": int(row.get("generated") or 0),
            "boletos_pagos_no_prazo": int(row.get("paid_on_time") or 0),
            "valor_vencendo": float(row.get("amount_maturing") or 0),
            "valor_recebido": float(row.get("amount_received") or 0),
            "efetividade_pct": float(row.get("effectiveness_pct") or 0),
        }

    date_to_exclusive = (date.fromisoformat(date_to) + timedelta(days=1)).isoformat()
    query_builder = _DETALHE_QUERY_BUILDERS[drilldown]
    query = query_builder(validated_db, date_from, date_to_exclusive)
    params = (resolved_name, resolved_name) if validated_db == "todos" else (resolved_name,)
    rows = run_query(
        query, conn_db, params=params, run_id=run_id,
        context=f"agente/detalhe-portfolio/{drilldown}",
    )

    total_rows = len(rows)
    start = (page - 1) * page_size
    page_rows = rows[start:start + page_size]
    total_pages = max(1, (total_rows + page_size - 1) // page_size)

    data = [
        {
            "nr_recebimento": row.get("NR_RECEBIMENTO"),
            "id_carteira": row.get("ID_CARTEIRA"),
            "valor_primeira_parcela": float(row.get("valor_primeira_parcela") or 0),
            "valor_total": float(row.get("valor_total") or 0),
            "agente": str(row.get("agente") or "").strip(),
            "matricula": row.get("matricula"),
            "cpf_mask": _mask_cpf(row.get("cpf_mask")),
            "data_acordo": str(row.get("data_acordo") or ""),
            "data_vencimento": str(row.get("data_vencimento") or ""),
            "total_parcelas": int(row.get("total_parcelas") or 0),
        }
        for row in page_rows
    ]

    return {
        "portfolio": resolved_name,
        "drilldown": drilldown,
        "data": data,
        "meta": {
            "page": page,
            "page_size": page_size,
            "total_rows": total_rows,
            "total_pages": total_pages,
            "truncated": page < total_pages,
        },
    }
