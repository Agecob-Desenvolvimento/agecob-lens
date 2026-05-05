from collections import deque
from datetime import datetime, timezone
from typing import Dict, Optional
from uuid import uuid4

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

import config.settings as settings


_RATE_LIMIT_BUCKETS: Dict[str, deque] = {}


def require_auth(request: Request) -> None:
    if not settings.REQUIRE_API_AUTH:
        return
    if not settings.API_KEY or not settings.API_TOKEN:
        raise HTTPException(status_code=500, detail="API auth está habilitada, mas API_KEY/API_TOKEN não foram configurados.")
    api_key = request.headers.get("x-api-key", "")
    auth_header = request.headers.get("authorization", "")
    expected_auth = f"Bearer {settings.API_TOKEN}"
    if api_key != settings.API_KEY or auth_header != expected_auth:
        raise HTTPException(status_code=401, detail="Unauthorized")


def rate_limit_dashboard(request: Request, path: str) -> Optional[JSONResponse]:
    if not path.startswith("/dashboard/"):
        return None

    client_ip = request.client.host if request.client else "unknown"
    api_key = request.headers.get("x-api-key", "missing")
    bucket_key = f"{client_ip}:{api_key}"
    now = datetime.now(timezone.utc).timestamp()
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


def ensure_validated_execution(path: str) -> None:
    if not path.startswith("/dashboard/"):
        return
    if not settings.ENABLE_VALIDATED_ROUTES:
        raise HTTPException(
            status_code=503,
            detail="API execution gate is locked. Set ENABLE_VALIDATED_ROUTES=true after full validation.",
        )


def extract_run_id(request: Request) -> str:
    provided = (
        request.headers.get("x-run-id")
        or request.headers.get("x-debug-run-id")
        or request.headers.get("x-request-id")
        or ""
    ).strip()
    return provided or f"srv-{uuid4().hex[:12]}"


def normalize_api_path(path: str) -> str:
    if path == "/api":
        return "/"
    if path.startswith("/api/"):
        return path[4:] or "/"
    return path
