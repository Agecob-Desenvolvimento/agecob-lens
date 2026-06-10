"""
Visão de risco por carteira para o agente de chat (/agente/chat).

Fonte única server-side do PortfolioEntry: reusa o rollup consolidado
(build_portfolio_rollup_query) e agrega por carteira com as MESMAS regras do
frontend (src/lib/portfolioRollup.ts + HandoffPortfolioRentabilidade.buildDatum),
com uma diferença intencional: aqui os percentuais ficam BRUTOS (sem cap em
100%) e dimensão > 100% marca `anomalia=true` — o agente precisa alertar sobre
inconsistência de dados, não escondê-la como o gráfico faz.
"""
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

import config.settings as settings
from core.cache.cache_manager import cache_manager
from core.database.query_executor import run_query
from core.utils.validation import validate_database_or_todos
from dominios.graficos.queries import build_portfolio_rollup_query


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

    Regras (fiéis ao prompt do agente — alterar lá e aqui juntos):
      - denominador de todos os % = valor_primeira_parcela (STATUS_GERADOS);
      - risco_composto = MAX das dimensões, nunca soma;
      - valores brutos sem cap: dimensão > 100% marca anomalia=true.
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

        def _pct(value: float) -> float:
            if vp <= 0:
                return 0.0
            return round(value * 100.0 / vp, 2)

        excecoes_pct = _pct(bucket["valor_excecoes"])
        quebrados_pct = _pct(bucket["valor_quebrados"])
        rejeitados_pct = _pct(bucket["valor_rejeitados"])
        risco_composto = max(excecoes_pct, quebrados_pct, rejeitados_pct)
        anomalia = (
            risco_composto > 100.0
            or (vp <= 0 and max(bucket["valor_excecoes"], bucket["valor_quebrados"], bucket["valor_rejeitados"]) > 0)
        )
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


def build_portfolio_entries(
    db: str,
    date_from: str,
    date_to: str,
    run_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Dataset de risco por carteira na janela [date_from, date_to] (inclusiva)."""
    validated_db = validate_database_or_todos(db)
    conn_db = settings.ALLOWED_DATABASES[0] if validated_db == "todos" else validated_db
    date_to_exclusive = (date.fromisoformat(date_to) + timedelta(days=1)).isoformat()

    def _compute() -> List[Dict[str, Any]]:
        query = build_portfolio_rollup_query(
            validated_db, date_from=date_from, date_to_exclusive=date_to_exclusive
        )
        rows = run_query(
            query, conn_db,
            run_id=run_id,
            context="agente/portfolio-entries",
        )
        return _portfolio_entries_from_rollup(rows, data_referencia=date_to)

    cache_key = f"agente|portfolio-entries|{validated_db}|{date_from}|{date_to}"
    return cache_manager.get_or_compute(cache_key, _compute)
