from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def print_rows_preview(rows: List[Dict[str, Any]], database_name: str, max_rows: int = 5) -> None:
    """
    Imprime no terminal os nomes das colunas e no máximo N linhas.
    """
    print(f"\n=== PREVIEW QUERY [{database_name}] (max 5 linhas) ===")
    if not rows:
        print("Nenhum registro retornado para hoje.")
        print("=== FIM PREVIEW ===\n")
        return

    columns = list(rows[0].keys())
    print("Colunas:", ", ".join(columns))

    for index, row in enumerate(rows[:max_rows], start=1):
        print("---- Linha", index, "----")
        for col in columns:
            print(f"{col}: {row.get(col)}")

    print(f"Total retornado pela query: {len(rows)}")
    print("=== FIM PREVIEW ===\n")


def build_response_envelope(
    rows: List[Dict[str, Any]],
    sources: List[str],
    errors: Optional[List[Dict[str, str]]] = None,
    filters: Optional[Dict[str, Any]] = None,
    run_id: Optional[str] = None,
    quality: Optional[Dict[str, Any]] = None,
    pagination: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    meta: Dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_rows": len(rows),
        "sources": sources,
        "filters": filters or {"date": "today"},
        "run_id": run_id,
        "quality": quality or {},
    }
    if pagination is not None:
        meta["pagination"] = pagination
    return {
        "meta": meta,
        "data": rows,
        "errors": errors or [],
    }
