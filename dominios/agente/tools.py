"""
Tools do agente de carteiras: schemas expostos ao modelo + dispatch puro
sobre o dataset em memória (dezenas de carteiras — custo desprezível).

Nomes e parâmetros fazem parte do contrato do prompt (system_prompt.md) —
alterar lá e aqui juntos.
"""
import json
import os
from typing import Any, Callable, Dict, List, Optional

from pydantic import ValidationError

import config.settings as settings
from dominios.agente.errors import build_tool_error
from dominios.agente.schemas import (
    CompararAgentesInput,
    DetalharPortfolioInput,
    ExplicarMetricaInput,
    QueryKpiInput,
)

AGENT_TOOLS: List[Dict[str, Any]] = [
    {
        "name": "get_portfolio_metrics",
        "description": (
            "Retorna o PortfolioEntry completo de uma carteira pelo nome "
            "(busca exata sem case; se não achar, tenta substring). "
            "Use quando o usuário perguntar sobre uma carteira específica."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "portfolio_name": {"type": "string", "description": "Nome (ou trecho do nome) da carteira."},
            },
            "required": ["portfolio_name"],
        },
    },
    {
        "name": "filter_portfolios_by_risk",
        "description": (
            "Lista carteiras com o nível de risco informado "
            "(baixo: composto <= 25; medio: <= 50; alto: > 50)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "level": {"type": "string", "enum": ["baixo", "medio", "alto"]},
            },
            "required": ["level"],
        },
    },
    {
        "name": "filter_portfolios_by_value",
        "description": (
            "Lista carteiras com valor_primeira_parcela >= min_value, "
            "ordenadas por valor decrescente."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "min_value": {"type": "number", "description": "Valor mínimo de 1ª parcela em BRL."},
                "limit": {"type": "integer", "description": "Máximo de carteiras retornadas (padrão 10)."},
            },
            "required": ["min_value"],
        },
    },
    {
        "name": "compare_portfolios",
        "description": (
            "Compara duas ou mais carteiras lado a lado. Retorna os entries "
            "completos das carteiras pedidas (e o campo de métrica em destaque, se informado)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "names": {"type": "array", "items": {"type": "string"}, "description": "Nomes das carteiras."},
                "metric": {
                    "type": "string",
                    "enum": ["valor_primeira_parcela", "qtd_acordos", "risco_composto", "excecoes_pct", "quebrados_pct", "rejeitados_pct"],
                    "description": "Métrica em foco na comparação (opcional).",
                },
            },
            "required": ["names"],
        },
    },
    {
        "name": "get_agent_performance",
        "description": (
            "Retorna o AgentEntry completo de um agente (cobrador) pelo nome ou login "
            "(busca exata sem case; se não achar, tenta substring). Funil, acordos, "
            "valores e conversão do agente no período. Use quando o usuário perguntar "
            "sobre um agente específico."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_name": {"type": "string", "description": "Nome (ou trecho do nome/login) do agente."},
            },
            "required": ["agent_name"],
        },
    },
    {
        "name": "list_agents_performance",
        "description": (
            "Ranking de agentes no período, ordenado pela métrica pedida "
            "(decrescente). Use para 'melhores agentes', 'quem mais converteu', "
            "'ranking da equipe'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "order_by": {
                    "type": "string",
                    "enum": [
                        "valor_acordos", "qtd_acordos", "conversao_pct",
                        "pagos_por_cpc_pct",
                        "qtd_contatos", "qtd_acionamentos", "valor_primeira_parcela",
                        "ticket_medio", "valor_excecoes", "qtd_excecoes",
                        "taxa_cpc_pct", "taxa_contato_pct", "qtd_alo",
                    ],
                    "description": "Métrica de ordenação (padrão valor_acordos).",
                },
                "limit": {"type": "integer", "description": "Máximo de agentes retornados (padrão 10)."},
            },
        },
    },
    {
        "name": "get_ritmo_acordos_dia",
        "description": (
            "Ritmo de acordos de HOJE (sempre o dia corrente, independente do "
            "período da sessão): previsão KNN por banda horária (8h–19h) vs "
            "realizado, acumulado atual, esperado total e projeção de fechamento. "
            "Use para 'ritmo do dia', 'como está o dia', 'vamos bater a meta', "
            "'previsão de fechamento'."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_acordo_status_breakdown",
        "description": (
            "Distribuição dos acordos do período por status — ATIVO, QUEBRA, BAIXA "
            "POR PAGAMENTO, PENDENTE (Exceção), REJEITADO, QUEBRA AUTOMÁTICA e "
            "BAIXA POR PAGAMENTO AVULSO — com qtd e valor de 1ª parcela por status. "
            "Use para 'quantos acordos por status', 'quanto está pendente/rejeitado'."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_fase_negociacao",
        "description": (
            "Acordos aprovados dos últimos ~6 meses agrupados por fase do plano de "
            "pagamento: inicio (até 1 parcela paga), meio, final (2 ou menos "
            "parcelas restantes), quitado (tudo pago). Com 'fase', lista também as "
            "carteiras com maior valor em aberto naquela fase. Use para 'final de "
            "plano', 'início de plano', 'plano quitado', 'plano em aberto'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "fase": {"type": "string", "enum": ["inicio", "meio", "final", "quitado"]},
            },
        },
    },
    {
        "name": "get_cruzamento_agente_carteira",
        "description": (
            "Cruza agente × carteira no período: informe EXATAMENTE UM lado. Com "
            "'portfolio', decompõe a carteira por agente; com 'agent_name', decompõe "
            "o agente por carteira. Cada linha traz qtd_acordos, valor de 1ª parcela "
            "(gerados) e valores de exceções/quebrados/rejeitados. Use para 'quem "
            "está gerando as exceções da carteira X', 'quais carteiras o agente Y "
            "trabalha'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "portfolio": {"type": "string", "description": "Nome (ou trecho) da carteira."},
                "agent_name": {"type": "string", "description": "Nome (ou trecho) do agente."},
            },
        },
    },
    {
        "name": "get_ranking_agentes_por_dimensao",
        "description": (
            "Ranking de agentes por valor de 1ª parcela numa dimensão de status do "
            "período: 'gerados', 'excecoes', 'quebrados' ou 'rejeitados'. Use para "
            "'quem quebra mais acordos', 'quem gera mais exceção', 'quem tem mais "
            "rejeição'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "dimensao": {"type": "string", "enum": ["gerados", "excecoes", "quebrados", "rejeitados"]},
                "limit": {"type": "integer", "description": "Máximo de agentes (padrão 10)."},
            },
            "required": ["dimensao"],
        },
    },
    {
        "name": "query_kpi_historico",
        "description": (
            "Série histórica de um KPI por janela de data (dia/semana/mês). kpi: "
            "'valor_acordos_gerados' (R$ 1ª parcela/dia), 'qtd_acordos' (acordos/dia), "
            "'risco_composto_pct' (pior eixo de risco do dia), 'efetividade' (boletos "
            "pagos no prazo / emitidos — reflete a janela fixa do próprio ETL, não "
            "date_from/date_to) ou 'ritmo_dia' (sempre HOJE, ignora datas). "
            "portfolio (opcional): restringe valor_acordos_gerados/qtd_acordos/"
            "risco_composto_pct a UMA carteira (nome ou trecho) — ignorado com "
            "aviso para efetividade/ritmo_dia, que são sempre agregados da base. "
            "db é por chamada — pode consultar um banco diferente do filtro da sessão. "
            "Use para tendência, evolução, histórico, degradação, 'vs semana passada'. "
            "'efetividade' NÃO é conversão (fórmulas e tools diferentes) — nunca rotule "
            "o resultado deste kpi como 'conversão'. Conversão (qtd_acordos/qtd_contatos) "
            "não tem série diária nem agregado por banco/carteira — só existe no grão "
            "agente via get_agent_performance/list_agents_performance/comparar_agentes "
            "(campo conversao_pct). Use essas tools para conversão, ou avise que não "
            "está disponível nesse grão — nunca substitua em silêncio."
        ),
        "input_schema": QueryKpiInput.model_json_schema(),
    },
    {
        "name": "comparar_agentes",
        "description": (
            "Compara 2 a 5 agentes lado a lado, identificados pela CHAVE de login, "
            "nas métricas pedidas. Use quando o usuário nomear agentes explicitamente. "
            "Não use para ranking geral (use list_agents_performance). db é por "
            "chamada — pode diferir do filtro da sessão."
        ),
        "input_schema": CompararAgentesInput.model_json_schema(),
    },
    {
        "name": "detalhar_portfolio",
        "description": (
            "Detalha UM portfólio com drill-down por status de acordo. drilldown: "
            "'resumo' (métricas agregadas, como get_portfolio_metrics), 'aprovados' "
            "(status gerados: ativo/quebra/baixa pagamento/quebra automática/baixa "
            "avulso — 1,2,3,10,12), 'excecao' (5), 'rejeitado' (7), 'quebrado' (2, "
            "estrito), 'vencimentos' (boletos com vencimento na janela: quantos "
            "geraram, quanto está vencendo, quanto já foi recebido — use para "
            "'quanto projetamos/recebemos de vencimentos de hoje/ontem na carteira "
            "X'; devolve um resumo agregado, não linhas) ou 'geracao' (ranking por "
            "carteira de valor_acordos_gerados/qtd_acordos — ver abaixo). Nos 4 de "
            "status, retorna "
            "linhas paginadas (CPF mascarado, sem nome do devedor). db é por "
            "chamada — pode diferir do filtro da sessão. portfolio é obrigatório em "
            "todo drilldown, EXCETO 'vencimentos' e 'geracao': omita portfolio nesses "
            "casos para receber o RANKING de todas as carteiras da janela numa "
            "chamada só (use para 'vencimentos por carteira', 'ranking de "
            "vencimentos', 'quais carteiras têm mais vencimento hoje/ontem') — "
            "não chame carteira por carteira para montar esse ranking manualmente. "
            "'geracao' (só existe em modo ranking — passar portfolio dá erro de "
            "validação) devolve o ranking de valor_acordos_gerados/qtd_acordos por "
            "carteira num dia/janela ESPECÍFICOS, ranqueado por valor gerado; use "
            "para 'geração por carteira ontem/hoje', 'ranking de geração', 'quais "
            "carteiras mais produziram' — especialmente quando o dia pedido é "
            "diferente da janela da sessão (filter_portfolios_by_value só reflete a "
            "janela da sessão, sem override por chamada). Para UMA carteira "
            "específica em vez do ranking, use "
            "query_kpi_historico(kpi='valor_acordos_gerados', portfolio=X) em vez "
            "desta. page_size (10/25/50) limita quantas carteiras voltam nos "
            "rankings; a resposta inclui total_carteiras_no_periodo e truncated "
            "para você saber se cobriu tudo."
        ),
        "input_schema": DetalharPortfolioInput.model_json_schema(),
    },
    {
        "name": "explicar_metrica",
        "description": (
            "Retorna a definição oficial de um KPI, status ou termo operacional "
            "(fórmula, filtros, convenções) do registry gerado de config/settings.py. "
            "SEMPRE consulte esta tool antes de explicar qualquer fórmula — nunca "
            "deduza. Se o termo não existir, devolve a lista de termos válidos."
        ),
        "input_schema": ExplicarMetricaInput.model_json_schema(),
    },
]

# explicar_metrica (P1): lê dominios/agente/metric_registry.json, gerado de
# config/settings.py por scripts/build_metric_registry.py (D2/D9). Substitui o
# antigo dict BUSINESS_RULES hardcoded — mesma prosa, fonte única agora.
_METRIC_REGISTRY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "metric_registry.json")
_metric_registry_cache: Optional[Dict[str, Any]] = None

_TERMO_ALIASES: Dict[str, str] = {
    "cpc": "cpc",
    "contato": "taxa_contato_pct",
    "exceção": "excecao",
    "excecoes": "excecao",
    "exceções": "excecao",
    "risco composto": "risco_composto_formula",
}


def _load_metric_registry() -> Dict[str, Any]:
    global _metric_registry_cache
    if _metric_registry_cache is None:
        with open(_METRIC_REGISTRY_PATH, "r", encoding="utf-8") as f:
            _metric_registry_cache = json.load(f)
    return _metric_registry_cache


def _resolve_termo(termo: str, registry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    key = _TERMO_ALIASES.get(termo.strip().lower(), termo.strip().lower())
    if key in registry["status"]:
        entry: Dict[str, Any] = {"tipo": "status", "valores": registry["status"][key]}
        if key in registry["caveats"]:
            entry["caveat"] = registry["caveats"][key]
        return entry
    if key in registry["caveats"]:
        return {"tipo": "caveat", "texto": registry["caveats"][key]}
    if key in registry["kpis"]:
        return {"tipo": "kpi", **registry["kpis"][key]}
    return None


def _available_termos(registry: Dict[str, Any]) -> List[str]:
    return sorted(set(registry["status"]) | set(registry["caveats"]) | set(registry["kpis"]))


def _find_portfolio(name: str, entries: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    wanted = (name or "").strip().lower()
    if not wanted:
        return None
    for entry in entries:
        if entry["portfolio_name"].lower() == wanted:
            return entry
    for entry in entries:
        if wanted in entry["portfolio_name"].lower():
            return entry
    return None


def _ambiguity_warning(name: str, resolved: Dict[str, Any], entries: List[Dict[str, Any]]) -> Optional[str]:
    """
    T6 (pt5-live-testing.md, "bv" resolvendo em silêncio pra BVFinanceira III
    escondendo IV e VII, confidence=high): `_find_portfolio` sempre devolve a
    PRIMEIRA correspondência por trecho, sem sinalizar quando o trecho também
    bate em outras carteiras reais. Chame isto depois de um match não-exato
    para anexar um aviso ao resultado em vez de silenciar a ambiguidade —
    resolve() continua devolvendo dado usável mesmo quando ambíguo.
    """
    wanted = (name or "").strip().lower()
    if not wanted or resolved["portfolio_name"].strip().lower() == wanted:
        return None  # match exato: sem ambiguidade a declarar
    others = [
        e["portfolio_name"] for e in entries
        if wanted in e["portfolio_name"].lower() and e["portfolio_name"] != resolved["portfolio_name"]
    ]
    if not others:
        return None
    return (
        f"Busca por trecho {name!r} também combina com: {', '.join(others)}. "
        f"Retornando {resolved['portfolio_name']!r} (primeira correspondência) — "
        f"confirme com o usuário se for a carteira pretendida."
    )


# Espelha o enum de order_by no schema de list_agents_performance — o enum do
# schema é orientativo para o modelo, não é validado pelo provedor.
_AGENT_ORDER_BY_FIELDS = frozenset({
    "valor_acordos", "qtd_acordos", "conversao_pct",
    "pagos_por_cpc_pct",
    "qtd_contatos", "qtd_acionamentos", "valor_primeira_parcela",
    "ticket_medio", "valor_excecoes", "qtd_excecoes",
    "taxa_cpc_pct", "taxa_contato_pct", "qtd_alo",
})

# Espelham os enums dos schemas das tools com provider próprio.
_FASES = frozenset({"inicio", "meio", "final", "quitado"})
_RANKING_DIMENSOES = frozenset({"gerados", "excecoes", "quebrados", "rejeitados"})

# comparar_agentes (CompararAgentesInput.metricas, schemas.py) usa nomes de
# negócio que não batem 1:1 com as chaves reais do AgentEntry (agentes.py) —
# mapeia pro campo real ao extrair. Identidade quando o nome já bate.
_COMPARAR_METRICA_ALIASES: Dict[str, str] = {
    "qtd_contatos_cpc": "qtd_contatos",
    "taxa_conversao_pct": "conversao_pct",
}


def _find_agent(name: str, agents: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    wanted = (name or "").strip().lower()
    if not wanted:
        return None
    for entry in agents:
        if entry["agent_name"].lower() == wanted or entry["login"].lower() == wanted:
            return entry
    for entry in agents:
        if wanted in entry["agent_name"].lower() or wanted in entry["login"].lower():
            return entry
    return None


def dispatch_tool(
    name: str,
    args: Dict[str, Any],
    entries: List[Dict[str, Any]],
    get_agents: Callable[[], List[Dict[str, Any]]],
    providers: Optional[Dict[str, Callable[..., Any]]] = None,
) -> Any:
    """
    Executa uma tool do agente sobre os datasets em memória. Pura sobre
    `entries`; o dataset de agentes é carregado sob demanda via `get_agents`
    (lazy — a query de produtividade só roda se uma tool de agente for chamada).
    `providers` injeta as tools com fonte própria (ritmo, série temporal,
    breakdown de status, fases) — também lazy: cada query roda só se chamada.
    """
    if name == "get_portfolio_metrics":
        portfolio_name_arg = str(args.get("portfolio_name") or "")
        entry = _find_portfolio(portfolio_name_arg, entries)
        if entry is not None:
            aviso = _ambiguity_warning(portfolio_name_arg, entry, entries)
            return {**entry, "aviso_ambiguidade": aviso} if aviso else entry
        return {
            "error": "Carteira não encontrada no período.",
            "available_portfolios": [e["portfolio_name"] for e in entries],
        }

    if name == "filter_portfolios_by_risk":
        level = str(args.get("level") or "").strip().lower()
        level = {"médio": "medio"}.get(level, level)
        if level not in ("baixo", "medio", "alto"):
            return {"error": f"Nível inválido: {args.get('level')!r}. Use baixo, medio ou alto."}
        return [e for e in entries if e["nivel_risco"] == level]

    if name == "filter_portfolios_by_value":
        try:
            min_value = float(args.get("min_value") or 0)
        except (TypeError, ValueError):
            return {"error": f"min_value inválido: {args.get('min_value')!r}."}
        try:
            limit = int(args.get("limit") or 10)
        except (TypeError, ValueError):
            limit = 10
        limit = max(1, min(limit, 50))
        matching = [e for e in entries if e["valor_primeira_parcela"] >= min_value]
        return matching[:limit]

    if name == "compare_portfolios":
        names = args.get("names") or []
        if not isinstance(names, list) or not names:
            return {"error": "Informe ao menos um nome em names."}
        found: List[Dict[str, Any]] = []
        missing: List[str] = []
        for raw in names:
            entry = _find_portfolio(str(raw), entries)
            if entry is not None and entry not in found:
                found.append(entry)
            elif entry is None:
                missing.append(str(raw))
        result: Dict[str, Any] = {"portfolios": found}
        if args.get("metric"):
            result["metric"] = str(args["metric"])
        if missing:
            result["not_found"] = missing
            result["available_portfolios"] = [e["portfolio_name"] for e in entries]
        return result

    if name == "get_agent_performance":
        agents = get_agents()
        entry = _find_agent(str(args.get("agent_name") or ""), agents)
        if entry is not None:
            return entry
        return {
            "error": "Agente não encontrado no período.",
            "available_agents": [a["agent_name"] for a in agents],
        }

    if name == "list_agents_performance":
        agents = get_agents()
        order_by = str(args.get("order_by") or "valor_acordos")
        if order_by not in _AGENT_ORDER_BY_FIELDS:
            return {"error": f"Métrica inválida: {order_by!r}.", "available_metrics": sorted(_AGENT_ORDER_BY_FIELDS)}
        try:
            limit = int(args.get("limit") or 10)
        except (TypeError, ValueError):
            limit = 10
        limit = max(1, min(limit, 50))
        ranked = sorted(agents, key=lambda a: a.get(order_by) or 0, reverse=True)
        return ranked[:limit]

    if name == "get_ritmo_acordos_dia":
        fn = (providers or {}).get("get_ritmo_acordos_dia")
        if fn is None:
            return {"error": "Tool indisponível neste contexto."}
        return fn()

    if name == "get_acordo_status_breakdown":
        fn = (providers or {}).get("get_acordo_status_breakdown")
        if fn is None:
            return {"error": "Tool indisponível neste contexto."}
        return fn()

    if name == "get_fase_negociacao":
        fn = (providers or {}).get("get_fase_negociacao")
        if fn is None:
            return {"error": "Tool indisponível neste contexto."}
        fase = args.get("fase")
        if fase is not None:
            fase = str(fase).strip().lower()
            if fase not in _FASES:
                return {"error": f"Fase inválida: {args.get('fase')!r}.", "available_fases": sorted(_FASES)}
        return fn(fase)

    if name == "get_cruzamento_agente_carteira":
        fn = (providers or {}).get("get_cruzamento_agente_carteira")
        if fn is None:
            return {"error": "Tool indisponível neste contexto."}
        raw_portfolio = args.get("portfolio")
        raw_agente = args.get("agent_name")
        if bool(raw_portfolio) == bool(raw_agente):
            return {"error": "Informe exatamente um filtro: portfolio OU agent_name."}
        portfolio = agente = None
        aviso_ambiguidade = None
        if raw_portfolio:
            entry = _find_portfolio(str(raw_portfolio), entries)
            if entry is None:
                return {
                    "error": "Carteira não encontrada no período.",
                    "available_portfolios": [e["portfolio_name"] for e in entries],
                }
            portfolio = entry["portfolio_name"]
            aviso_ambiguidade = _ambiguity_warning(str(raw_portfolio), entry, entries)
        else:
            agent_entry = _find_agent(str(raw_agente), get_agents())
            if agent_entry is None:
                return {
                    "error": "Agente não encontrado no período.",
                    "available_agents": [a["agent_name"] for a in get_agents()],
                }
            agente = agent_entry["agent_name"]
        result = fn(portfolio, agente)
        if aviso_ambiguidade and isinstance(result, dict):
            result = {**result, "aviso_ambiguidade": aviso_ambiguidade}
        return result

    if name == "get_ranking_agentes_por_dimensao":
        fn = (providers or {}).get("get_ranking_agentes_por_dimensao")
        if fn is None:
            return {"error": "Tool indisponível neste contexto."}
        dimensao = str(args.get("dimensao") or "").strip().lower()
        if dimensao not in _RANKING_DIMENSOES:
            return {"error": f"Dimensão inválida: {args.get('dimensao')!r}.", "available_dimensoes": sorted(_RANKING_DIMENSOES)}
        try:
            limit = int(args.get("limit") or 10)
        except (TypeError, ValueError):
            limit = 10
        limit = max(1, min(limit, 50))
        return fn(dimensao, limit)

    if name == "query_kpi_historico":
        try:
            validated = QueryKpiInput(**args)
        except ValidationError as exc:
            return build_tool_error("validation", hint=str(exc), user_facing="Parâmetros inválidos para a consulta.")
        fn = (providers or {}).get("query_kpi_historico")
        if fn is None:
            return {"error": "Tool indisponível neste contexto."}
        return fn(
            db=validated.db, kpi=validated.kpi,
            date_from=validated.date_from.isoformat(), date_to=validated.date_to.isoformat(),
            granularidade=validated.granularidade, page=validated.page,
            portfolio=validated.portfolio,
        )

    if name == "comparar_agentes":
        try:
            validated = CompararAgentesInput(**args)
        except ValidationError as exc:
            return build_tool_error("validation", hint=str(exc), user_facing="Parâmetros inválidos para a comparação.")
        fn = (providers or {}).get("comparar_agentes")
        if fn is None:
            return {"error": "Tool indisponível neste contexto."}
        agents = fn(db=validated.db, date_from=validated.date_from.isoformat(), date_to=validated.date_to.isoformat())
        normalized_keys = [k.strip().lower() for k in validated.agent_keys]
        if len(set(normalized_keys)) != len(normalized_keys):
            return build_tool_error(
                "validation",
                hint="agent_keys tem chaves duplicadas após normalização.",
                user_facing="Chaves de agente repetidas no pedido.",
            )
        found: List[Dict[str, Any]] = []
        missing: List[str] = []
        system_accounts: List[str] = []
        for raw_key in normalized_keys:
            entry = _find_agent(raw_key, agents)
            if entry is not None:
                found.append(entry)
                continue
            # Conta de sistema não aparece em `agents` (já filtrada no SQL de
            # produtividade) — checagem best-effort contra as constantes Python
            # canônicas; a lista embutida em FILTRO_AGENTES_EXCLUIDOS_SQL (SQL
            # cru) tem 2 entradas a mais (FT5SYSTEM, SUPORTE/SISTEMA por chave)
            # que não têm espelho em tupla Python — não criar uma terceira lista
            # (regra do caveat agent_filter_divergence).
            is_system = raw_key.upper() in settings.EXCLUDED_AGENT_EXACT_NAMES or any(
                raw_key.upper().startswith(p) for p in settings.EXCLUDED_AGENT_PREFIXES
            )
            (system_accounts if is_system else missing).append(raw_key)
        if system_accounts or missing:
            errors = [f"agente {k!r} é conta de sistema e não é comparável" for k in system_accounts]
            errors += [f"agente {k!r} não encontrado no período" for k in missing]
            return build_tool_error(
                "validation",
                hint="; ".join(errors),
                user_facing="Um ou mais agentes não podem ser comparados.",
                errors=errors,
                available_agents=[a["agent_name"] for a in agents],
            )
        result: Dict[str, Any] = {
            "agentes": [
                {"agent_name": e["agent_name"], "login": e["login"], **{m: e.get(_COMPARAR_METRICA_ALIASES.get(m, m)) for m in validated.metricas}}
                for e in found
            ],
        }
        if validated.consolidar_cross_db:
            result["meta"] = {"warnings": [
                "consolidar_cross_db=true pedido, mas cada banco tem entidades de agente "
                "separadas por padrão (ver caveat cross_db) — valores abaixo NÃO foram somados entre bancos."
            ]}
        return result

    if name == "detalhar_portfolio":
        try:
            validated = DetalharPortfolioInput(**args)
        except ValidationError as exc:
            return build_tool_error("validation", hint=str(exc), user_facing="Parâmetros inválidos para o drill-down.")
        fn = (providers or {}).get("detalhar_portfolio")
        if fn is None:
            return {"error": "Tool indisponível neste contexto."}
        return fn(
            db=validated.db, portfolio=validated.portfolio,
            date_from=validated.date_from.isoformat(), date_to=validated.date_to.isoformat(),
            drilldown=validated.drilldown, page=validated.page, page_size=validated.page_size,
        )

    if name == "explicar_metrica":
        try:
            validated = ExplicarMetricaInput(**args)
        except ValidationError as exc:
            return build_tool_error("validation", hint=str(exc), user_facing="Termo inválido.")
        registry = _load_metric_registry()
        resolved = _resolve_termo(validated.termo, registry)
        if resolved is None:
            return build_tool_error(
                "validation",
                hint=f"Termo desconhecido: {validated.termo!r}.",
                user_facing="Não conheço esse termo.",
                termos_disponiveis=_available_termos(registry),
            )
        return {"termo": validated.termo, **resolved}

    return build_tool_error(
        "unknown_tool",
        hint=f"Tool desconhecida: {name!r}.",
        user_facing="Pedido não corresponde a nenhuma fonte de dados disponível.",
        available_tools=sorted(t["name"] for t in AGENT_TOOLS),
    )
