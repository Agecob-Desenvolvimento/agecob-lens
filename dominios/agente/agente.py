"""
Runner do agente de carteiras: dataset → LLM (provedor configurado) → tools
→ resposta JSON validada (contrato AgentResponse).

Provedores: Anthropic (Claude, formato nativo de tools) e DeepSeek (API
compatível com OpenAI, function calling). SDKs importados sob demanda para a
API subir mesmo sem os pacotes instalados (rota responde 503 com instrução).
"""
import json
import os
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

import config.settings as settings
from core.telemetry.agent_logger import _agent_ndjson
from dominios.agente.risco import build_portfolio_entries
from dominios.agente.tools import AGENT_TOOLS, dispatch_tool

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


def _tool_result_json(name: str, args: Dict[str, Any], entries: List[Dict[str, Any]]) -> str:
    output = dispatch_tool(name, args, entries)
    return json.dumps(output, ensure_ascii=False, default=str)


def _loop_anthropic(
    system_prompt: str,
    messages: List[Dict[str, str]],
    entries: List[Dict[str, Any]],
    run_id: Optional[str],
) -> str:
    try:
        import anthropic
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="SDK 'anthropic' não instalado no servidor (pip install anthropic).",
        ) from exc

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    convo: List[Dict[str, Any]] = [
        {"role": m["role"], "content": m["content"]} for m in messages
    ]

    response = None
    try:
        for _ in range(settings.AGENT_MAX_TOOL_ITERS + 1):
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
                    "content": _tool_result_json(block.name, dict(block.input or {}), entries),
                })
            convo.append({"role": "user", "content": tool_results})
    except anthropic.APIError as exc:
        _agent_ndjson(
            "OBS",
            "dominios/agente/agente.py:run_agent:api_error",
            "agent_api_error",
            {"provider": "anthropic", "error": str(exc), "model": settings.AGENT_MODEL},
            run_id=run_id,
        )
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
    run_id: Optional[str],
) -> str:
    """Mesmo loop de tools no formato OpenAI (API do DeepSeek é compatível)."""
    try:
        import openai
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="SDK 'openai' não instalado no servidor (pip install openai).",
        ) from exc

    client = openai.OpenAI(api_key=settings.DEEPSEEK_API_KEY, base_url=settings.DEEPSEEK_BASE_URL)
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
        for _ in range(settings.AGENT_MAX_TOOL_ITERS + 1):
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
                    "content": _tool_result_json(tool_call.function.name, args, entries),
                })
    except openai.OpenAIError as exc:
        _agent_ndjson(
            "OBS",
            "dominios/agente/agente.py:run_agent:api_error",
            "agent_api_error",
            {"provider": "deepseek", "error": str(exc), "model": settings.AGENT_MODEL},
            run_id=run_id,
        )
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
    system_prompt = _load_system_prompt(date_to)
    system_prompt += (
        f"\n\n## Contexto desta sessão\n"
        f"- Base de dados ativa: {db}\n"
        f"- Período analisado: {date_from} a {date_to}\n"
        f"- Carteiras carregadas no período: {len(entries)}\n"
    )

    if settings.AGENT_PROVIDER == "deepseek":
        final_text = _loop_deepseek(system_prompt, messages, entries, run_id)
    else:
        final_text = _loop_anthropic(system_prompt, messages, entries, run_id)

    agent_response = _parse_agent_final_text(final_text)
    agent_response["data_referencia"] = date_to
    return agent_response
