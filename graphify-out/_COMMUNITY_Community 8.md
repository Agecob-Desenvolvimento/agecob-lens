---
type: community
cohesion: 0.10
members: 31
---

# Community 8

**Cohesion:** 0.10 - loosely connected
**Members:** 31 nodes

## Members
- [[.__init__()]] - code - core/cache/cache_manager.py
- [[.get()]] - code - core/cache/cache_manager.py
- [[.get_or_compute()]] - code - core/cache/cache_manager.py
- [[.set()]] - code - core/cache/cache_manager.py
- [[CacheManager]] - code - core/cache/cache_manager.py
- [[Consulta sys.indexes para decidir se o indice ja esta criado.]] - rationale - core/utils/index_helpers.py
- [[Cria apenas os indices que ainda nao existem em ``database_name``.      - ``dr]] - rationale - core/utils/index_helpers.py
- [[Escapes a SQL identifier (schematablecolumn) with brackets.]] - rationale - core/utils/sql_helpers.py
- [[Monta o CREATE NONCLUSTERED INDEX ... com as opcoes padrao.      A flag online]] - rationale - core/utils/index_helpers.py
- [[Retorna, para cada indice recomendado, se ele ja existe no banco.]] - rationale - core/utils/index_helpers.py
- [[_ensure_index_admin_allowed()]] - code - api/routers/admin.py
- [[admin.py]] - code - api/routers/admin.py
- [[admin_indexes_apply()]] - code - api/routers/admin.py
- [[admin_indexes_status()]] - code - api/routers/admin.py
- [[api_prefix_middleware()_1]] - code - api/middleware.py
- [[apply_indexes_on_database()]] - code - core/utils/index_helpers.py
- [[build_create_index_sql()]] - code - core/utils/index_helpers.py
- [[build_update_statistics_sql()]] - code - core/utils/index_helpers.py
- [[cache_manager.py]] - code - core/cache/cache_manager.py
- [[dependencias.py]] - code - api/dependencias.py
- [[ensure_validated_execution()]] - code - api/dependencias.py
- [[extract_run_id()]] - code - api/dependencias.py
- [[index_exists()]] - code - core/utils/index_helpers.py
- [[index_helpers.py]] - code - core/utils/index_helpers.py
- [[list_index_status()]] - code - core/utils/index_helpers.py
- [[middleware.py]] - code - api/middleware.py
- [[normalize_api_path()]] - code - api/dependencias.py
- [[quote_ident()]] - code - core/utils/sql_helpers.py
- [[rate_limit_dashboard()]] - code - api/dependencias.py
- [[require_auth()]] - code - api/dependencias.py
- [[security_middleware()_1]] - code - api/middleware.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Community_8
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_Community 6]]

## Top bridge nodes
- [[quote_ident()]] - degree 4, connects to 1 community