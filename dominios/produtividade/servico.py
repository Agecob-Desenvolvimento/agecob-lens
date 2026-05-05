import concurrent.futures
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi.encoders import jsonable_encoder

import config.settings as settings
from core.database.query_executor import run_query
from dominios.produtividade.queries import (
    build_produtividade_agentes_query,
    normalize_agent_key,
)


class ProdutividadeServico:
    def __init__(self) -> None:
        self._cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
        self._ttl: int = settings._PRODUTIVIDADE_AGENTES_TTL_SECONDS

    def fetch_consolidado(self, force_refresh: bool = False) -> dict:
        cache_key = "produtividade_agentes_consolidado"
        now = time.time()
        cached = self._cache.get(cache_key)
        if not force_refresh and cached:
            cached_at, cached_payload = cached
            cache_age = now - cached_at
            if cache_age < self._ttl:
                payload = jsonable_encoder(cached_payload)
                payload["cache_age_seconds"] = max(1, int(cache_age))
                return payload

        query = build_produtividade_agentes_query()
        rows_by_db: Dict[str, List[Dict[str, Any]]] = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(settings.ALLOWED_DATABASES)) as executor:
            futures = {
                executor.submit(
                    run_query,
                    query,
                    db,
                    None,
                    None,
                    "dashboard/produtividade-agentes",
                ): db
                for db in settings.ALLOWED_DATABASES
            }
            for future in concurrent.futures.as_completed(futures):
                db = futures[future]
                rows_by_db[db] = future.result()

        consolidated: Dict[str, Dict[str, Any]] = {}
        for db in settings.ALLOWED_DATABASES:
            short_db = db.replace("COBwebRCB", "")
            for row in rows_by_db.get(db, []):
                login = str(row.get("LOGIN_AGENTE") or "").strip()
                name = str(row.get("NOME_AGENTE") or "").strip()
                key = normalize_agent_key(login, name)
                if not key:
                    continue

                if key not in consolidated:
                    consolidated[key] = {
                        "agent_key": key.lower(),
                        "login": login,
                        "name": name,
                        "by_database": {},
                        "total": {"acionamentos": 0, "contatos": 0},
                    }

                acionamentos = int(row.get("QTD_ACIONAMENTOS") or 0)
                contatos = int(row.get("QTD_CONTATOS") or 0)
                consolidated[key]["by_database"][short_db] = {
                    "acionamentos": acionamentos,
                    "contatos": contatos,
                }
                consolidated[key]["total"]["acionamentos"] += acionamentos
                consolidated[key]["total"]["contatos"] += contatos

        agents = sorted(
            consolidated.values(),
            key=lambda item: item["total"]["acionamentos"],
            reverse=True,
        )
        payload = {
            "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "cache_age_seconds": 0,
            "agents": agents,
        }
        self._cache[cache_key] = (time.time(), payload)
        return jsonable_encoder(payload)


produtividade_servico = ProdutividadeServico()
