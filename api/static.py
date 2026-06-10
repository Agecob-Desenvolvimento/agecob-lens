import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import config.settings as settings


def setup_static_routes(app: FastAPI) -> None:
    if os.path.isdir(settings.FRONTEND_ASSETS_DIR):
        app.mount("/assets", StaticFiles(directory=settings.FRONTEND_ASSETS_DIR), name="assets")

    @app.get("/")
    def healthcheck():
        index_path = os.path.join(settings.FRONTEND_DIST_DIR, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {"status": "ok", "docs": "/docs"}

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        index_path = os.path.join(settings.FRONTEND_DIST_DIR, "index.html")
        if not os.path.exists(index_path):
            raise HTTPException(status_code=404, detail="Not Found")
        if full_path.startswith(("dashboard/", "health/", "admin/", "efetividade/", "agente/", "docs", "redoc", "openapi.json", "api/")):
            raise HTTPException(status_code=404, detail="Not Found")
        static_file = os.path.join(settings.FRONTEND_DIST_DIR, full_path)
        if full_path and os.path.isfile(static_file):
            return FileResponse(static_file)
        return FileResponse(index_path)
