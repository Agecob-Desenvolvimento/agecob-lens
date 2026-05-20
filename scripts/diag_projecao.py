"""
Projeção: qtd_acionamentos com filtros atuais vs filtros + D (ligação/atendimento).
"""
from __future__ import annotations

import argparse
import sys
from datetime import date as date_cls
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.database.query_executor import run_query
import config.settings as settings

DBS = ["COBwebRCBCONSUMER", "COBwebRCBAUTOS"]


def sql_projecao(d_from: str, d_to: str) -> str:
    filtro = settings.FILTRO_AGENTES_EXCLUIDOS_SQL
    return f"""
SELECT
    COUNT(*) AS atual_sem_filtro,
    SUM(CASE WHEN 1=1
        {filtro}
        THEN 1 ELSE 0 END) AS com_filtro_agentes,
    SUM(CASE WHEN 1=1
        {filtro}
        AND (CM.ID_LIGACAO IS NOT NULL OR CM.TEMPO_ATENDIMENTO > 0)
        THEN 1 ELSE 0 END) AS com_filtro_agentes_E_D,
    SUM(CASE WHEN CM.ID_LIGACAO IS NOT NULL THEN 1 ELSE 0 END) AS com_id_ligacao,
    SUM(CASE WHEN CM.TEMPO_ATENDIMENTO > 0 THEN 1 ELSE 0 END) AS com_tempo_atend
FROM CTO_MASTER CM (NOLOCK)
JOIN USU_MASTER U (NOLOCK) ON CM.ID_USUARIO = U.ID_USUARIO
WHERE CAST(CM.DATA AS DATE) >= '{d_from}' AND CAST(CM.DATA AS DATE) <= '{d_to}'
"""


def sql_top_usuarios_filtrados(d_from: str, d_to: str) -> str:
    filtro = settings.FILTRO_AGENTES_EXCLUIDOS_SQL
    return f"""
SELECT TOP 25
    U.CHAVE,
    U.NOME,
    COUNT(*) AS atual,
    SUM(CASE WHEN (CM.ID_LIGACAO IS NOT NULL OR CM.TEMPO_ATENDIMENTO > 0) THEN 1 ELSE 0 END) AS com_D
FROM CTO_MASTER CM (NOLOCK)
JOIN USU_MASTER U (NOLOCK) ON CM.ID_USUARIO = U.ID_USUARIO
WHERE CAST(CM.DATA AS DATE) >= '{d_from}' AND CAST(CM.DATA AS DATE) <= '{d_to}'
    {filtro}
GROUP BY U.CHAVE, U.NOME
ORDER BY atual DESC
"""


def print_rows(rows):
    if not rows:
        print("(sem linhas)")
        return
    keys = list(rows[0].keys())
    widths = {k: max(len(k), max(len(str(r[k])) for r in rows)) for k in keys}
    print("  ".join(k.ljust(widths[k]) for k in keys))
    print("  ".join("-" * widths[k] for k in keys))
    for r in rows:
        print("  ".join(str(r[k]).ljust(widths[k]) for k in keys))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--de", default=date_cls.today().isoformat())
    parser.add_argument("--ate", default=None)
    args = parser.parse_args()

    d_from = args.de
    d_to = args.ate or args.de
    for db in DBS:
        print(f"\n{'='*72}\nDB={db}  periodo={d_from} -> {d_to}\n{'='*72}")
        print("\n[Projeção totais]")
        print_rows(run_query(sql_projecao(d_from, d_to), db, context="proj"))
        print("\n[Top 25 usuários — atual vs com filtro D]")
        print_rows(run_query(sql_top_usuarios_filtrados(d_from, d_to), db, context="proj_users"))


if __name__ == "__main__":
    main()
