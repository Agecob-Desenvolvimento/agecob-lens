"""Export ad-hoc: 1 linha por acordo (PARCELA=0) com valor 1ª parcela e valor
total do acordo. Filtro: maio/2026, status gerados (1,2,3,10,12), ambos bancos,
agentes excluídos no SQL. Saída CSV para análise em relatório.
"""

import csv
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config.settings as settings
from core.database.query_executor import run_query

DATE_FROM = "20260501"
DATE_TO_EXCL = "20260601"

COLUMNS = [
    "banco_origem", "NR_RECEBIMENTO", "ID_CARTEIRA", "portfolio", "agente",
    "matricula", "cpf", "nome_devedor", "valor_primeira_parcela",
    "valor_total_acordo", "total_parcelas", "data_emissao", "data_vencimento",
    "ID_REC_STATUS",
]

# Colunas monetárias formatadas para Excel pt-BR (decimal vírgula → número manipulável)
MONEY_COLS = ("valor_primeira_parcela", "valor_total_acordo")


def brl(v) -> str:
    return f"{float(v or 0):.2f}".replace(".", ",")


def build_sql(db: str) -> str:
    return f"""
SELECT
    R.NR_RECEBIMENTO,
    R.ID_CARTEIRA,
    DA.portfolio_name AS portfolio,
    U.NOME AS agente,
    U.MATRICULA AS matricula,
    D.CPF_CNPJ AS cpf,
    D.NOME_RAZAO AS nome_devedor,
    R.VALOR AS valor_primeira_parcela,
    COALESCE((
        SELECT SUM(R2.VALOR) FROM {db}.dbo.REC_MASTER R2 (NOLOCK)
        WHERE R2.NR_RECEBIMENTO = R.NR_RECEBIMENTO AND R2.ID_CARTEIRA = R.ID_CARTEIRA
    ), R.VALOR) AS valor_total_acordo,
    (
        SELECT COUNT(1) FROM {db}.dbo.REC_MASTER R3 (NOLOCK)
        WHERE R3.NR_RECEBIMENTO = R.NR_RECEBIMENTO AND R3.ID_CARTEIRA = R.ID_CARTEIRA
    ) AS total_parcelas,
    CONVERT(varchar(10), R.DT_EMISSAO, 120) AS data_emissao,
    CONVERT(varchar(10), R.DT_VENCIMENTO, 120) AS data_vencimento,
    R.ID_REC_STATUS
FROM {db}.dbo.REC_MASTER R (NOLOCK)
INNER JOIN {db}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
LEFT JOIN {db}.dbo.DEV_MASTER D (NOLOCK) ON R.ID_DEV = D.ID_DEV
OUTER APPLY (
    SELECT TOP 1 DA2.{settings.PORTFOLIO_COLUMN} AS portfolio_name
    FROM {db}.dbo.REC_DIVIDAS RD2 (NOLOCK)
    JOIN {db}.dbo.DIV_AUX DA2 (NOLOCK) ON RD2.ID_DIVIDA = DA2.ID_DIVIDA
    WHERE RD2.NR_RECEBIMENTO = R.NR_RECEBIMENTO
      AND RD2.ID_CARTEIRA = R.ID_CARTEIRA
      AND DA2.{settings.PORTFOLIO_COLUMN} IS NOT NULL
) DA
WHERE R.DT_EMISSAO >= '{DATE_FROM}' AND R.DT_EMISSAO < '{DATE_TO_EXCL}'
  AND R.PARCELA = {settings.PRIMEIRA_PARCELA}
  AND R.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}
  {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
ORDER BY valor_primeira_parcela DESC
"""


def main() -> None:
    all_rows = []
    for db in settings.ALLOWED_DATABASES:
        rows = run_query(build_sql(db), db, context=f"export-pp-acordos/{db}")
        for r in rows:
            r["banco_origem"] = db
        all_rows.extend(rows)
        print(f"{db}: {len(rows)} acordos")

    total_pp = sum(float(r.get("valor_primeira_parcela") or 0) for r in all_rows)
    total_ac = sum(float(r.get("valor_total_acordo") or 0) for r in all_rows)

    # Formata valores para decimal vírgula (após somar os brutos)
    for r in all_rows:
        for col in MONEY_COLS:
            r[col] = brl(r.get(col))

    out_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "relatorio_primeira_parcela_acordos_maio2026.csv",
    )
    # delimitador ';' → Excel pt-BR separa em colunas e lê os valores como número
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore", delimiter=";")
        w.writeheader()
        for r in all_rows:
            w.writerow(r)

    print(f"TOTAL: {len(all_rows)} acordos | 1a parcela R$ {total_pp:,.2f} | valor acordos R$ {total_ac:,.2f}")
    print(f"CSV: {out_path}")


if __name__ == "__main__":
    main()
