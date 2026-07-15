"""
Extração do dataset de treino — Ritmo do Dia, modelo de VALOR esperado gerado.

Espelha a extração do modelo de quantidade (ver RETREINO_FILTRO_AGENTES.md):
mesma janela de negócio (STATUS_GERADOS, PARCELA=0, hora 8-19, filtro de
agentes excluídos), mesma lógica de dias_desde_ultimo_batimento via
CARGA_LOTE. Única diferença: agrega SUM(VALOR) em vez de COUNT(DISTINCT
NR_RECEBIMENTO) por (banco, dia, hora).

Roda do root do projeto: .venv/Scripts/python.exe deploy/gerar_dataset_valor.py
Saída: deploy/d_valor.csv
"""
from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import config.settings as settings  # noqa: E402
from api.routers.ritmo_dia import _DS_MIN, _DS_PERIOD, _faixa_de_dias, normalizar_dia_semana  # noqa: E402
from core.database.query_executor import run_query  # noqa: E402

JANELA_DIAS_UTEIS = 90
OUT_PATH = ROOT / "deploy" / "d_valor.csv"


def _dias_uteis_ate(fim: date, n: int) -> list[date]:
    dias: list[date] = []
    cursor = fim
    while len(dias) < n:
        if cursor.weekday() < 5:
            dias.append(cursor)
        cursor -= timedelta(days=1)
    return sorted(dias)


def _obter_batimentos(db: str) -> list[date]:
    sql = f"""
        SELECT DISTINCT CAST([DATA] AS DATE) AS dia_batimento
        FROM {db}..CARGA_LOTE WITH (NOLOCK)
        WHERE ID_USUARIO = 1 AND QTD_NV_CLI > 10000
        ORDER BY dia_batimento
    """
    rows = run_query(sql, db, context="gerar-dataset-valor/batimentos")
    return [date.fromisoformat(str(r["dia_batimento"])[:10]) for r in rows]


def _dias_desde_batimento(dia: date, batimentos: list[date]) -> int:
    anteriores = [b for b in batimentos if b <= dia]
    if not anteriores:
        return 99
    return (dia - max(anteriores)).days


def _obter_valor_hora(db: str, ini: date, fim: date) -> pd.DataFrame:
    sql = f"""
        SELECT
            CAST(R.DT_EMISSAO AS DATE) AS dia,
            DATEPART(HOUR, R.DT_EMISSAO) AS hora,
            SUM(R.VALOR) AS valor
        FROM {db}..REC_MASTER R WITH (NOLOCK)
        JOIN {db}..USU_MASTER U WITH (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
        WHERE R.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}
          AND R.PARCELA = 0
          AND DATEPART(HOUR, R.DT_EMISSAO) BETWEEN 8 AND 19
          AND CAST(R.DT_EMISSAO AS DATE) BETWEEN '{ini.isoformat()}' AND '{fim.isoformat()}'
          {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
        GROUP BY CAST(R.DT_EMISSAO AS DATE), DATEPART(HOUR, R.DT_EMISSAO)
    """
    rows = run_query(sql, db, context="gerar-dataset-valor/valor-hora")
    return pd.DataFrame(rows)


def gerar() -> pd.DataFrame:
    fim = date.today() - timedelta(days=1)
    dias_uteis = _dias_uteis_ate(fim, JANELA_DIAS_UTEIS)
    ini = dias_uteis[0]

    linhas = []
    for db in settings.ALLOWED_DATABASES:
        batimentos = _obter_batimentos(db)
        valor_df = _obter_valor_hora(db, ini, fim)
        valor_map = {
            (date.fromisoformat(str(r["dia"])[:10]), int(r["hora"])): float(r["valor"] or 0.0)
            for _, r in valor_df.iterrows()
        }

        for dia in dias_uteis:
            dias_desde = _dias_desde_batimento(dia, batimentos)
            faixa = _faixa_de_dias(dias_desde)
            dia_semana = normalizar_dia_semana(pd.Timestamp(dia).to_pydatetime())
            acumulado = 0.0
            for hora in range(8, 20):
                valor = valor_map.get((dia, hora), 0.0)
                acumulado += valor
                linhas.append({
                    "banco_origem": db,
                    "dia": dia,
                    "hora": hora,
                    "dia_semana": dia_semana,
                    "valor": round(valor, 2),
                    "valor_acumulado_ate_hora": round(acumulado, 2),
                    "dias_desde_ultimo_batimento": dias_desde,
                    "faixa_batimento": faixa,
                })

    df = pd.DataFrame(linhas)
    df.to_csv(OUT_PATH, index=False)
    print(f"{OUT_PATH}  ({len(df)} linhas, {df['dia'].nunique()} dias uteis, "
          f"bancos={sorted(df['banco_origem'].unique())}, janela {ini} -> {fim})")
    return df


if __name__ == "__main__":
    gerar()
