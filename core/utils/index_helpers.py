import time
from typing import Any, Dict, List, Set

import pyodbc
from fastapi import HTTPException

import config.settings as settings
from core.database.pool_manager import pool_manager
from core.utils.sql_helpers import quote_ident


def build_create_index_sql(idx: Dict[str, Any], *, online: bool) -> str:
    """
    Monta o CREATE NONCLUSTERED INDEX ... com as opcoes padrao.

    A flag online=True adiciona ONLINE = ON (requer SQL Server Enterprise);
    em Standard/Express deve ficar False para nao quebrar o comando.
    """
    schema = quote_ident(idx["schema"])
    table = quote_ident(idx["table"])
    index_name = quote_ident(idx["name"])
    key_cols = ", ".join(quote_ident(col) for col in idx["key_columns"])
    include_cols = ", ".join(quote_ident(col) for col in idx.get("include_columns", []))

    options = [
        f"FILLFACTOR = {settings.INDEX_DEFAULT_OPTIONS['FILLFACTOR']}",
        f"DATA_COMPRESSION = {settings.INDEX_DEFAULT_OPTIONS['DATA_COMPRESSION']}",
        f"ONLINE = {'ON' if online else 'OFF'}",
    ]
    options_sql = ", ".join(options)

    include_clause = f"\n    INCLUDE ({include_cols})" if include_cols else ""
    return (
        f"CREATE NONCLUSTERED INDEX {index_name}\n"
        f"    ON {schema}.{table} ({key_cols}){include_clause}\n"
        f"    WITH ({options_sql})"
    )


def build_update_statistics_sql(idx: Dict[str, Any]) -> str:
    schema = quote_ident(idx["schema"])
    table = quote_ident(idx["table"])
    return f"UPDATE STATISTICS {schema}.{table} WITH FULLSCAN"


def index_exists(
    cursor: pyodbc.Cursor,
    schema: str,
    table: str,
    index_name: str,
) -> bool:
    """Consulta sys.indexes para decidir se o indice ja esta criado."""
    cursor.execute(
        """
        SELECT 1
        FROM sys.indexes i
        JOIN sys.objects o ON i.object_id = o.object_id
        JOIN sys.schemas s ON o.schema_id = s.schema_id
        WHERE s.name = ? AND o.name = ? AND i.name = ?
        """,
        (schema, table, index_name),
    )
    return cursor.fetchone() is not None


def list_index_status(database_name: str) -> List[Dict[str, Any]]:
    """Retorna, para cada indice recomendado, se ele ja existe no banco."""
    results: List[Dict[str, Any]] = []
    with pool_manager.get_connection(database_name) as conn:
        cursor = conn.cursor()
        for idx in settings.RECOMMENDED_INDEXES:
            exists = index_exists(cursor, idx["schema"], idx["table"], idx["name"])
            results.append({
                "name": idx["name"],
                "table": f"{idx['schema']}.{idx['table']}",
                "key_columns": list(idx["key_columns"]),
                "include_columns": list(idx.get("include_columns", [])),
                "purpose": idx.get("purpose", ""),
                "exists": bool(exists),
            })
        cursor.close()
    return results


def apply_indexes_on_database(
    database_name: str,
    *,
    online: bool,
    dry_run: bool,
    update_statistics: bool,
) -> Dict[str, Any]:
    """
    Cria apenas os indices que ainda nao existem em ``database_name``.

    - ``dry_run=True`` (padrao) nao executa nada; apenas retorna o SQL gerado.
    - ``online=True`` tenta ONLINE = ON (so funciona em Enterprise).
    - ``update_statistics=True`` roda UPDATE STATISTICS ... WITH FULLSCAN
      para cada tabela cujo indice foi efetivamente criado (ignorado em dry_run).
    """
    started_at = time.perf_counter()
    steps: List[Dict[str, Any]] = []
    tables_to_refresh: Set[str] = set()
    connection_ctx = None

    if not dry_run:
        connection_ctx = pool_manager.get_connection(database_name)
        conn = connection_ctx.__enter__()
        cursor = conn.cursor()
    else:
        conn = None
        cursor = None

    try:
        if dry_run:
            status_map = {row["name"]: row["exists"] for row in list_index_status(database_name)}
        else:
            status_map = {}
            for idx in settings.RECOMMENDED_INDEXES:
                status_map[idx["name"]] = index_exists(
                    cursor, idx["schema"], idx["table"], idx["name"]
                )

        for idx in settings.RECOMMENDED_INDEXES:
            already_exists = status_map.get(idx["name"], False)
            create_sql = build_create_index_sql(idx, online=online)
            entry: Dict[str, Any] = {
                "name": idx["name"],
                "table": f"{idx['schema']}.{idx['table']}",
                "sql": create_sql,
                "action": "skipped_existing" if already_exists else (
                    "would_create" if dry_run else "created"
                ),
                "error": None,
            }

            if not already_exists and not dry_run:
                try:
                    cursor.execute(create_sql)
                    conn.commit()
                    tables_to_refresh.add(f"{idx['schema']}.{idx['table']}")
                except pyodbc.Error as exc:
                    entry["action"] = "failed"
                    entry["error"] = str(exc)

            steps.append(entry)

        statistics_steps: List[Dict[str, Any]] = []
        if update_statistics:
            targets: Set[str] = set()
            if dry_run:
                targets = {f"{idx['schema']}.{idx['table']}" for idx in settings.RECOMMENDED_INDEXES}
            else:
                targets = tables_to_refresh
            for target in sorted(targets):
                schema, table = target.split(".", 1)
                idx_shell = {"schema": schema, "table": table}
                stats_sql = build_update_statistics_sql(idx_shell)
                stats_entry: Dict[str, Any] = {
                    "target": target,
                    "sql": stats_sql,
                    "action": "would_update" if dry_run else "updated",
                    "error": None,
                }
                if not dry_run:
                    try:
                        cursor.execute(stats_sql)
                        conn.commit()
                    except pyodbc.Error as exc:
                        stats_entry["action"] = "failed"
                        stats_entry["error"] = str(exc)
                statistics_steps.append(stats_entry)
    finally:
        if cursor is not None:
            cursor.close()
        if connection_ctx is not None:
            connection_ctx.__exit__(None, None, None)

    return {
        "database": database_name,
        "dry_run": dry_run,
        "online": online,
        "update_statistics": update_statistics,
        "elapsed_ms": round((time.perf_counter() - started_at) * 1000, 2),
        "indexes": steps,
        "statistics": statistics_steps if update_statistics else [],
    }
