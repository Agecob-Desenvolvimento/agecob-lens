"""
query_kpi_historico (P1, §2.1 do handoff agente-tools-handoff.md): série
histórica de um KPI por janela de data, com granularidade dia/semana/mês.

Enum de `kpi` é o inventário REAL de fontes com granularidade temporal — não
o rascunho de 11 valores do handoff original. Só 5 têm endpoint que sirva
série por dia:

- valor_acordos_gerados / qtd_acordos / risco_composto_pct: rollup diário
  já usado por get_time_series (dominios/agente/series.py), reaproveitado
  aqui direto (mesma query, mesmas regras — zero SQL nova).
- efetividade: ETL de conversão (dominios/agente/conversao.py) — janela
  fixa do próprio ETL (30 dias / 12 meses), não o date_from/date_to pedido.
- ritmo_dia: provider de hoje (api/routers/ritmo_dia.py) — ignora datas.

Os outros 6 propostos no rascunho (qtd_contatos_cpc, taxa_contato_pct,
taxa_cpc_pct, taxa_conversao_pct, qtd_acionamentos, desconto_medio_percentual)
só existem como snapshot agregado do período em dominios/produtividade —
nenhum endpoint os quebra por dia/semana/mês hoje, e D1 proíbe gerar SQL
nova para preencher esse buraco. Ficaram de fora do enum (schemas.py).

semana/mês são agregação client-side dos pontos diários já corretos — não é
SQL dinâmica (D1): soma para valor/qtd, MÁXIMO para risco (pior dia do
período, consistente com a semântica de "risco composto = pior eixo").
"""
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

import config.settings as settings
from core.cache.cache_manager import cache_manager
from core.database.query_executor import run_query
from core.telemetry.agent_logger import _sentry_log
from core.utils.validation import validate_database_or_todos
from dominios.agente.conversao import build_conversao_view
from dominios.agente.series import _series_from_rows, _tendencia, build_daily_rollup_query

_ROLLUP_KPIS: Dict[str, str] = {
    "valor_acordos_gerados": "valor",
    "qtd_acordos": "qtd",
    "risco_composto_pct": "risco",
}
_PAGE_SIZE = 31  # §2.1: "máx. 31 pontos de série por página"


def _bucket_key(dia: date, granularidade: str) -> str:
    if granularidade == "mes":
        return dia.replace(day=1).isoformat()
    if granularidade == "semana":
        return (dia - timedelta(days=dia.weekday())).isoformat()
    return dia.isoformat()


def _rebucket(points: List[Dict[str, Any]], kpi: str, granularidade: str) -> List[Dict[str, Any]]:
    if granularidade == "dia":
        return points
    buckets: Dict[str, List[float]] = {}
    for p in points:
        key = _bucket_key(date.fromisoformat(p["data"]), granularidade)
        buckets.setdefault(key, []).append(float(p["valor"]))
    out: List[Dict[str, Any]] = []
    for key in sorted(buckets):
        valores = buckets[key]
        if kpi == "risco_composto_pct":
            agregado: Any = round(max(valores), 2)
        elif kpi == "qtd_acordos":
            agregado = int(sum(valores))
        else:
            agregado = round(sum(valores), 2)
        out.append({"data": key, "valor": agregado})
    return out


def _paginate(points: List[Dict[str, Any]], page: int) -> Dict[str, Any]:
    start = (page - 1) * _PAGE_SIZE
    total_pages = max(1, (len(points) + _PAGE_SIZE - 1) // _PAGE_SIZE)
    return {
        "data": points[start:start + _PAGE_SIZE],
        "meta": {
            "page": page,
            "total_pages": total_pages,
            "total_points": len(points),
            "truncated": page < total_pages,
        },
    }


def _rollup_series(
    db: str, kpi: str, date_from: str, date_to: str, granularidade: str, page: int, run_id: Optional[str],
) -> Dict[str, Any]:
    metric = _ROLLUP_KPIS[kpi]
    validated_db = validate_database_or_todos(db)
    conn_db = settings.ALLOWED_DATABASES[0] if validated_db == "todos" else validated_db
    date_to_exclusive = (date.fromisoformat(date_to) + timedelta(days=1)).isoformat()

    def _compute() -> List[Dict[str, Any]]:
        query = build_daily_rollup_query(validated_db, date_from, date_to_exclusive)
        return run_query(query, conn_db, run_id=run_id, context="agente/kpi-historico")

    cache_key = f"agente|kpi-historico|{validated_db}|{date_from}|{date_to}"
    rows = cache_manager.get_or_compute(cache_key, _compute)
    points = _series_from_rows(rows, metric, date_from, date_to)
    points = _rebucket(points, kpi, granularidade)
    tendencia, variacao = _tendencia(points) if points else ("estavel", None)
    paged = _paginate(points, page)
    return {
        "kpi": kpi,
        "granularidade": granularidade,
        **paged,
        "tendencia": tendencia,
        "variacao_percentual": variacao,
    }


def _efetividade_series(db: str, date_from: str, date_to: str, page: int) -> Dict[str, Any]:
    days = (date.fromisoformat(date_to) - date.fromisoformat(date_from)).days + 1
    visao = "diaria" if days <= 30 else "mensal"
    out = build_conversao_view(db, visao)
    if "error" in out:
        return out
    out["meta"] = {
        "page": 1,
        "total_pages": 1,
        "truncated": False,
        "warnings": [
            f"kpi='efetividade' reflete a janela fixa do ETL ({visao}: "
            f"{'últimos 30 dias' if visao == 'diaria' else 'últimos 12 meses'}), não o "
            "date_from/date_to pedido — granularidade e datas são só indicativas aqui."
        ],
    }
    return out


def _ritmo_series(db: str, run_id: Optional[str]) -> Dict[str, Any]:
    from api.routers.ritmo_dia import ritmo_dia

    try:
        envelope = ritmo_dia(db)
    except HTTPException as exc:
        return {"error": str(exc.detail)}
    except Exception as exc:
        _sentry_log("error", "Falha ao calcular o ritmo do dia (query_kpi_historico).", database=db, error=str(exc))
        return {"error": "Falha ao calcular o ritmo do dia."}
    return {
        **envelope["data"],
        "meta": {**envelope["meta"], "page": 1, "total_pages": 1, "truncated": False},
        "aviso": "kpi='ritmo_dia' sempre reflete HOJE — date_from/date_to/granularidade são ignorados.",
    }


def build_kpi_historico(
    db: str,
    kpi: str,
    date_from: str,
    date_to: str,
    granularidade: str,
    page: int,
    run_id: Optional[str] = None,
) -> Dict[str, Any]:
    if kpi in _ROLLUP_KPIS:
        return _rollup_series(db, kpi, date_from, date_to, granularidade, page, run_id)
    if kpi == "efetividade":
        return _efetividade_series(db, date_from, date_to, page)
    if kpi == "ritmo_dia":
        return _ritmo_series(db, run_id)
    raise ValueError(f"kpi sem fonte de dados: {kpi!r} — deveria ter sido barrado por QueryKpiInput.")
