"""
Diagnóstico do cálculo de qtd_acionamentos.

Roda contra COBwebRCBCONSUMER + COBwebRCBAUTOS num intervalo de datas e expõe:
  1. Sanity: total vs distintos (ID_CTO_MASTER, devedores, ligações).
  2. Top 20 ID_COMPLEMENTO (onde a contagem se concentra).
  3. Distribuição por hora (agregada).
  4. Distribuição por dia.
  5. Top 20 usuários (count vs clientes únicos).

Uso:
    python scripts/diag_acionamentos.py                       # hoje
    python scripts/diag_acionamentos.py --de 2026-05-01 --ate 2026-05-11
"""
from __future__ import annotations

import argparse
import sys
from datetime import date as date_cls
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.database.query_executor import run_query


DBS = ["COBwebRCBCONSUMER", "COBwebRCBAUTOS"]


def sql_sanity(d_from: str, d_to: str) -> str:
    return f"""
SELECT
    COUNT(*)                          AS total_linhas,
    COUNT(DISTINCT ID_CTO_MASTER)     AS distintos_id_cto,
    COUNT(DISTINCT ID_DEVEDORES)      AS distintos_devedores,
    COUNT(DISTINCT ID_LIGACAO)        AS distintos_ligacoes,
    COUNT(DISTINCT ID_USUARIO)        AS distintos_usuarios,
    COUNT(DISTINCT ID_COMPLEMENTO)    AS distintos_complementos,
    SUM(CASE WHEN ID_LIGACAO IS NULL THEN 1 ELSE 0 END)        AS sem_ligacao,
    SUM(CASE WHEN ID_DISC_MASTER IS NOT NULL THEN 1 ELSE 0 END) AS com_discador,
    SUM(CASE WHEN TEMPO_ATENDIMENTO > 0 THEN 1 ELSE 0 END)      AS com_atendimento_pos
FROM CTO_MASTER (NOLOCK)
WHERE CAST(DATA AS DATE) >= '{d_from}' AND CAST(DATA AS DATE) <= '{d_to}'
"""


def sql_por_complemento(d_from: str, d_to: str) -> str:
    return f"""
SELECT TOP 20
    ID_COMPLEMENTO,
    COUNT(*) AS qtd
FROM CTO_MASTER (NOLOCK)
WHERE CAST(DATA AS DATE) >= '{d_from}' AND CAST(DATA AS DATE) <= '{d_to}'
GROUP BY ID_COMPLEMENTO
ORDER BY qtd DESC
"""


def sql_por_hora(d_from: str, d_to: str) -> str:
    return f"""
SELECT
    DATEPART(HOUR, DATA) AS hora,
    COUNT(*) AS qtd
FROM CTO_MASTER (NOLOCK)
WHERE CAST(DATA AS DATE) >= '{d_from}' AND CAST(DATA AS DATE) <= '{d_to}'
GROUP BY DATEPART(HOUR, DATA)
ORDER BY hora
"""


def sql_por_dia(d_from: str, d_to: str) -> str:
    return f"""
SELECT
    CAST(DATA AS DATE) AS dia,
    COUNT(*) AS qtd,
    COUNT(DISTINCT ID_DEVEDORES) AS devedores_unicos
FROM CTO_MASTER (NOLOCK)
WHERE CAST(DATA AS DATE) >= '{d_from}' AND CAST(DATA AS DATE) <= '{d_to}'
GROUP BY CAST(DATA AS DATE)
ORDER BY dia
"""


def sql_top_usuarios(d_from: str, d_to: str) -> str:
    return f"""
SELECT TOP 20
    U.CHAVE,
    U.NOME,
    COUNT(*) AS qtd_acionamentos,
    COUNT(DISTINCT CM.ID_DEVEDORES) AS clientes_unicos
FROM CTO_MASTER CM (NOLOCK)
JOIN USU_MASTER U (NOLOCK) ON CM.ID_USUARIO = U.ID_USUARIO
WHERE CAST(CM.DATA AS DATE) >= '{d_from}' AND CAST(CM.DATA AS DATE) <= '{d_to}'
GROUP BY U.CHAVE, U.NOME
ORDER BY qtd_acionamentos DESC
"""


def header(title: str) -> None:
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


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


def run_for_db(db: str, d_from: str, d_to: str) -> None:
    header(f"DB={db}  periodo={d_from} -> {d_to}")

    print("\n[1] Sanity (total vs distintos + flags discador/ligacao)")
    print_rows(run_query(sql_sanity(d_from, d_to), db, context="diag/sanity"))

    print("\n[2] Top 20 ID_COMPLEMENTO")
    print_rows(run_query(sql_por_complemento(d_from, d_to), db, context="diag/complemento"))

    print("\n[3] Distribuição por hora")
    print_rows(run_query(sql_por_hora(d_from, d_to), db, context="diag/hora"))

    print("\n[4] Distribuição por dia")
    print_rows(run_query(sql_por_dia(d_from, d_to), db, context="diag/dia"))

    print("\n[5] Top 20 usuários (qtd_acionamentos vs clientes_unicos)")
    print_rows(run_query(sql_top_usuarios(d_from, d_to), db, context="diag/usuarios"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--de", default=date_cls.today().isoformat(),
                        help="data inicial YYYY-MM-DD (default: hoje)")
    parser.add_argument("--ate", default=None,
                        help="data final YYYY-MM-DD (default: igual a --de)")
    parser.add_argument("--db", choices=DBS + ["todos"], default="todos")
    args = parser.parse_args()

    d_from = args.de
    d_to = args.ate or args.de
    dbs = DBS if args.db == "todos" else [args.db]
    for db in dbs:
        try:
            run_for_db(db, d_from, d_to)
        except Exception as exc:
            print(f"\n[ERRO em {db}] {exc}")


if __name__ == "__main__":
    main()
