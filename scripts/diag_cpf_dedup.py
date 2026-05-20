"""Projeta qtd_acionamentos com dedup (agente, dia, ID_DEV) vs atual."""
from __future__ import annotations
import argparse, sys
from datetime import date as date_cls
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core.database.query_executor import run_query
import config.settings as settings

DBS = ["COBwebRCBCONSUMER", "COBwebRCBAUTOS"]


def sql(d_from: str, d_to: str) -> str:
    return f"""
WITH base AS (
    SELECT
        CM.ID_USUARIO,
        CAST(CM.DATA AS DATE) AS dia,
        CM.ID_DEV
    FROM CTO_MASTER CM (NOLOCK)
    JOIN USU_MASTER U (NOLOCK) ON CM.ID_USUARIO = U.ID_USUARIO
    WHERE CAST(CM.DATA AS DATE) >= '{d_from}'
      AND CAST(CM.DATA AS DATE) <= '{d_to}'
      {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
)
SELECT
    COUNT(*) AS atual_qtd_acionamentos,
    COUNT(DISTINCT CONCAT(ID_USUARIO, '|', CONVERT(VARCHAR(10), dia, 120), '|', ID_DEV)) AS dedup_agente_dia_dev
FROM base
"""


def sql_top(d_from: str, d_to: str) -> str:
    return f"""
WITH base AS (
    SELECT
        U.CHAVE,
        U.NOME,
        CAST(CM.DATA AS DATE) AS dia,
        CM.ID_DEV
    FROM CTO_MASTER CM (NOLOCK)
    JOIN USU_MASTER U (NOLOCK) ON CM.ID_USUARIO = U.ID_USUARIO
    WHERE CAST(CM.DATA AS DATE) >= '{d_from}'
      AND CAST(CM.DATA AS DATE) <= '{d_to}'
      {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
)
SELECT TOP 15
    CHAVE, NOME,
    COUNT(*) AS atual,
    COUNT(DISTINCT CONCAT(CONVERT(VARCHAR(10), dia, 120), '|', ID_DEV)) AS dedup
FROM base
GROUP BY CHAVE, NOME
ORDER BY atual DESC
"""


def print_rows(rows):
    if not rows:
        print("(sem)")
        return
    keys = list(rows[0].keys())
    widths = {k: max(len(k), max(len(str(r[k])) for r in rows)) for k in keys}
    print("  ".join(k.ljust(widths[k]) for k in keys))
    print("  ".join("-" * widths[k] for k in keys))
    for r in rows:
        print("  ".join(str(r[k]).ljust(widths[k]) for k in keys))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--de", default=date_cls.today().isoformat())
    p.add_argument("--ate", default=None)
    args = p.parse_args()
    d_from, d_to = args.de, args.ate or args.de
    for db in DBS:
        print(f"\n{'='*72}\nDB={db}  {d_from} -> {d_to}\n{'='*72}")
        print_rows(run_query(sql(d_from, d_to), db, context="dedup"))
        print()
        print_rows(run_query(sql_top(d_from, d_to), db, context="dedup_top"))


if __name__ == "__main__":
    main()
