import os
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import config.settings as settings


def _resolve_inside_dist(full_path: str) -> Optional[str]:
    """Resolve full_path dentro de FRONTEND_DIST_DIR, ou None se escapar.

    O uvicorn faz unquote do path sem normalizar (httptools_impl.py:255-262), então
    '..' chega inteiro aqui; e no Windows ntpath.join descarta a base quando o
    segundo componente tem drive ('C:/x/.env'). Sem esta checagem o fallback serve
    qualquer arquivo do disco sem autenticação.
    """
    if not full_path or os.path.isabs(full_path):
        return None
    root = os.path.realpath(settings.FRONTEND_DIST_DIR)
    target = os.path.realpath(os.path.join(root, full_path))
    try:
        if os.path.commonpath([root, target]) != root:
            return None
    except ValueError:  # drives diferentes no Windows
        return None
    return target


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
        static_file = _resolve_inside_dist(full_path)
        if static_file and os.path.isfile(static_file):
            return FileResponse(static_file)
        return FileResponse(index_path)
