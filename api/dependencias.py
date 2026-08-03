import hmac
import re
import threading
from collections import deque
from datetime import datetime, timezone
from typing import Dict, Optional
from uuid import uuid4

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

import config.settings as settings


_RATE_LIMIT_BUCKETS: Dict[str, deque] = {}
_RATE_LIMIT_LOCK = threading.Lock()
# O dict nunca era podado: uma entrada por (client_ip, api_key) distinto ficava
# para sempre no processo. Acima deste teto, varre e remove as janelas vencidas.
_RATE_LIMIT_MAX_BUCKETS = 5000


def require_auth(request: Request) -> None:
    if not settings.REQUIRE_API_AUTH:
        return
    if not settings.API_KEY or not settings.API_TOKEN:
        raise HTTPException(status_code=500, detail="API auth está habilitada, mas API_KEY/API_TOKEN não foram configurados.")
    api_key = request.headers.get("x-api-key", "")
    auth_header = request.headers.get("authorization", "")
    expected_auth = f"Bearer {settings.API_TOKEN}"
    # compare_digest: comparação em tempo constante evita timing side-channel.
    key_ok = hmac.compare_digest(api_key, settings.API_KEY)
    tok_ok = hmac.compare_digest(auth_header, expected_auth)
    if not (key_ok and tok_ok):
        raise HTTPException(status_code=401, detail="Unauthorized")


# /dashboard/ (dados) + /agente/ (LLM, custo por chamada) + /admin/ (DBA) +
# /regressao/ (fit de sklearn, CPU por chamada). Mesmo bucket por
# (client_ip, api_key); /health/ e demais ficam fora p/ não atrapalhar
# monitoramento e navegação normal do SPA.
_RATE_LIMITED_PREFIXES = ("/dashboard/", "/agente/", "/admin/", "/regressao/")


def rate_limit_dashboard(request: Request, path: str) -> Optional[JSONResponse]:
    if not path.startswith(_RATE_LIMITED_PREFIXES):
        return None

    client_ip = request.client.host if request.client else "unknown"
    api_key = request.headers.get("x-api-key", "missing")
    bucket_key = f"{client_ip}:{api_key}"
    now = datetime.now(timezone.utc).timestamp()

    # Lock: o read-modify-write da deque roda de várias threads do threadpool, e o
    # check-then-act sem ele deixava passar mais requisições que o limite.
    with _RATE_LIMIT_LOCK:
        if len(_RATE_LIMIT_BUCKETS) > _RATE_LIMIT_MAX_BUCKETS:
            _poda_buckets(now)
        bucket = _RATE_LIMIT_BUCKETS.setdefault(bucket_key, deque())

        while bucket and (now - bucket[0]) > settings.RATE_LIMIT_WINDOW_SECONDS:
            bucket.popleft()

        if len(bucket) >= settings.RATE_LIMIT_REQUESTS:
            retry_after = max(1, int(settings.RATE_LIMIT_WINDOW_SECONDS - (now - bucket[0])))
            return JSONResponse(
                status_code=429,
                content={"detail": "Too Many Requests"},
                headers={"Retry-After": str(retry_after)},
            )

        bucket.append(now)
    return None


def _poda_buckets(now: float) -> None:
    """Remove janelas vencidas. Chamar com _RATE_LIMIT_LOCK tomado."""
    limite = now - settings.RATE_LIMIT_WINDOW_SECONDS
    for key in [k for k, d in _RATE_LIMIT_BUCKETS.items() if not d or d[-1] < limite]:
        _RATE_LIMIT_BUCKETS.pop(key, None)


def ensure_validated_execution(path: str) -> None:
    if not path.startswith("/dashboard/"):
        return
    if not settings.ENABLE_VALIDATED_ROUTES:
        raise HTTPException(
            status_code=503,
            detail="API execution gate is locked. Set ENABLE_VALIDATED_ROUTES=true after full validation.",
        )


# Run-id vem de header do cliente; valida o formato antes de logar/refletir para
# evitar injeção no log ndjson e no header X-Run-Id da resposta (F-07).
_RUN_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def extract_run_id(request: Request) -> str:
    provided = (
        request.headers.get("x-run-id")
        or request.headers.get("x-debug-run-id")
        or request.headers.get("x-request-id")
        or ""
    ).strip()
    if provided and _RUN_ID_RE.match(provided):
        return provided
    return f"srv-{uuid4().hex[:12]}"


def normalize_api_path(path: str) -> str:
    if path == "/api":
        return "/"
    if path.startswith("/api/"):
        return path[4:] or "/"
    return path
