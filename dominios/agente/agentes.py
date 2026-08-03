"""
Visão de performance por agente para o agente de chat (/agente/chat).

Fonte única server-side do AgentEntry: reusa build_produtividade_query
(variant B, use_distinct_esforco=False — a mesma de /comparacao-agentes),
que suporta 'todos' com coluna origem e janela [date_from, date_to].
Linhas por origem são agregadas por agente (normalize_agent_key); razões
(taxas, ticket) são recalculadas após a soma — médias prontas da query não
são somáveis entre origens.

Vocabulário do funil (ADR-006 — não inverter):
qtd_alo = "Contato" (alguém atende); qtd_contatos = "CPC" (pessoa certa).
"""
from typing import Any, Dict, List, Optional

import config.settings as settings
from core.cache.cache_manager import cache_manager
from core.database.query_executor import run_query
from core.utils.validation import validate_database_or_todos
from dominios.produtividade.queries import build_produtividade_query, normalize_agent_key
from datetime import date, timedelta


def _ratio_pct(num: float, den: float) -> float:
    if den <= 0:
        return 0.0
    return round(num * 100.0 / den, 2)


def _agent_entries_from_rows(
    rows: List[Dict[str, Any]],
    data_referencia: str,
) -> List[Dict[str, Any]]:
    """Agrega linhas por-origem da query de produtividade em AgentEntry por agente."""
    acc: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        login = str(row.get("CHAVE") or "").strip()
        name = str(row.get("NOME") or "").strip()
        key = normalize_agent_key(login, name)
        if not key:
            continue
        bucket = acc.setdefault(key, {
            "agent_name": name or login,
            "login": login,
            "qtd_acionamentos": 0,
            "qtd_alo": 0,
            "qtd_contatos": 0,
            "qtd_acordos": 0,
            "valor_acordos": 0.0,
            "valor_primeira_parcela": 0.0,
            "qtd_boletos_emitidos": 0,
            "qtd_boletos_pagos": 0,
            "qtd_excecoes": 0,
            "valor_excecoes": 0.0,
        })
        bucket["qtd_acionamentos"] += int(row.get("qtd_acionamentos") or 0)
        bucket["qtd_alo"] += int(row.get("qtd_alo") or 0)
        bucket["qtd_contatos"] += int(row.get("qtd_contatos") or 0)
        bucket["qtd_acordos"] += int(row.get("qtd_acordos") or 0)
        bucket["valor_acordos"] += float(row.get("valor_total_acordos") or 0)
        bucket["valor_primeira_parcela"] += float(row.get("valor_primeira_parcela") or 0)
        bucket["qtd_boletos_emitidos"] += int(row.get("qtd_boletos_emitidos") or 0)
        bucket["qtd_boletos_pagos"] += int(row.get("qtd_boletos_pagos") or 0)
        bucket["qtd_excecoes"] += int(row.get("qtd_excecoes") or 0)
        bucket["valor_excecoes"] += float(row.get("valor_excecoes") or 0)

    entries: List[Dict[str, Any]] = []
    for bucket in acc.values():
        entries.append({
            "agent_name": bucket["agent_name"],
            "login": bucket["login"],
            "qtd_acionamentos": bucket["qtd_acionamentos"],
            "qtd_alo": bucket["qtd_alo"],
            "qtd_contatos": bucket["qtd_contatos"],
            "taxa_contato_pct": _ratio_pct(bucket["qtd_alo"], bucket["qtd_acionamentos"]),
            "taxa_cpc_pct": _ratio_pct(bucket["qtd_contatos"], bucket["qtd_alo"]),
            "qtd_acordos": bucket["qtd_acordos"],
            "valor_acordos": round(bucket["valor_acordos"], 2),
            "ticket_medio": round(bucket["valor_acordos"] / bucket["qtd_acordos"], 2) if bucket["qtd_acordos"] else 0.0,
            "valor_primeira_parcela": round(bucket["valor_primeira_parcela"], 2),
            "qtd_boletos_emitidos": bucket["qtd_boletos_emitidos"],
            "qtd_boletos_pagos": bucket["qtd_boletos_pagos"],
            # Conversão oficial (docs/data-layer.md): acordos gerados sobre CPC.
            "conversao_pct": _ratio_pct(bucket["qtd_acordos"], bucket["qtd_contatos"]),
            # Métrica distinta que antes ocupava o nome "conversao_pct": boletos
            # pagos sobre CPC. Como pagos <= acordos gerados, o agente informava
            # ~4% onde a Home mostrava ~11% para o mesmo agente e período.
            "pagos_por_cpc_pct": _ratio_pct(bucket["qtd_boletos_pagos"], bucket["qtd_contatos"]),
            "qtd_excecoes": bucket["qtd_excecoes"],
            "valor_excecoes": round(bucket["valor_excecoes"], 2),
            "data_referencia": data_referencia,
        })
    entries.sort(key=lambda e: e["valor_acordos"], reverse=True)
    return entries


def build_agent_entries(
    db: str,
    date_from: str,
    date_to: str,
    run_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Dataset de performance por agente na janela [date_from, date_to] (inclusiva)."""
    validated_db = validate_database_or_todos(db)
    conn_db = settings.ALLOWED_DATABASES[0] if validated_db == "todos" else validated_db
    date_to_exclusive = (date.fromisoformat(date_to) + timedelta(days=1)).isoformat()

    def _compute() -> List[Dict[str, Any]]:
        query = build_produtividade_query(
            validated_db,
            use_distinct_esforco=False,
            date_from=date_from,
            date_to_exclusive=date_to_exclusive,
        )
        rows = run_query(
            query, conn_db,
            run_id=run_id,
            context="agente/agent-entries",
        )
        return _agent_entries_from_rows(rows, data_referencia=date_to)

    cache_key = f"agente|agent-entries|{validated_db}|{date_from}|{date_to}"
    return cache_manager.get_or_compute(cache_key, _compute)
