import config.settings as settings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.middleware import api_prefix_middleware, security_middleware
from api.routers import dashboard, efetividade, admin, health, ritmo_dia, regressao, agente
from api.static import setup_static_routes
from core.telemetry.agent_logger import _init_sentry, _start_agent_log_cleanup_worker, _agent_ndjson
from dominios.efetividade.etl import efetividade_etl

_init_sentry()

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
app.include_router(agente.router)

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
