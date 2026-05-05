from typing import Any, Dict, List, Optional, Tuple

import config.settings as settings


def normalize_pagination(limit: Optional[int], offset: Optional[int]) -> Tuple[int, int]:
    lim = settings.ACORDOS_HOJE_DEFAULT_LIMIT if limit is None else int(limit)
    off = 0 if offset is None else int(offset)
    if lim <= 0:
        lim = settings.ACORDOS_HOJE_DEFAULT_LIMIT
    if lim > settings.ACORDOS_HOJE_MAX_LIMIT:
        lim = settings.ACORDOS_HOJE_MAX_LIMIT
    if off < 0:
        off = 0
    return lim, off


def extract_total_rows(rows: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int]:
    if not rows:
        return rows, 0
    total = int(rows[0].get("_total_rows") or 0)
    cleaned = [{k: v for k, v in r.items() if k != "_total_rows"} for r in rows]
    return cleaned, total
