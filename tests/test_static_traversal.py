"""Containment do fallback do SPA (api/static.py).

Regressão: spa_fallback fazia os.path.join(dist, full_path) sem checar containment,
servindo qualquer arquivo do disco sem autenticação (a rota não casa com nenhum
prefixo protegido em api/middleware.py).

Dois vetores independentes:
  - '..' sobrevive: o uvicorn faz unquote do path e NÃO normaliza
    (uvicorn/protocols/http/httptools_impl.py:255-262).
  - caminho absoluto: no Windows ntpath.join descarta a base quando o segundo
    componente tem drive — os.path.join(r'C:\\a\\dist', 'C:/x/.env') == 'C:/x/.env'.

O TestClient/httpx normaliza '..' na URL antes de enviar, então o teste fala ASGI
direto com o scope["path"] que o uvicorn produziria. O parametro `vulneravel`
injeta a implementação antiga: sem ele um teste verde não provaria nada.
"""
import asyncio
import os

import pytest
from fastapi import FastAPI

import api.static as static_mod
import config.settings as settings

pytestmark = pytest.mark.skipif(
    not os.path.isfile(os.path.join(settings.FRONTEND_DIST_DIR, "index.html")),
    reason="requer agecob-lens/dist buildado",
)

ESCAPES = [
    "/../../.env",                                    # traversal literal
    "/%2e%2e/%2e%2e/.env",                            # percent-encoded (pós-unquote do uvicorn)
    "/..%2f..%2f.env",                                # barra encodada
    "/" + os.path.join(settings.BASE_DIR, ".env").replace(os.sep, "/"),  # absoluto com drive
]


def _app():
    app = FastAPI()
    static_mod.setup_static_routes(app)
    return app


def _asgi_get(app, path: str):
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("utf-8", "surrogateescape"),
        "query_string": b"",
        "root_path": "",
        "headers": [(b"host", b"127.0.0.1:8000")],
        "client": ("127.0.0.1", 54321),
        "server": ("127.0.0.1", 8000),
    }
    messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    asyncio.run(app(scope, receive, send))

    status = next(m["status"] for m in messages if m["type"] == "http.response.start")
    body = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return status, body


def _index_head(n=4096):
    with open(os.path.join(settings.FRONTEND_DIST_DIR, "index.html"), "rb") as f:
        return f.read(n)


def _unquoted(path: str) -> str:
    """Espelha o que o uvicorn coloca em scope['path']."""
    import urllib.parse

    return urllib.parse.unquote(path) if "%" in path else path


@pytest.mark.parametrize("alvo", ESCAPES)
def test_escape_cai_no_index(alvo):
    status, body = _asgi_get(_app(), _unquoted(alvo))

    assert status == 200
    assert _index_head().startswith(body[: len(_index_head())]), (
        f"{alvo} serviu um arquivo fora de dist ({len(body)} bytes)"
    )


@pytest.mark.parametrize("alvo", ESCAPES)
def test_controle_negativo_implementacao_antiga_vaza(alvo, monkeypatch):
    """Sem esta prova, os testes acima passariam mesmo com o bug de volta."""
    monkeypatch.setattr(
        static_mod,
        "_resolve_inside_dist",
        lambda fp: os.path.join(settings.FRONTEND_DIST_DIR, fp) if fp else None,
    )

    status, body = _asgi_get(_app(), _unquoted(alvo))

    assert status == 200
    assert not _index_head().startswith(body[: len(_index_head())]), (
        f"{alvo} deveria vazar com a implementação antiga — controle negativo inútil"
    )


def test_asset_legitimo_continua_servido():
    status, body = _asgi_get(_app(), "/index.html")

    assert status == 200
    assert _index_head().startswith(body[: len(_index_head())])
