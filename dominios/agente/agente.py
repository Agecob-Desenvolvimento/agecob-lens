"""
Runner do agente de carteiras: dataset → LLM (provedor configurado) → tools
→ resposta JSON validada (contrato AgentResponse).

Provedores: Anthropic (Claude, formato nativo de tools) e DeepSeek (API
compatível com OpenAI, function calling). SDKs importados sob demanda para a
API subir mesmo sem os pacotes instalados (rota responde 503 com instrução).
"""
import json
import os
import time
from datetime import date
from typing import Any, Callable, Dict, List, Optional

from fastapi import HTTPException

import config.settings as settings
from core.telemetry.agent_logger import _agent_ndjson, _sentry_log
from dominios.agente.agentes import build_agent_entries
from dominios.agente.cruzamento import build_cruzamento, build_ranking_agentes
from dominios.agente.detalhe_portfolio import build_detalhe_portfolio
from dominios.agente.errors import sanitize_final_text
from dominios.agente.fases import build_fase_negociacao
from dominios.agente.guards import RunState, _call_hash
from dominios.agente.kpi_historico import build_kpi_historico
from dominios.agente.risco import build_portfolio_entries, build_status_breakdown
from dominios.agente.tools import AGENT_TOOLS, dispatch_tool

# Injetada quando o RunGuard força o encerramento do loop (teto de steps,
# wall clock ou chamada repetida/espiral declarada como loop) — pede a
# síntese final sem oferecer mais tools (mecanismo portável entre providers;
# mais confiável que depender de tool_choice="none", cujo suporte varia).
_FORCE_FINAL_NUDGE = (
    "Você atingiu o limite de passos/tempo desta consulta (ou repetiu uma "
    "chamada de tool). Não chame mais tools — responda agora, no formato "
    "JSON exigido, com os dados que já apurou. Se algo ficou incompleto, "
    "diga isso explicitamente no campo text."
)

_SYSTEM_PROMPT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "system_prompt.md")

_CONFIDENCE_LEVELS = ("high", "medium", "low")
_HIGHLIGHT_TYPES = ("anomaly", "metric", "portfolio")


def _normalize_agent_response(payload: Any, fallback_text: str) -> Dict[str, Any]:
    """
    Garante o contrato AgentResponse mesmo quando o modelo devolve JSON fora
    do esquema (nunca derruba a UX por erro de formato: degrada para low).
    """
    if not isinstance(payload, dict):
        return {
            "text": fallback_text.strip() or "Não foi possível gerar uma resposta.",
            "highlights": [],
            "suggested_actions": [],
            "data_sources": [],
            "confidence": "low",
        }

    text = str(payload.get("text") or "").strip() or fallback_text.strip() or "Não foi possível gerar uma resposta."

    highlights: List[Dict[str, str]] = []
    for item in payload.get("highlights") or []:
        if not isinstance(item, dict):
            continue
        h_type = str(item.get("type") or "").strip().lower()
        if h_type not in _HIGHLIGHT_TYPES:
            h_type = "metric"
        label = str(item.get("label") or "").strip()
        if not label:
            continue
        highlight = {"type": h_type, "label": label}
        if item.get("value") is not None:
            highlight["value"] = str(item["value"])
        highlights.append(highlight)

    suggested_actions: List[Dict[str, str]] = []
    for item in payload.get("suggested_actions") or []:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        if not label:
            continue
        action = {"label": label}
        if str(item.get("prompt") or "").strip():
            action["prompt"] = str(item["prompt"]).strip()
        suggested_actions.append(action)

    data_sources = [str(s) for s in (payload.get("data_sources") or []) if str(s).strip()]

    confidence = str(payload.get("confidence") or "").strip().lower()
    if confidence not in _CONFIDENCE_LEVELS:
        confidence = "low"

    return {
        "text": text,
        "highlights": highlights,
        "suggested_actions": suggested_actions,
        "data_sources": data_sources,
        "confidence": confidence,
    }


def _parse_agent_final_text(final_text: str) -> Dict[str, Any]:
    """Extrai o JSON da resposta final do modelo (tolera cercas ```json)."""
    raw = (final_text or "").strip()
    candidate = raw
    if candidate.startswith("```"):
        candidate = candidate.strip("`")
        if candidate.lower().startswith("json"):
            candidate = candidate[4:]
        candidate = candidate.strip()
    if not candidate.startswith("{"):
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start != -1 and end > start:
            candidate = candidate[start:end + 1]
    try:
        payload = json.loads(candidate)
    except (ValueError, TypeError):
        payload = None
    return _normalize_agent_response(payload, fallback_text=raw)


def _load_system_prompt(data_referencia: str) -> str:
    try:
        with open(_SYSTEM_PROMPT_PATH, "r", encoding="utf-8") as f:
            prompt = f.read()
    except OSError as exc:
        raise HTTPException(
            status_code=503,
            detail="Prompt do agente não encontrado (dominios/agente/system_prompt.md).",
        ) from exc
    return prompt.replace("{{DATA_REFERENCIA}}", data_referencia)


def _build_providers(
    db: str,
    date_from: str,
    date_to: str,
    run_id: Optional[str],
) -> Dict[str, Callable[..., Any]]:
    """
    Fontes próprias das tools que não usam o dataset de carteiras. Closures
    lazy: cada query roda apenas se a tool correspondente for chamada. O
    ritmo importa a rota KNN sob demanda (joblib/numpy só carregam se usados)
    e nunca propaga exceção — o chat degrada para um error dict.
    """
    def get_ritmo() -> Dict[str, Any]:
        from api.routers.ritmo_dia import ritmo_dia
        try:
            envelope = ritmo_dia(db)
        except HTTPException as exc:
            return {"error": str(exc.detail)}
        except Exception as exc:
            _sentry_log("error", "Falha ao calcular o ritmo do dia (tool do agente).", database=db, error=str(exc))
            return {"error": "Falha ao calcular o ritmo do dia."}
        return {**envelope["data"], "meta": envelope["meta"]}

    def get_breakdown() -> Dict[str, Any]:
        return build_status_breakdown(db, date_from, date_to, run_id=run_id)

    def get_fases(fase: Optional[str]) -> Dict[str, Any]:
        return build_fase_negociacao(db, date_to, fase, run_id=run_id)

    def get_cruzamento(portfolio: Optional[str], agente: Optional[str]) -> Dict[str, Any]:
        return build_cruzamento(db, date_from, date_to, portfolio, agente, run_id=run_id)

    def get_ranking(dimensao: str, limit: int) -> Dict[str, Any]:
        return build_ranking_agentes(db, date_from, date_to, dimensao, limit, run_id=run_id)

    # P1 (agente-tools-handoff.md §2): as 3 tools novas com date_from/date_to
    # levam `db` POR CHAMADA (não fechado sobre a sessão como as acima) —
    # podem consultar um banco diferente do filtro ativo. run_id continua
    # fechado (metadado da sessão, não do argumento da tool).
    # Nomes dos parâmetros abaixo têm que bater com as keywords usadas em
    # dispatch_tool (tools.py) — fn(db=..., date_from=..., date_to=..., ...).
    # Sombreiam db/date_from/date_to da sessão (linha 137) de propósito: estas
    # 3 tools recebem `db`/datas POR CHAMADA, não fechados sobre a sessão.
    def get_kpi_historico_call(
        db: str, kpi: str, date_from: str, date_to: str, granularidade: str, page: int,
        portfolio: Optional[str] = None,
    ) -> Dict[str, Any]:
        return build_kpi_historico(db, kpi, date_from, date_to, granularidade, page, run_id=run_id, portfolio=portfolio)

    def get_comparacao_agentes(db: str, date_from: str, date_to: str) -> List[Dict[str, Any]]:
        return build_agent_entries(db, date_from, date_to, run_id=run_id)

    def get_detalhe_portfolio_call(
        db: str, portfolio: str, date_from: str, date_to: str, drilldown: str, page: int, page_size: int,
    ) -> Dict[str, Any]:
        return build_detalhe_portfolio(db, portfolio, date_from, date_to, drilldown, page, page_size, run_id=run_id)

    return {
        "get_ritmo_acordos_dia": get_ritmo,
        "get_acordo_status_breakdown": get_breakdown,
        "get_fase_negociacao": get_fases,
        "get_cruzamento_agente_carteira": get_cruzamento,
        "get_ranking_agentes_por_dimensao": get_ranking,
        "query_kpi_historico": get_kpi_historico_call,
        "comparar_agentes": get_comparacao_agentes,
        "detalhar_portfolio": get_detalhe_portfolio_call,
    }


def _tool_result_json(
    name: str,
    args: Dict[str, Any],
    entries: List[Dict[str, Any]],
    get_agents: Callable[[], List[Dict[str, Any]]],
    providers: Dict[str, Callable[..., Any]],
    state: RunState,
    db: str,
    date_from: str,
    date_to: str,
    run_id: Optional[str],
) -> str:
    """
    `db`/`date_from`/`date_to` para a chave do cache entre requests
    (guards.ToolCache): as tools novas (P1) já levam esses campos nos args e
    sobrescrevem o default da sessão; as 11 antigas nunca carregam período
    nos args (vem do fechamento da sessão em _build_providers) — sem passar
    a janela aqui, a chave de cache colidia entre sessões com períodos
    diferentes (achado #2 do review pt4). ndjson por chamada (P3, §5.1):
    tool_name, args_hash, step_index, latency_ms, cache_hit, truncated,
    row_count, error_type — nunca args nem dado bruto (LGPD/PII, §5).
    """
    call_db = str(args.get("db") or db)
    call_date_from = str(args.get("date_from") or date_from)
    call_date_to = str(args.get("date_to") or date_to)
    t0 = time.monotonic()
    output = state.dispatch(
        name, args, lambda: dispatch_tool(name, args, entries, get_agents, providers=providers),
        db=call_db, date_from=call_date_from, date_to=call_date_to,
    )
    latency_ms = round((time.monotonic() - t0) * 1000, 1)
    meta = state.last_call_meta
    _agent_ndjson(
        "OBS",
        "dominios/agente/agente.py:_tool_result_json",
        "agent_tool_call",
        {
            "tool_name": name,
            "args_hash": _call_hash(name, args),
            "step_index": meta.get("step_index"),
            "latency_ms": latency_ms,
            "cache_hit": meta.get("cache_hit", False),
            "truncated": meta.get("truncated", False),
            "row_count": meta.get("row_count"),
            "error_type": meta.get("error_type"),
        },
        run_id=run_id,
    )
    return json.dumps(output, ensure_ascii=False, default=str)


def _msg_role(msg: Any) -> Optional[str]:
    return msg.get("role") if isinstance(msg, dict) else getattr(msg, "role", None)


def _append_user_text(convo: List[Any], text: str) -> None:
    """
    Anexa `text` como turno "user" respeitando a alternância estrita de role
    exigida pela API da Anthropic. Se `convo` já termina em "user" (ex.: o
    tool_result da rodada anterior), anexa como bloco de texto adicional NA
    MESMA mensagem em vez de empilhar uma nova — duas mensagens "user"
    consecutivas são rejeitadas pela API. Regressão do próprio fix de
    round-exhaustion desta sessão, achado #3 do review pt4: o nudge de
    força-final sempre disparava DEPOIS de pelo menos uma rodada de tool já
    ter anexado {"role": "user", "content": tool_results}.
    """
    if convo and _msg_role(convo[-1]) == "user":
        content = convo[-1]["content"]
        if isinstance(content, str):
            convo[-1]["content"] = [{"type": "text", "text": content}, {"type": "text", "text": text}]
        else:
            content.append({"type": "text", "text": text})
    else:
        convo.append({"role": "user", "content": text})


def _msg_tool_calls(msg: Any) -> Optional[List[Any]]:
    return msg.get("tool_calls") if isinstance(msg, dict) else getattr(msg, "tool_calls", None)


def _compact_deepseek_convo(convo: List[Any], keep_recent_groups: int = 1) -> List[Any]:
    """
    Compaction de contexto (§3 item 5, P3): quando RunState.budget_near_limit()
    fica true, resume os grupos assistant(tool_calls)+tool(resultados) mais
    antigos num bloco "fatos apurados" e remove os JSONs brutos — sempre
    removendo o par inteiro (nunca um tool_call órfão, que quebraria a API).
    Preserva a mensagem de sistema, todo o histórico de usuário anterior ao
    1º grupo, e os `keep_recent_groups` grupos mais recentes intactos.
    """
    groups: List[Any] = []
    i = 0
    while i < len(convo):
        if _msg_role(convo[i]) == "assistant" and _msg_tool_calls(convo[i]):
            j = i + 1
            while j < len(convo) and _msg_role(convo[j]) == "tool":
                j += 1
            groups.append((i, j))
            i = j
        else:
            i += 1

    if len(groups) <= keep_recent_groups:
        return convo

    to_remove = groups[: len(groups) - keep_recent_groups]
    fatos: List[str] = []
    for start, _end in to_remove:
        for tc in _msg_tool_calls(convo[start]) or []:
            name = tc.get("function", {}).get("name") if isinstance(tc, dict) else tc.function.name
            fatos.append(name)

    resumo_msg = {
        "role": "user",
        "content": (
            "[Resumo automático — orçamento de contexto] Chamadas de tool anteriores já "
            "consultadas nesta conversa (resultados brutos removidos para caber no orçamento): "
            + ", ".join(fatos) + ". Não repita essas chamadas; use o que já apurou."
        ),
    }
    keep_from = to_remove[-1][1]
    return convo[: groups[0][0]] + [resumo_msg] + convo[keep_from:]


def _compact_anthropic_convo(convo: List[Any], keep_recent_groups: int = 1) -> List[Any]:
    """Mesma ideia de _compact_deepseek_convo, mas no formato Anthropic (blocos de conteúdo)."""
    groups: List[Any] = []
    i = 0
    while i < len(convo):
        msg = convo[i]
        content = msg.get("content") if isinstance(msg, dict) else None
        is_tool_turn = (
            isinstance(msg, dict) and msg.get("role") == "assistant" and isinstance(content, list)
            and any(getattr(b, "type", None) == "tool_use" for b in content)
        )
        if is_tool_turn and i + 1 < len(convo) and _msg_role(convo[i + 1]) == "user":
            groups.append((i, i + 2))
            i += 2
        else:
            i += 1

    if len(groups) <= keep_recent_groups:
        return convo

    to_remove = groups[: len(groups) - keep_recent_groups]
    fatos: List[str] = []
    for start, _end in to_remove:
        for block in convo[start]["content"]:
            if getattr(block, "type", None) == "tool_use":
                fatos.append(getattr(block, "name", "?"))

    resumo_msg = {
        "role": "user",
        "content": (
            "[Resumo automático — orçamento de contexto] Chamadas de tool anteriores já "
            "consultadas nesta conversa (resultados brutos removidos para caber no orçamento): "
            + ", ".join(fatos) + ". Não repita essas chamadas; use o que já apurou."
        ),
    }
    keep_from = to_remove[-1][1]
    return convo[: groups[0][0]] + [resumo_msg] + convo[keep_from:]


def _loop_anthropic(
    system_prompt: str,
    messages: List[Dict[str, str]],
    entries: List[Dict[str, Any]],
    get_agents: Callable[[], List[Dict[str, Any]]],
    providers: Dict[str, Callable[..., Any]],
    run_id: Optional[str],
    state: RunState,
    db: str,
    date_from: str,
    date_to: str,
) -> str:
    try:
        import anthropic
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="SDK 'anthropic' não instalado no servidor (pip install anthropic).",
        ) from exc

    client = anthropic.Anthropic(
        api_key=settings.ANTHROPIC_API_KEY,
        timeout=settings.AGENT_HTTP_TIMEOUT_SECONDS,
        max_retries=1,
    )
    convo: List[Dict[str, Any]] = [
        {"role": m["role"], "content": m["content"]} for m in messages
    ]

    response = None
    try:
        for i in range(settings.AGENT_MAX_TOOL_ITERS + 1):
            if state.force_final() or i == settings.AGENT_MAX_TOOL_ITERS:
                _append_user_text(convo, _FORCE_FINAL_NUDGE)
                response = client.messages.create(
                    model=settings.AGENT_MODEL,
                    max_tokens=2048,
                    system=system_prompt,
                    messages=convo,
                )
                break
            response = client.messages.create(
                model=settings.AGENT_MODEL,
                max_tokens=2048,
                system=system_prompt,
                tools=AGENT_TOOLS,
                messages=convo,
            )
            if response.stop_reason != "tool_use":
                break
            convo.append({"role": "assistant", "content": response.content})
            tool_results: List[Dict[str, Any]] = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": _tool_result_json(block.name, dict(block.input or {}), entries, get_agents, providers, state, db, date_from, date_to, run_id),
                })
            convo.append({"role": "user", "content": tool_results})
            if state.budget_near_limit():
                convo = _compact_anthropic_convo(convo)
    except anthropic.APIError as exc:
        _agent_ndjson(
            "OBS",
            "dominios/agente/agente.py:run_agent:api_error",
            "agent_api_error",
            {"provider": "anthropic", "error": str(exc), "model": settings.AGENT_MODEL},
            run_id=run_id,
        )
        _sentry_log("error", "Falha ao consultar provedor de IA.", provider="anthropic", error=str(exc), model=settings.AGENT_MODEL)
        raise HTTPException(
            status_code=502,
            detail="Falha ao consultar o serviço de IA. Tente novamente.",
        ) from exc

    return "".join(
        block.text for block in (response.content if response else []) if block.type == "text"
    )


def _loop_deepseek(
    system_prompt: str,
    messages: List[Dict[str, str]],
    entries: List[Dict[str, Any]],
    get_agents: Callable[[], List[Dict[str, Any]]],
    providers: Dict[str, Callable[..., Any]],
    run_id: Optional[str],
    state: RunState,
    db: str,
    date_from: str,
    date_to: str,
) -> str:
    """Mesmo loop de tools no formato OpenAI (API do DeepSeek é compatível)."""
    try:
        import openai
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="SDK 'openai' não instalado no servidor (pip install openai).",
        ) from exc

    client = openai.OpenAI(
        api_key=settings.DEEPSEEK_API_KEY,
        base_url=settings.DEEPSEEK_BASE_URL,
        timeout=settings.AGENT_HTTP_TIMEOUT_SECONDS,
        max_retries=1,
    )
    tools = [
        {
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["input_schema"],
            },
        }
        for tool in AGENT_TOOLS
    ]
    convo: List[Any] = [{"role": "system", "content": system_prompt}] + [
        {"role": m["role"], "content": m["content"]} for m in messages
    ]

    message = None
    try:
        for i in range(settings.AGENT_MAX_TOOL_ITERS + 1):
            if state.force_final() or i == settings.AGENT_MAX_TOOL_ITERS:
                # DeepSeek/OpenAI não exige alternância estrita de role (mensagens
                # "tool" seguidas de "user" são normais) — sem o bug do #3, que é
                # específico da API da Anthropic. Ver _loop_anthropic acima.
                convo.append({"role": "user", "content": _FORCE_FINAL_NUDGE})
                response = client.chat.completions.create(
                    model=settings.AGENT_MODEL,
                    max_tokens=2048,
                    messages=convo,
                )
                message = response.choices[0].message
                break
            response = client.chat.completions.create(
                model=settings.AGENT_MODEL,
                max_tokens=2048,
                tools=tools,
                messages=convo,
            )
            message = response.choices[0].message
            if not message.tool_calls:
                break
            convo.append(message)
            for tool_call in message.tool_calls:
                try:
                    args = json.loads(tool_call.function.arguments or "{}")
                except (ValueError, TypeError):
                    args = {}
                convo.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": _tool_result_json(tool_call.function.name, args, entries, get_agents, providers, state, db, date_from, date_to, run_id),
                })
            if state.budget_near_limit():
                convo = _compact_deepseek_convo(convo)
    except openai.OpenAIError as exc:
        _agent_ndjson(
            "OBS",
            "dominios/agente/agente.py:run_agent:api_error",
            "agent_api_error",
            {"provider": "deepseek", "error": str(exc), "model": settings.AGENT_MODEL},
            run_id=run_id,
        )
        _sentry_log("error", "Falha ao consultar provedor de IA.", provider="deepseek", error=str(exc), model=settings.AGENT_MODEL)
        raise HTTPException(
            status_code=502,
            detail="Falha ao consultar o serviço de IA. Tente novamente.",
        ) from exc

    return (message.content or "") if message else ""


def run_agent(
    messages: List[Dict[str, str]],
    db: str,
    date_from: str,
    date_to: str,
    run_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Loop de tool-calling completo. Levanta HTTPException 502 em falha do
    provedor; nunca falha por formato de resposta (degrada para low).
    """
    entries = build_portfolio_entries(db, date_from, date_to, run_id=run_id)

    def get_agents() -> List[Dict[str, Any]]:
        return build_agent_entries(db, date_from, date_to, run_id=run_id)

    system_prompt = _load_system_prompt(date_to)
    system_prompt += (
        f"\n\n## Contexto desta sessão\n"
        f"- Data real de hoje (sistema): {date.today().isoformat()} — use sempre que a "
        f"pergunta mencionar \"hoje\", independente do período filtrado abaixo.\n"
        f"- Base de dados ativa: {db}\n"
        f"- Período analisado (filtro selecionado pelo usuário): {date_from} a {date_to}\n"
        f"- Carteiras carregadas no período: {len(entries)}\n"
    )

    providers = _build_providers(db, date_from, date_to, run_id)
    state = RunState()

    if settings.AGENT_PROVIDER == "deepseek":
        final_text = _loop_deepseek(system_prompt, messages, entries, get_agents, providers, run_id, state, db, date_from, date_to)
    else:
        final_text = _loop_anthropic(system_prompt, messages, entries, get_agents, providers, run_id, state, db, date_from, date_to)

    agent_response = _parse_agent_final_text(final_text)
    clean_text = sanitize_final_text(agent_response["text"])
    if clean_text is None:
        agent_response = {
            "text": "Não posso exibir esta resposta como veio — ela continha conteúdo não permitido "
                    "(SQL, dado bruto ou erro interno). Reformule a pergunta ou tente novamente.",
            "highlights": [],
            "suggested_actions": [],
            "data_sources": agent_response.get("data_sources", []),
            "confidence": "low",
        }
    else:
        agent_response["text"] = clean_text
    agent_response["data_referencia"] = date_to
    return agent_response
