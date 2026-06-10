"""
Rota do agente de chat (/agente/chat).

Gates: 404 quando ENABLE_AGENT_CHAT=false; 503 quando falta a chave do
provedor ativo. Resposta sempre no envelope padrão (data[0] = AgentResponse).
"""
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

import config.settings as settings
from core.utils.response_envelope import build_response_envelope
from core.utils.validation import validate_database_or_todos
from dominios.agente.agente import run_agent

router = APIRouter(prefix="/agente", tags=["agente"])


class AgentChatMessage(BaseModel):
    role: str
    content: str


class AgentChatRequest(BaseModel):
    messages: List[AgentChatMessage]
    database: str
    dateFrom: Optional[str] = None
    dateTo: Optional[str] = None


def _validate_agent_date(value: Optional[str], field: str) -> str:
    if not value:
        return date.today().isoformat()
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d").date().isoformat()
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"{field} inválido: use o formato YYYY-MM-DD.",
        ) from exc


@router.post("/chat")
def post_agente_chat(body: AgentChatRequest, request: Request = None) -> Dict[str, Any]:
    if not settings.ENABLE_AGENT_CHAT:
        raise HTTPException(status_code=404, detail="Agente desabilitado no servidor (ENABLE_AGENT_CHAT).")
    if settings.AGENT_PROVIDER not in ("anthropic", "deepseek"):
        raise HTTPException(
            status_code=503,
            detail=f"AGENT_PROVIDER inválido: {settings.AGENT_PROVIDER!r}. Use 'anthropic' ou 'deepseek'.",
        )
    active_key = settings.DEEPSEEK_API_KEY if settings.AGENT_PROVIDER == "deepseek" else settings.ANTHROPIC_API_KEY
    if not active_key:
        key_name = "DEEPSEEK_API_KEY" if settings.AGENT_PROVIDER == "deepseek" else "ANTHROPIC_API_KEY"
        raise HTTPException(
            status_code=503,
            detail=f"Agente habilitado, mas {key_name} não foi configurada no servidor.",
        )

    if not body.messages:
        raise HTTPException(status_code=400, detail="messages não pode ser vazio.")
    for msg in body.messages:
        if msg.role not in ("user", "assistant"):
            raise HTTPException(status_code=400, detail=f"role inválido: {msg.role!r}.")
        if not msg.content.strip():
            raise HTTPException(status_code=400, detail="Mensagem sem conteúdo.")
    if body.messages[-1].role != "user":
        raise HTTPException(status_code=400, detail="A última mensagem deve ser do usuário.")

    validated_db = validate_database_or_todos(body.database)
    date_from = _validate_agent_date(body.dateFrom, "dateFrom")
    date_to = _validate_agent_date(body.dateTo, "dateTo")
    if date_from > date_to:
        date_from, date_to = date_to, date_from

    # Janela de contexto limitada: só as últimas 20 mensagens, cada uma
    # truncada, para conter custo de tokens em conversas longas.
    trimmed = [
        {"role": m.role, "content": m.content.strip()[:4000]}
        for m in body.messages[-20:]
    ]

    run_id = getattr(request.state, "run_id", f"srv-{uuid4().hex[:12]}") if request else f"srv-{uuid4().hex[:12]}"
    agent_response = run_agent(trimmed, validated_db, date_from, date_to, run_id=run_id)

    sources = settings.ALLOWED_DATABASES if validated_db == "todos" else [validated_db]
    return build_response_envelope(
        [agent_response], sources,
        filters={
            "database": validated_db,
            "dateFrom": date_from,
            "dateTo": date_to,
            "provider": settings.AGENT_PROVIDER,
            "model": settings.AGENT_MODEL,
        },
        run_id=run_id,
    )
