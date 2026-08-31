"""
Contrato de erro único para tool results do agente (§4.1 do handoff
agente-tools-handoff.md) e sanitização da resposta final antes de sair para
o cliente (§5 — Segurança). Nunca deixar traceback cru chegar ao LLM nem
ao usuário.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional

# error_type -> retryable default (§4.1, tabela de taxonomia)
_ERROR_RETRYABLE_DEFAULT: Dict[str, bool] = {
    "validation": True,
    "upstream_timeout": True,
    "upstream_5xx": True,
    "upstream_4xx": False,
    "empty_result": False,
    "tool_disabled": False,
    "step_budget_exceeded": False,  # RunGuard.MAX_STEPS — ver guards.py RunState.dispatch, achado E1 pt5-live-testing
    "wall_clock_exceeded": False,  # RunGuard.WALL_CLOCK_S — ver guards.py RunState.dispatch, Cluster U pt5-live-testing (mesma classe do E1)
    "unknown_tool": False,
    "internal_error": False,  # bug de código (não upstream) — ver guards.py RunState.dispatch, achado #9
}


def build_tool_error(
    error_type: str,
    hint: str,
    user_facing: str,
    retryable: Optional[bool] = None,
    **extra: Any,
) -> Dict[str, Any]:
    """Envelope de erro único que toda tool/dispatch devolve — nunca um dict ad-hoc."""
    payload: Dict[str, Any] = {
        "ok": False,
        "error_type": error_type,
        "retryable": _ERROR_RETRYABLE_DEFAULT.get(error_type, False) if retryable is None else retryable,
        "hint": hint,
        "user_facing": user_facing,
    }
    payload.update(extra)
    return payload


# Sanitização de saída (§5): recusar SQL em bloco de código, dump de JSON bruto
# do envelope de tool result ({meta,data,errors} é o contrato real de
# build_response_envelope — ver docs/data-layer.md) e stack trace.
_FORBIDDEN_SQL_IN_CODE_BLOCK = re.compile(r"```[a-zA-Z]*\n[^`]*\b(SELECT|DROP|INSERT|DELETE)\b[^`]*```", re.I | re.S)
_TRACEBACK = re.compile(r"Traceback \(most recent call last\)", re.I)
_RAW_ENVELOPE_DUMP = re.compile(r'"(meta|data|errors)"\s*:\s*[\[{]')


def sanitize_final_text(text: str) -> Optional[str]:
    """
    Retorna `text` se limpo, ou None quando a resposta deve ser recusada por
    conter SQL em bloco de código, dump de JSON bruto de tool ou stack trace
    — o chamador degrada para uma resposta honesta (nunca expõe o motivo bruto).
    """
    if _FORBIDDEN_SQL_IN_CODE_BLOCK.search(text) or _TRACEBACK.search(text) or _RAW_ENVELOPE_DUMP.search(text):
        return None
    return text
