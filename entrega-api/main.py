import logging
import logging.handlers
import os

import config.settings as settings
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.middleware import api_prefix_middleware, security_middleware
from core.utils.response_envelope import build_response_envelope
from api.routers import dashboard, efetividade, admin, health, ritmo_dia, regressao
from api.static import setup_static_routes
from core.telemetry.agent_logger import _init_sentry, _start_agent_log_cleanup_worker, _agent_ndjson
from dominios.efetividade.etl import efetividade_etl

def _init_logging() -> None:
    """Logging da stdlib em arquivo rotativo.

    Sem isto, com SENTRY_DSN vazio e ENABLE_AGENT_TELEMETRY=false (defaults), não
    sobra nenhum registro quando algo quebra em produção.
    """
    if logging.getLogger().handlers:
        return
    os.makedirs(settings.LOG_DIR, exist_ok=True)
    handler = logging.handlers.RotatingFileHandler(
        os.path.join(settings.LOG_DIR, "api.log"),
        maxBytes=10 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logging.basicConfig(level=logging.INFO, handlers=[handler])


_init_logging()
_init_sentry()
logger = logging.getLogger("agecob.api")

# Swagger/OpenAPI desligados em produção (REQUIRE_API_AUTH=true) para não expor o
# schema da API na LAN. Em dev seguem disponíveis.
_DOCS_ENABLED = not settings.REQUIRE_API_AUTH
app = FastAPI(
    title="Dashboard API",
    description="API local para expor dados de dashboard a partir do SQL Server.",
    version="1.1.0",
    docs_url="/docs" if _DOCS_ENABLED else None,
    redoc_url="/redoc" if _DOCS_ENABLED else None,
    openapi_url="/openapi.json" if _DOCS_ENABLED else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings._CORS_ORIGINS,
    allow_credentials=settings._CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(api_prefix_middleware)
app.middleware("http")(security_middleware)

app.include_router(dashboard.router)
app.include_router(efetividade.router)
app.include_router(admin.router)
app.include_router(health.router)
app.include_router(ritmo_dia.router)
app.include_router(regressao.router)

@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Erro não tratado virava PlainTextResponse('Internal Server Error') do Starlette.

    Como security_middleware re-levanta, a linha que grava X-Run-Id nunca rodava — o
    erro da tela ficava sem correlação com o log. `detail` é mantido porque o
    frontend lê body.detail (agecob-lens/src/services/api.ts:202); o envelope é
    aditivo. A mensagem real fica só no servidor.
    """
    run_id = getattr(request.state, "run_id", None)
    logger.exception("Erro não tratado em %s (run_id=%s)", request.url.path, run_id)
    envelope = build_response_envelope(
        [], sources=[],
        errors=[{"message": "Erro interno ao processar a requisição."}],
        run_id=run_id,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Erro interno ao processar a requisição.", **envelope},
        headers={"X-Run-Id": run_id} if run_id else None,
    )


setup_static_routes(app)


@app.on_event("startup")
async def _agent_debug_startup() -> None:
    _start_agent_log_cleanup_worker()
    efetividade_etl.start_background()
    _agent_ndjson(
        "H1",
        "main.py:startup",
        "worker_started",
        {
            "log_cleanup_interval_seconds": settings.LOG_CLEANUP_INTERVAL_SECONDS,
            "require_api_auth": settings.REQUIRE_API_AUTH,
            "agent_telemetry_enabled": settings.ENABLE_AGENT_TELEMETRY,
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
