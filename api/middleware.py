import time

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from api.dependencias import (
    ensure_validated_execution,
    extract_run_id,
    normalize_api_path,
    rate_limit_dashboard,
    require_auth,
)
from core.telemetry.agent_logger import _agent_ndjson, _capture_exception


async def api_prefix_middleware(request: Request, call_next):
    # Permite usar /api em produção e dev sem alterar os endpoints internos.
    request.scope["path"] = normalize_api_path(request.scope.get("path", ""))
    return await call_next(request)


async def security_middleware(request: Request, call_next):
    open_paths = {"/"}  # /docs, /openapi.json, /redoc desligados em prod (ver main.py)
    raw_path = request.scope.get("path", request.url.path)
    path = normalize_api_path(raw_path)
    in_open = path in open_paths
    requires_auth = (
        path.startswith("/dashboard/")
        or path.startswith("/efetividade/")
        or path.startswith("/regressao/")
        or path.startswith("/health/")
        or path.startswith("/admin/")
        or path.startswith("/agente/")
    )
    run_id = extract_run_id(request)
    request.state.run_id = run_id
    request.state.req_started_at = time.perf_counter()
    # region agent log
    _agent_ndjson(
        "OBS",
        "middleware.py:security_middleware:request_entry",
        "request_entry",
        {
            "path": path,
            "path_repr": repr(path),
            "raw_path": raw_path,
            "in_open_paths": in_open,
            "requires_auth": requires_auth,
            "method": request.method,
            "has_api_key": bool(request.headers.get("x-api-key", "")),
            "has_authorization": bool(request.headers.get("authorization", "")),
        },
        run_id=run_id,
    )
    # endregion
    if requires_auth:
        try:
            require_auth(request)
            ensure_validated_execution(path)
        except HTTPException as exc:
            # region agent log
            _agent_ndjson(
                "OBS",
                "middleware.py:security_middleware:auth_result",
                "auth_reject",
                {"path": path, "status": exc.status_code, "entrada_ok": False},
                run_id=run_id,
            )
            # endregion
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

        limited = rate_limit_dashboard(request, path)
        if limited is not None:
            # region agent log
            _agent_ndjson(
                "OBS",
                "middleware.py:security_middleware:rate_limit_result",
                "rate_limited",
                {"path": path, "status": 429, "entrada_ok": False},
                run_id=run_id,
            )
            # endregion
            return limited
        # region agent log
        _agent_ndjson(
            "OBS",
            "middleware.py:security_middleware:auth_result",
            "auth_accept",
            {"path": path, "entrada_ok": True},
            run_id=run_id,
        )
        # endregion
    else:
        # region agent log
        _agent_ndjson(
            "OBS",
            "middleware.py:security_middleware:open_path",
            "bypass_auth",
            {"path": path, "requires_auth": requires_auth},
            run_id=run_id,
        )
        # endregion
    try:
        response = await call_next(request)
    except Exception as exc:
        _capture_exception(exc, run_id=run_id)
        raise
    total_elapsed_ms = round((time.perf_counter() - request.state.req_started_at) * 1000, 2)
    # region agent log
    _agent_ndjson(
        "OBS",
        "middleware.py:security_middleware:exit",
        "response",
        {
            "path": path,
            "status_code": getattr(response, "status_code", None),
            "endpoint_total_elapsed_ms": total_elapsed_ms,
        },
        run_id=run_id,
    )
    # endregion
    response.headers["X-Run-Id"] = run_id
    return response
