"""
Maiores acordos de uma carteira para o agente de chat (/agente/chat).

Reusa os builders de detalhe do dashboard (1 linha por acordo, CPF mascarado
no SQL — paridade de exposição com a UI de detalhe). Janela da sessão;
ordenação por valor_total do acordo, limitada a poucos registros para caber
no contexto do modelo.
"""
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

import config.settings as settings
from core.cache.cache_manager import cache_manager
from core.database.query_executor import run_query
from core.utils.validation import validate_database_or_todos
from dominios.graficos.queries import (
    build_acordos_detalhe_query,
    build_excecoes_detalhe_query,
    build_quebrados_detalhe_query,
    build_rejeitados_detalhe_query,
)

DETALHE_TIPOS = ("acordos", "excecoes", "quebrados", "rejeitados")
DETALHE_LIMITE_MAX = 20

_BUILDERS = {
    "acordos": build_acordos_detalhe_query,
    "excecoes": build_excecoes_detalhe_query,
    "quebrados": build_quebrados_detalhe_query,
    "rejeitados": build_rejeitados_detalhe_query,
}


def _maiores_por_valor_total(rows: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
    normalizadas = [
        {
            "nr_recebimento": row.get("NR_RECEBIMENTO"),
            "valor_primeira_parcela": round(float(row.get("valor_primeira_parcela") or 0), 2),
            "valor_total": round(float(row.get("valor_total") or 0), 2),
            "total_parcelas": int(row.get("total_parcelas") or 0),
            "agente": str(row.get("agente") or "").strip(),
            "nome_devedor": str(row.get("nome_devedor") or "").strip(),
            "cpf_mask": str(row.get("cpf_mask") or "").strip(),
            "data_acordo": str(row.get("data_acordo") or ""),
            "data_vencimento": str(row.get("data_vencimento") or ""),
        }
        for row in rows
    ]
    normalizadas.sort(key=lambda r: r["valor_total"], reverse=True)
    return normalizadas[:limit]


def build_maiores_acordos(
    db: str,
    date_from: str,
    date_to: str,
    tipo: str,
    portfolio: str,
    limit: int = 10,
    run_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Top acordos da carteira por valor_total, no tipo/status pedido."""
    validated_db = validate_database_or_todos(db)
    conn_db = settings.ALLOWED_DATABASES[0] if validated_db == "todos" else validated_db
    date_to_exclusive = (date.fromisoformat(date_to) + timedelta(days=1)).isoformat()

    def _compute() -> List[Dict[str, Any]]:
        query = _BUILDERS[tipo](validated_db, date_from=date_from, date_to_exclusive=date_to_exclusive)
        params: Tuple[Any, ...] = (
            (portfolio, portfolio) if validated_db == "todos" else (portfolio,)
        )
        return run_query(
            query, conn_db,
            params=params,
            run_id=run_id,
            context="agente/maiores-acordos",
        )

    cache_key = f"agente|maiores-acordos|{validated_db}|{date_from}|{date_to}|{tipo}|{portfolio}"
    rows = cache_manager.get_or_compute(cache_key, _compute)
    acordos = _maiores_por_valor_total(rows, limit)
    out: Dict[str, Any] = {
        "tipo": tipo,
        "portfolio": portfolio,
        "acordos": acordos,
        "total_no_periodo": len(rows),
        "data_referencia": date_to,
    }
    if not acordos:
        out["aviso"] = "Sem acordos deste tipo para a carteira no período."
    return out
