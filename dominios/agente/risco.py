"""
Visão de risco por carteira para o agente de chat (/agente/chat).

Fonte única server-side do PortfolioEntry: reusa o rollup consolidado
(build_portfolio_rollup_query) e agrega por carteira com as MESMAS regras do
frontend (src/lib/portfolioRollup.ts + HandoffPortfolioRentabilidade.buildDatum).
Denominador dos percentuais = universo de 1ª parcela do período (gerados +
exceções + rejeitados), então cada dimensão é uma fatia 0–100% por construção;
dimensão > 100% só ocorre com dado corrompido e marca `anomalia=true`.
"""
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

import config.settings as settings
from core.cache.cache_manager import cache_manager
from core.database.query_executor import run_query
from core.utils.validation import validate_database_or_todos
from dominios.graficos.queries import build_portfolio_rollup_query


# Rótulos do enum REC_MASTER para o breakdown por status (universo do rollup).
_STATUS_LABELS: Dict[int, str] = {
    1: "ATIVO",
    2: "QUEBRA",
    3: "BAIXA POR PAGAMENTO",
    5: "PENDENTE (Exceção)",
    7: "REJEITADO",
    10: "QUEBRA AUTOMÁTICA",
    12: "BAIXA POR PAGAMENTO AVULSO",
}


def _risco_nivel(risco_composto: float) -> str:
    if risco_composto <= settings.RISK_LEVEL_LOW_MAX:
        return "baixo"
    if risco_composto <= settings.RISK_LEVEL_MID_MAX:
        return "medio"
    return "alto"


def _portfolio_entries_from_rollup(
    rows: List[Dict[str, Any]],
    data_referencia: str,
) -> List[Dict[str, Any]]:
    """
    Agrega linhas {portfolio_name, id_rec_status, qtd, valor} em PortfolioEntry.

    Regras (fiéis ao prompt do agente e ao gráfico — alterar lá e aqui juntos):
      - denominador de todos os % = universo de 1ª parcela do período
        (gerados + exceções + rejeitados);
      - risco_composto = MAX das dimensões, nunca soma;
      - fatias do universo são ≤ 100% por construção: dimensão > 100% só com
        dado corrompido e marca anomalia=true.
    """
    acc: Dict[str, Dict[str, float]] = {}
    for row in rows:
        name = str(row.get("portfolio_name") or "").strip()
        if not name:
            continue
        status = int(row.get("id_rec_status") or 0)
        qtd = float(row.get("qtd") or 0)
        valor = float(row.get("valor") or 0)
        bucket = acc.setdefault(name, {
            "valor_gerados": 0.0,
            "qtd_gerados": 0.0,
            "valor_excecoes": 0.0,
            "valor_quebrados": 0.0,
            "valor_rejeitados": 0.0,
        })
        if status in settings.STATUS_GERADOS:
            bucket["valor_gerados"] += valor
            bucket["qtd_gerados"] += qtd
        if status in settings.STATUS_EXCECAO:
            bucket["valor_excecoes"] += valor
        if status in settings.STATUS_QUEBRADO:
            bucket["valor_quebrados"] += valor
        if status in settings.STATUS_REJEITADO:
            bucket["valor_rejeitados"] += valor

    entries: List[Dict[str, Any]] = []
    for name, bucket in acc.items():
        vp = bucket["valor_gerados"]
        universo = vp + bucket["valor_excecoes"] + bucket["valor_rejeitados"]

        def _pct(value: float) -> float:
            if universo <= 0:
                return 0.0
            return round(value * 100.0 / universo, 2)

        excecoes_pct = _pct(bucket["valor_excecoes"])
        quebrados_pct = _pct(bucket["valor_quebrados"])
        rejeitados_pct = _pct(bucket["valor_rejeitados"])
        risco_composto = max(excecoes_pct, quebrados_pct, rejeitados_pct)
        anomalia = risco_composto > 100.0
        entries.append({
            "portfolio_name": name,
            "valor_primeira_parcela": round(vp, 2),
            "qtd_acordos": int(bucket["qtd_gerados"]),
            "risco_composto": risco_composto,
            "decomposicao": {
                "excecoes_pct": excecoes_pct,
                "quebrados_pct": quebrados_pct,
                "rejeitados_pct": rejeitados_pct,
            },
            "nivel_risco": _risco_nivel(risco_composto),
            "anomalia": anomalia,
            "data_referencia": data_referencia,
        })
    entries.sort(key=lambda e: e["valor_primeira_parcela"], reverse=True)
    return entries


def _load_rollup_rows(
    db: str,
    date_from: str,
    date_to: str,
    run_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Linhas do rollup consolidado na janela, cacheadas — base comum de entries e breakdown."""
    validated_db = validate_database_or_todos(db)
    conn_db = settings.ALLOWED_DATABASES[0] if validated_db == "todos" else validated_db
    date_to_exclusive = (date.fromisoformat(date_to) + timedelta(days=1)).isoformat()

    def _compute() -> List[Dict[str, Any]]:
        query = build_portfolio_rollup_query(
            validated_db, date_from=date_from, date_to_exclusive=date_to_exclusive
        )
        return run_query(
            query, conn_db,
            run_id=run_id,
            context="agente/portfolio-entries",
        )

    cache_key = f"agente|rollup-rows|{validated_db}|{date_from}|{date_to}"
    return cache_manager.get_or_compute(cache_key, _compute)


def build_portfolio_entries(
    db: str,
    date_from: str,
    date_to: str,
    run_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Dataset de risco por carteira na janela [date_from, date_to] (inclusiva)."""
    rows = _load_rollup_rows(db, date_from, date_to, run_id=run_id)
    return _portfolio_entries_from_rollup(rows, data_referencia=date_to)


def _status_breakdown_from_rows(
    rows: List[Dict[str, Any]],
    data_referencia: str,
) -> Dict[str, Any]:
    """Agrega as linhas do rollup em distribuição por status (qtd e valor de 1ª parcela)."""
    acc: Dict[int, Dict[str, float]] = {}
    for row in rows:
        status = int(row.get("id_rec_status") or 0)
        if status not in _STATUS_LABELS:
            continue
        bucket = acc.setdefault(status, {"qtd": 0, "valor": 0.0})
        bucket["qtd"] += int(row.get("qtd") or 0)
        bucket["valor"] += float(row.get("valor") or 0)

    status_list = [
        {
            "id_rec_status": status,
            "label": _STATUS_LABELS[status],
            "qtd": int(bucket["qtd"]),
            "valor": round(bucket["valor"], 2),
        }
        for status, bucket in acc.items()
    ]
    status_list.sort(key=lambda item: item["valor"], reverse=True)
    return {
        "status": status_list,
        "total_qtd": sum(item["qtd"] for item in status_list),
        "total_valor": round(sum(item["valor"] for item in status_list), 2),
        "nota": "qtd e valor de 1ª parcela por status no período; GERADOS = 1, 2, 3, 10, 12.",
        "data_referencia": data_referencia,
    }


def build_status_breakdown(
    db: str,
    date_from: str,
    date_to: str,
    run_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Distribuição de acordos por status na janela [date_from, date_to] (inclusiva)."""
    rows = _load_rollup_rows(db, date_from, date_to, run_id=run_id)
    return _status_breakdown_from_rows(rows, data_referencia=date_to)
