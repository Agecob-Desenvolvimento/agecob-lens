"""
Tools do agente de carteiras: schemas expostos ao modelo + dispatch puro
sobre o dataset em memória (dezenas de carteiras — custo desprezível).

Nomes e parâmetros fazem parte do contrato do prompt (system_prompt.md) —
alterar lá e aqui juntos.
"""
from typing import Any, Dict, List, Optional

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
        "Todos os percentuais usam o mesmo denominador: valor_primeira_parcela, "
        "a soma do VALOR da 1ª parcela (PARCELA = 0) dos boletos GERADOS no período. "
        "Isso torna as dimensões comparáveis entre si e entre carteiras."
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


def dispatch_tool(
    name: str,
    args: Dict[str, Any],
    entries: List[Dict[str, Any]],
) -> Any:
    """Executa uma tool do agente sobre o dataset em memória. Função pura."""
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
        return result

    if name == "explain_business_rule":
        rule_name = str(args.get("rule_name") or "").strip()
        text = BUSINESS_RULES.get(rule_name)
        if text is None:
            return {"error": f"Regra desconhecida: {rule_name!r}.", "available_rules": sorted(BUSINESS_RULES)}
        return {"rule_name": rule_name, "explanation": text}

    return {"error": f"Tool desconhecida: {name!r}."}
