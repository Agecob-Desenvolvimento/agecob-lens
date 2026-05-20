"""
Diagnóstico de exceções faltantes no gráfico "Exceções por Portfólio".

Cenário: dashboard mostra N exceções no total mas o gráfico por portfólio
exibe menos. Suspeita: CROSS APPLY na query oficial filtra acordos cujo
portfólio (DIV_AUX.CAMPO010) é NULL.

Compara três contagens por banco:
  A. REC_MASTER puro          → universo real de exceções
  B. + JOIN REC_DIVIDAS       → acordos com pelo menos uma dívida
  C. + DIV_AUX.CAMPO010 NN    → o que o gráfico mostra (filtro atual)

Para cada exceção faltante (A - C), imprime: NR_RECEBIMENTO, CPF, NOME,
ID_CARTEIRA, valor, status do portfólio.

Uso:
    python scripts/diag_excecoes.py                       # hoje
    python scripts/diag_excecoes.py --de 2026-05-20 --ate 2026-05-21
"""
from __future__ import annotations

import argparse
import sys
from datetime import date as date_cls, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config.settings as settings
from core.database.query_executor import run_query


DBS = ["COBwebRCBCONSUMER", "COBwebRCBAUTOS"]


def sql_count_universe(db: str, d_from: str, d_to: str) -> str:
    return f"""
        SELECT COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd
        FROM {db}.dbo.REC_MASTER R (NOLOCK)
        JOIN {db}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
        WHERE R.DT_EMISSAO >= '{d_from}' AND R.DT_EMISSAO < '{d_to}'
          AND R.PARCELA = {settings.PRIMEIRA_PARCELA}
          AND R.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL}
          {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
    """


def sql_count_with_divida(db: str, d_from: str, d_to: str) -> str:
    return f"""
        SELECT COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd
        FROM {db}.dbo.REC_MASTER R (NOLOCK)
        JOIN {db}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
        WHERE R.DT_EMISSAO >= '{d_from}' AND R.DT_EMISSAO < '{d_to}'
          AND R.PARCELA = {settings.PRIMEIRA_PARCELA}
          AND R.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL}
          {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
          AND EXISTS (
            SELECT 1 FROM {db}.dbo.REC_DIVIDAS RD (NOLOCK)
            WHERE RD.NR_RECEBIMENTO = R.NR_RECEBIMENTO
              AND RD.ID_CARTEIRA = R.ID_CARTEIRA
          )
    """


def sql_count_chart(db: str, d_from: str, d_to: str) -> str:
    """Reproduz o filtro real do gráfico — CROSS APPLY exigindo CAMPO010 NN."""
    return f"""
        SELECT COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd
        FROM {db}.dbo.REC_MASTER R (NOLOCK)
        JOIN {db}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
        CROSS APPLY (
            SELECT TOP 1 DA2.{settings.PORTFOLIO_COLUMN}
            FROM {db}.dbo.REC_DIVIDAS RD (NOLOCK)
            JOIN {db}.dbo.DIV_AUX DA2 (NOLOCK) ON RD.ID_DIVIDA = DA2.ID_DIVIDA
            WHERE RD.NR_RECEBIMENTO = R.NR_RECEBIMENTO
              AND RD.ID_CARTEIRA = R.ID_CARTEIRA
              AND DA2.{settings.PORTFOLIO_COLUMN} IS NOT NULL
        ) DA
        WHERE R.DT_EMISSAO >= '{d_from}' AND R.DT_EMISSAO < '{d_to}'
          AND R.PARCELA = {settings.PRIMEIRA_PARCELA}
          AND R.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL}
          {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
    """


def sql_detail(db: str, d_from: str, d_to: str) -> str:
    """Detalhe de cada exceção com CPF, portfólio e flag de NULL."""
    return f"""
        SELECT
            R.NR_RECEBIMENTO,
            D.CPF_CNPJ            AS cpf,
            D.NOME_RAZAO          AS nome,
            U.NOME                AS agente,
            R.ID_CARTEIRA,
            R.VALOR,
            R.DT_EMISSAO,
            (
              SELECT TOP 1 DA2.{settings.PORTFOLIO_COLUMN}
              FROM {db}.dbo.REC_DIVIDAS RD (NOLOCK)
              JOIN {db}.dbo.DIV_AUX DA2 (NOLOCK) ON RD.ID_DIVIDA = DA2.ID_DIVIDA
              WHERE RD.NR_RECEBIMENTO = R.NR_RECEBIMENTO
                AND RD.ID_CARTEIRA   = R.ID_CARTEIRA
                AND DA2.{settings.PORTFOLIO_COLUMN} IS NOT NULL
            ) AS portfolio_chart,
            (
              SELECT TOP 1 DA2.{settings.PORTFOLIO_COLUMN}
              FROM {db}.dbo.REC_DIVIDAS RD (NOLOCK)
              JOIN {db}.dbo.DIV_AUX DA2 (NOLOCK) ON RD.ID_DIVIDA = DA2.ID_DIVIDA
              WHERE RD.NR_RECEBIMENTO = R.NR_RECEBIMENTO
                AND RD.ID_CARTEIRA   = R.ID_CARTEIRA
            ) AS portfolio_raw,
            (
              SELECT COUNT(*)
              FROM {db}.dbo.REC_DIVIDAS RD (NOLOCK)
              WHERE RD.NR_RECEBIMENTO = R.NR_RECEBIMENTO
                AND RD.ID_CARTEIRA   = R.ID_CARTEIRA
            ) AS qtd_dividas_vinculadas
        FROM {db}.dbo.REC_MASTER R (NOLOCK)
        JOIN {db}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
        LEFT JOIN {db}.dbo.DEV_MASTER D (NOLOCK) ON R.ID_DEV = D.ID_DEV
        WHERE R.DT_EMISSAO >= '{d_from}' AND R.DT_EMISSAO < '{d_to}'
          AND R.PARCELA = {settings.PRIMEIRA_PARCELA}
          AND R.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL}
          {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
        ORDER BY R.DT_EMISSAO
    """


def main():
    ap = argparse.ArgumentParser()
    today = date_cls.today()
    ap.add_argument("--de", default=today.isoformat())
    ap.add_argument("--ate", default=(today + timedelta(days=1)).isoformat())
    args = ap.parse_args()

    d_from = args.de.replace("-", "")
    d_to = args.ate.replace("-", "")

    print(f"Janela: {args.de} <= DT_EMISSAO < {args.ate}")
    print(f"STATUS_EXCECAO_SQL = {settings.STATUS_EXCECAO_SQL}")
    print()

    grand_total = 0
    grand_chart = 0

    for db in DBS:
        print(f"=== {db} ===")
        try:
            a = run_query(sql_count_universe(db, d_from, d_to), database_name=db, context="diag_excecoes")[0]["qtd"]
            b = run_query(sql_count_with_divida(db, d_from, d_to), database_name=db, context="diag_excecoes")[0]["qtd"]
            c = run_query(sql_count_chart(db, d_from, d_to), database_name=db, context="diag_excecoes")[0]["qtd"]
        except Exception as exc:
            print(f"  ERRO: {exc}")
            continue

        print(f"  A. Universo (REC_MASTER apenas):           {a}")
        print(f"  B. Com REC_DIVIDAS vinculada:              {b}")
        print(f"  C. Com portfólio NOT NULL (gráfico):       {c}")
        print(f"  Faltando no gráfico: {a - c}")

        grand_total += a
        grand_chart += c

        if a > 0:
            print()
            print("  Detalhe das exceções:")
            rows = run_query(sql_detail(db, d_from, d_to), database_name=db, context="diag_excecoes")
            for r in rows:
                chart = r["portfolio_chart"]
                raw = r["portfolio_raw"]
                status = "OK" if chart else ("PORTFOLIO_NULL" if raw is None else "FILTRO_NN_REMOVEU")
                if r["qtd_dividas_vinculadas"] == 0:
                    status = "SEM_REC_DIVIDAS"
                print(
                    f"    NR={r['NR_RECEBIMENTO']} CPF={r['cpf']} NOME={r['nome']!r} "
                    f"AGENTE={r['agente']!r} ID_CARTEIRA={r['ID_CARTEIRA']} "
                    f"VALOR={r['VALOR']} DT={r['DT_EMISSAO']} "
                    f"PORTFOLIO_CHART={chart!r} PORTFOLIO_RAW={raw!r} "
                    f"QTD_DIVIDAS={r['qtd_dividas_vinculadas']} STATUS={status}"
                )
        print()

    print(f"GRAND TOTAL universo: {grand_total}")
    print(f"GRAND TOTAL gráfico:  {grand_chart}")
    print(f"Diferença:            {grand_total - grand_chart}")


if __name__ == "__main__":
    main()
