"""
Tools do agente de carteiras: schemas expostos ao modelo + dispatch puro
sobre o dataset em memória (dezenas de carteiras — custo desprezível).

Nomes e parâmetros fazem parte do contrato do prompt (system_prompt.md) —
alterar lá e aqui juntos.
"""
from typing import Any, Callable, Dict, List, Optional

import config.settings as settings

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
        "name": "explain_business_rule",
        "description": "Explica uma regra de negócio canônica do cálculo de risco.",
        "input_schema": {
            "type": "object",
            "properties": {
                "rule_name": {
                    "type": "string",
                    "enum": ["risco_composto_formula", "status_5", "denominador", "status_gerados", "thresholds"],
                },
            },
            "required": ["rule_name"],
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
        "name": "get_time_series",
        "description": (
            "Série temporal diária de uma métrica terminando na data de referência. "
            "metric: 'valor' (R$ de 1ª parcela gerado por dia), 'qtd' (acordos por "
            "dia) ou 'risco' (risco composto % do dia). period: '7d', '30d' ou "
            "'90d'. portfolio (opcional) restringe a uma carteira. Use para "
            "tendência, evolução, histórico, degradação, 'vs semana passada'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "metric": {"type": "string", "enum": ["valor", "qtd", "risco"]},
                "period": {"type": "string", "enum": ["7d", "30d", "90d"]},
                "portfolio": {"type": "string", "description": "Nome (ou trecho do nome) da carteira (opcional)."},
            },
            "required": ["metric", "period"],
        },
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
        "name": "get_efetividade_conversao",
        "description": (
            "Conversão oficial de boletos (1ª parcela paga no prazo ≤5d / emitida, "
            "base 2026+). visao: 'mensal' (últimos 12 meses), 'diaria' (últimos 30 "
            "dias) ou 'por_agente' (top 15 por volume nos últimos 3 meses; "
            "agent_name restringe a um agente). Use para 'boletos estão sendo "
            "pagos?', 'conversão histórica', 'quem converte melhor'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "visao": {"type": "string", "enum": ["mensal", "diaria", "por_agente"]},
                "agent_name": {"type": "string", "description": "Nome do agente (só com visao=por_agente, opcional)."},
            },
            "required": ["visao"],
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
        "name": "get_maiores_acordos",
        "description": (
            "Maiores acordos de UMA carteira no período, por valor total, no tipo "
            "pedido: 'acordos' (aprovados), 'excecoes', 'quebrados' ou 'rejeitados'. "
            "Retorna até 20 acordos com valores, agente, devedor (CPF mascarado) e "
            "vencimento. Use após identificar uma carteira em risco, para acionar "
            "casos concretos."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "tipo": {"type": "string", "enum": ["acordos", "excecoes", "quebrados", "rejeitados"]},
                "portfolio": {"type": "string", "description": "Nome (ou trecho) da carteira."},
                "limit": {"type": "integer", "description": "Máximo de acordos (padrão 10, máx 20)."},
            },
            "required": ["tipo", "portfolio"],
        },
    },
]

# Texto canônico das regras de negócio (fonte: config/settings.py e
# docs de regras de negócio). O agente cita isso verbatim ao explicar regras.
BUSINESS_RULES: Dict[str, str] = {
    "risco_composto_formula": (
        "risco_composto = MAX(excecoes_pct, quebrados_pct, rejeitados_pct). "
        "Usa-se o MÁXIMO, nunca a soma: as dimensões não são aditivas (os quebrados, "
        "por exemplo, são subconjunto dos boletos gerados) e somá-las dupla-contaria "
        "valor, exagerando o risco. O risco da carteira é o seu pior eixo."
    ),
    "status_5": (
        "Status 5 = PENDENTE no enum do COBweb (aguardando validação interna). "
        "Na visão de risco do negócio é tratado como 'Exceção': valor parado que "
        "ainda não virou boleto firme."
    ),
    "denominador": (
        "Todos os percentuais usam o mesmo denominador: o universo de 1ª parcela "
        "(PARCELA = 0) do período — valor GERADO (status 1, 2, 3, 10, 12) + exceções "
        "(status 5) + rejeitados (status 7). Cada dimensão é uma fatia 0–100% desse "
        "universo, comparável entre si e entre carteiras."
    ),
    "status_gerados": (
        "GERADOS = status (1, 2, 3, 10, 12): ATIVO, QUEBRA, BAIXA POR PAGAMENTO, "
        "QUEBRA AUTOMÁTICA e BAIXA POR PAGAMENTO AVULSO. É o universo de boletos "
        "efetivamente emitidos — inclui os que quebraram depois."
    ),
    "thresholds": (
        f"Níveis de risco pelo risco_composto: baixo <= {settings.RISK_LEVEL_LOW_MAX}%, "
        f"medio <= {settings.RISK_LEVEL_MID_MAX}%, alto > {settings.RISK_LEVEL_MID_MAX}%. "
        "Qualquer dimensão acima de 100% é anomalia de dados e deve ser alertada."
    ),
}


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


# Espelha o enum de order_by no schema de list_agents_performance — o enum do
# schema é orientativo para o modelo, não é validado pelo provedor.
_AGENT_ORDER_BY_FIELDS = frozenset({
    "valor_acordos", "qtd_acordos", "conversao_pct",
    "qtd_contatos", "qtd_acionamentos", "valor_primeira_parcela",
    "ticket_medio", "valor_excecoes", "qtd_excecoes",
    "taxa_cpc_pct", "taxa_contato_pct", "qtd_alo",
})

# Espelham os enums dos schemas das tools com provider próprio.
_SERIES_METRICS = frozenset({"valor", "qtd", "risco"})
_SERIES_PERIODS = frozenset({"7d", "30d", "90d"})
_FASES = frozenset({"inicio", "meio", "final", "quitado"})
_CONVERSAO_VISOES = frozenset({"mensal", "diaria", "por_agente"})
_RANKING_DIMENSOES = frozenset({"gerados", "excecoes", "quebrados", "rejeitados"})
_DETALHE_TIPOS = frozenset({"acordos", "excecoes", "quebrados", "rejeitados"})


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
        entry = _find_portfolio(str(args.get("portfolio_name") or ""), entries)
        if entry is not None:
            return entry
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

    if name == "explain_business_rule":
        rule_name = str(args.get("rule_name") or "").strip()
        text = BUSINESS_RULES.get(rule_name)
        if text is None:
            return {"error": f"Regra desconhecida: {rule_name!r}.", "available_rules": sorted(BUSINESS_RULES)}
        return {"rule_name": rule_name, "explanation": text}

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

    if name == "get_time_series":
        fn = (providers or {}).get("get_time_series")
        if fn is None:
            return {"error": "Tool indisponível neste contexto."}
        metric = str(args.get("metric") or "").strip().lower()
        if metric not in _SERIES_METRICS:
            return {"error": f"Métrica inválida: {args.get('metric')!r}.", "available_metrics": sorted(_SERIES_METRICS)}
        period = str(args.get("period") or "").strip().lower()
        if period not in _SERIES_PERIODS:
            return {"error": f"Período inválido: {args.get('period')!r}.", "available_periods": sorted(_SERIES_PERIODS)}
        portfolio = None
        if args.get("portfolio"):
            entry = _find_portfolio(str(args["portfolio"]), entries)
            if entry is None:
                return {
                    "error": "Carteira não encontrada no período.",
                    "available_portfolios": [e["portfolio_name"] for e in entries],
                }
            portfolio = entry["portfolio_name"]
        return fn(metric, period, portfolio)

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

    if name == "get_efetividade_conversao":
        fn = (providers or {}).get("get_efetividade_conversao")
        if fn is None:
            return {"error": "Tool indisponível neste contexto."}
        visao = str(args.get("visao") or "").strip().lower()
        if visao not in _CONVERSAO_VISOES:
            return {"error": f"Visão inválida: {args.get('visao')!r}.", "available_visoes": sorted(_CONVERSAO_VISOES)}
        agente = None
        if args.get("agent_name"):
            entry = _find_agent(str(args["agent_name"]), get_agents())
            if entry is None:
                return {
                    "error": "Agente não encontrado no período.",
                    "available_agents": [a["agent_name"] for a in get_agents()],
                }
            agente = entry["agent_name"]
        return fn(visao, agente)

    if name == "get_cruzamento_agente_carteira":
        fn = (providers or {}).get("get_cruzamento_agente_carteira")
        if fn is None:
            return {"error": "Tool indisponível neste contexto."}
        raw_portfolio = args.get("portfolio")
        raw_agente = args.get("agent_name")
        if bool(raw_portfolio) == bool(raw_agente):
            return {"error": "Informe exatamente um filtro: portfolio OU agent_name."}
        portfolio = agente = None
        if raw_portfolio:
            entry = _find_portfolio(str(raw_portfolio), entries)
            if entry is None:
                return {
                    "error": "Carteira não encontrada no período.",
                    "available_portfolios": [e["portfolio_name"] for e in entries],
                }
            portfolio = entry["portfolio_name"]
        else:
            agent_entry = _find_agent(str(raw_agente), get_agents())
            if agent_entry is None:
                return {
                    "error": "Agente não encontrado no período.",
                    "available_agents": [a["agent_name"] for a in get_agents()],
                }
            agente = agent_entry["agent_name"]
        return fn(portfolio, agente)

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

    if name == "get_maiores_acordos":
        fn = (providers or {}).get("get_maiores_acordos")
        if fn is None:
            return {"error": "Tool indisponível neste contexto."}
        tipo = str(args.get("tipo") or "").strip().lower()
        if tipo not in _DETALHE_TIPOS:
            return {"error": f"Tipo inválido: {args.get('tipo')!r}.", "available_tipos": sorted(_DETALHE_TIPOS)}
        entry = _find_portfolio(str(args.get("portfolio") or ""), entries)
        if entry is None:
            return {
                "error": "Carteira não encontrada no período.",
                "available_portfolios": [e["portfolio_name"] for e in entries],
            }
        try:
            limit = int(args.get("limit") or 10)
        except (TypeError, ValueError):
            limit = 10
        limit = max(1, min(limit, 20))
        return fn(tipo, entry["portfolio_name"], limit)

    return {"error": f"Tool desconhecida: {name!r}."}
