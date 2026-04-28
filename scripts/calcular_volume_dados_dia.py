#!/usr/bin/env python3
"""
Relatorio de volume e qualidade dos dados gerados no dia.

Metricas incluidas:
  - Volume: linhas, colunas, memoria, tamanho em disco, bytes por linha
  - Qualidade: missing values, duplicados, cardinalidade, colunas constantes
  - Tipos: distribuicao por dtype (numerico, categorico, datetime, booleano)
  - Estatisticas numericas: describe, skewness, kurtosis, outliers (IQR)
  - Categoricas: top valores e cardinalidade
  - Temporal: distribuicao por hora, pico, intervalo medio entre eventos
  - Comparacao historica: volume do dia vs. media/mediana dos demais dias

Uso:
  python scripts/calcular_volume_dados_dia.py --arquivo dados.csv --coluna-data created_at
  python scripts/calcular_volume_dados_dia.py --arquivo eventos.parquet --coluna-data dt_evento --data 2026-04-20
  python scripts/calcular_volume_dados_dia.py --arquivo dados.csv --coluna-data created_at --output-json relatorio.json
"""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
import sys
from typing import Any

try:
    import numpy as np
    import pandas as pd
except ImportError:  # pragma: no cover - depende do ambiente
    print("Erro: pandas/numpy nao estao instalados. Rode: pip install pandas numpy")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Utilitarios
# ---------------------------------------------------------------------------

def _format_bytes(num_bytes: float) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    value = float(num_bytes)
    unit_idx = 0
    while value >= 1024 and unit_idx < len(units) - 1:
        value /= 1024
        unit_idx += 1
    return f"{value:.2f} {units[unit_idx]}"


def _to_native(obj: Any) -> Any:
    """Converte tipos numpy/pandas para tipos nativos (serializaveis em JSON)."""
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj) if not np.isnan(obj) else None
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, (pd.Timestamp,)):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {str(k): _to_native(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_native(v) for v in obj]
    return obj


def _carregar_dataframe(arquivo: Path) -> pd.DataFrame:
    suffix = arquivo.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(arquivo)
    if suffix == ".parquet":
        return pd.read_parquet(arquivo)
    if suffix == ".json":
        return pd.read_json(arquivo)
    raise ValueError(f"Formato nao suportado: {suffix}. Use .csv, .parquet ou .json")


# ---------------------------------------------------------------------------
# Metricas
# ---------------------------------------------------------------------------

def _metricas_volume(df_dia: pd.DataFrame, arquivo: Path) -> dict[str, Any]:
    linhas = int(len(df_dia))
    colunas = int(df_dia.shape[1])
    bytes_mem = int(df_dia.memory_usage(deep=True).sum())
    bytes_por_linha = (bytes_mem / linhas) if linhas else 0.0
    tamanho_disco = arquivo.stat().st_size if arquivo.exists() else 0

    return {
        "linhas_do_dia": linhas,
        "colunas": colunas,
        "bytes_estimados_memoria": bytes_mem,
        "volume_memoria_legivel": _format_bytes(bytes_mem),
        "bytes_por_linha": round(bytes_por_linha, 2),
        "tamanho_arquivo_disco_bytes": tamanho_disco,
        "tamanho_arquivo_disco_legivel": _format_bytes(tamanho_disco),
    }


def _metricas_qualidade(df_dia: pd.DataFrame) -> dict[str, Any]:
    if df_dia.empty:
        return {
            "duplicados": 0,
            "perc_duplicados": 0.0,
            "missing_total": 0,
            "perc_missing_total": 0.0,
            "missing_por_coluna": {},
            "colunas_constantes": [],
            "colunas_alta_cardinalidade": [],
        }

    total_cels = df_dia.size
    missing_por_col = df_dia.isna().sum()
    missing_total = int(missing_por_col.sum())
    duplicados = int(df_dia.duplicated().sum())

    cardinalidade = df_dia.nunique(dropna=True)
    colunas_constantes = cardinalidade[cardinalidade <= 1].index.tolist()
    # Alta cardinalidade: >= 90% de valores unicos (candidatos a id)
    limite = max(1, int(len(df_dia) * 0.9))
    colunas_alta_card = cardinalidade[cardinalidade >= limite].index.tolist()

    top_missing = (
        missing_por_col[missing_por_col > 0]
        .sort_values(ascending=False)
        .head(20)
        .to_dict()
    )

    return {
        "duplicados": duplicados,
        "perc_duplicados": round(duplicados / len(df_dia) * 100, 2),
        "missing_total": missing_total,
        "perc_missing_total": round(missing_total / total_cels * 100, 2) if total_cels else 0.0,
        "missing_por_coluna": top_missing,
        "colunas_constantes": colunas_constantes,
        "colunas_alta_cardinalidade": colunas_alta_card,
    }


def _metricas_tipos(df_dia: pd.DataFrame) -> dict[str, Any]:
    dtypes_counter: dict[str, int] = {}
    for dtype in df_dia.dtypes:
        dtypes_counter[str(dtype)] = dtypes_counter.get(str(dtype), 0) + 1

    numericas = df_dia.select_dtypes(include=["number"]).columns.tolist()
    categoricas = df_dia.select_dtypes(include=["object", "category", "string"]).columns.tolist()
    datetimes = df_dia.select_dtypes(include=["datetime", "datetimetz"]).columns.tolist()
    booleanas = df_dia.select_dtypes(include=["bool"]).columns.tolist()

    return {
        "dtypes": dtypes_counter,
        "colunas_numericas": numericas,
        "colunas_categoricas": categoricas,
        "colunas_datetime": datetimes,
        "colunas_booleanas": booleanas,
    }


def _metricas_numericas(df_dia: pd.DataFrame) -> dict[str, Any]:
    numericas = df_dia.select_dtypes(include=["number"])
    if numericas.empty:
        return {}

    resultado: dict[str, Any] = {}
    for col in numericas.columns:
        serie = numericas[col].dropna()
        if serie.empty:
            continue
        q1 = float(serie.quantile(0.25))
        q3 = float(serie.quantile(0.75))
        iqr = q3 - q1
        low = q1 - 1.5 * iqr
        high = q3 + 1.5 * iqr
        outliers = int(((serie < low) | (serie > high)).sum())

        resultado[col] = {
            "count": int(serie.count()),
            "mean": round(float(serie.mean()), 4),
            "std": round(float(serie.std(ddof=0)), 4) if len(serie) > 1 else 0.0,
            "min": float(serie.min()),
            "p25": q1,
            "median": float(serie.median()),
            "p75": q3,
            "max": float(serie.max()),
            "skewness": round(float(serie.skew()), 4) if len(serie) > 2 else 0.0,
            "kurtosis": round(float(serie.kurt()), 4) if len(serie) > 3 else 0.0,
            "outliers_iqr": outliers,
            "perc_outliers": round(outliers / len(serie) * 100, 2),
        }
    return resultado


def _metricas_categoricas(df_dia: pd.DataFrame, top_n: int = 5) -> dict[str, Any]:
    categoricas = df_dia.select_dtypes(include=["object", "category", "string"])
    if categoricas.empty:
        return {}

    resultado: dict[str, Any] = {}
    for col in categoricas.columns:
        serie = categoricas[col].dropna()
        if serie.empty:
            continue
        top_valores = serie.value_counts().head(top_n).to_dict()
        resultado[col] = {
            "valores_unicos": int(serie.nunique()),
            "valor_mais_comum": str(serie.mode().iloc[0]) if not serie.mode().empty else None,
            f"top_{top_n}": {str(k): int(v) for k, v in top_valores.items()},
        }
    return resultado


def _metricas_temporais(df_dia: pd.DataFrame, coluna_data: str) -> dict[str, Any]:
    if df_dia.empty or coluna_data not in df_dia.columns:
        return {}

    datas = pd.to_datetime(df_dia[coluna_data], errors="coerce").dropna()
    if datas.empty:
        return {}

    por_hora = datas.dt.hour.value_counts().sort_index()
    pico_hora = int(por_hora.idxmax())
    pico_qtd = int(por_hora.max())

    diffs = datas.sort_values().diff().dropna().dt.total_seconds()
    intervalo_medio = float(diffs.mean()) if not diffs.empty else 0.0
    intervalo_mediano = float(diffs.median()) if not diffs.empty else 0.0

    return {
        "primeiro_evento": datas.min().isoformat(),
        "ultimo_evento": datas.max().isoformat(),
        "distribuicao_por_hora": {int(h): int(v) for h, v in por_hora.items()},
        "hora_pico": pico_hora,
        "qtd_hora_pico": pico_qtd,
        "intervalo_medio_segundos": round(intervalo_medio, 2),
        "intervalo_mediano_segundos": round(intervalo_mediano, 2),
    }


def _metricas_historicas(df_total: pd.DataFrame, coluna_data: str, dia: date) -> dict[str, Any]:
    if df_total.empty or coluna_data not in df_total.columns:
        return {}

    datas = pd.to_datetime(df_total[coluna_data], errors="coerce")
    validos = datas.dropna()
    if validos.empty:
        return {}

    por_dia = validos.dt.date.value_counts().sort_index()
    historico = por_dia.drop(labels=[dia], errors="ignore")

    volume_dia = int(por_dia.get(dia, 0))
    media_hist = float(historico.mean()) if not historico.empty else 0.0
    mediana_hist = float(historico.median()) if not historico.empty else 0.0
    std_hist = float(historico.std(ddof=0)) if len(historico) > 1 else 0.0
    z_score = ((volume_dia - media_hist) / std_hist) if std_hist > 0 else None

    return {
        "dias_distintos_no_dataset": int(por_dia.shape[0]),
        "media_diaria_historica": round(media_hist, 2),
        "mediana_diaria_historica": round(mediana_hist, 2),
        "std_diaria_historica": round(std_hist, 2),
        "volume_dia": volume_dia,
        "volume_dia_vs_media_perc": (
            round((volume_dia - media_hist) / media_hist * 100, 2)
            if media_hist
            else None
        ),
        "z_score_volume": round(z_score, 2) if z_score is not None else None,
        "total_linhas_dataset": int(len(df_total)),
        "perc_dataset_gerado_no_dia": (
            round(volume_dia / len(df_total) * 100, 2) if len(df_total) else 0.0
        ),
    }


# ---------------------------------------------------------------------------
# Relatorio principal
# ---------------------------------------------------------------------------

def gerar_relatorio(arquivo: Path, coluna_data: str, dia: date) -> dict[str, Any]:
    df = _carregar_dataframe(arquivo)

    if coluna_data not in df.columns:
        raise ValueError(f"Coluna de data '{coluna_data}' nao encontrada no arquivo.")

    datas = pd.to_datetime(df[coluna_data], errors="coerce")
    df_dia = df.loc[datas.dt.date == dia].copy()

    relatorio = {
        "arquivo": str(arquivo),
        "data_referencia": dia.isoformat(),
        "coluna_data": coluna_data,
        "volume": _metricas_volume(df_dia, arquivo),
        "qualidade": _metricas_qualidade(df_dia),
        "tipos": _metricas_tipos(df_dia),
        "estatisticas_numericas": _metricas_numericas(df_dia),
        "estatisticas_categoricas": _metricas_categoricas(df_dia),
        "temporal": _metricas_temporais(df_dia, coluna_data),
        "historico": _metricas_historicas(df, coluna_data, dia),
    }
    return _to_native(relatorio)


# ---------------------------------------------------------------------------
# Apresentacao
# ---------------------------------------------------------------------------

def _print_secao(titulo: str) -> None:
    print(f"\n=== {titulo} ===")


def imprimir_relatorio(rel: dict[str, Any]) -> None:
    print("============================================")
    print(" Relatorio de Volume de Dados do Dia")
    print("============================================")
    print(f"Arquivo: {rel['arquivo']}")
    print(f"Data de referencia: {rel['data_referencia']}")
    print(f"Coluna de data: {rel['coluna_data']}")

    vol = rel["volume"]
    _print_secao("Volume")
    print(f"  Linhas do dia:            {vol['linhas_do_dia']}")
    print(f"  Colunas:                  {vol['colunas']}")
    print(f"  Memoria estimada:         {vol['volume_memoria_legivel']} ({vol['bytes_estimados_memoria']} bytes)")
    print(f"  Bytes por linha:          {vol['bytes_por_linha']}")
    print(f"  Tamanho em disco:         {vol['tamanho_arquivo_disco_legivel']}")

    qa = rel["qualidade"]
    _print_secao("Qualidade")
    print(f"  Linhas duplicadas:        {qa['duplicados']} ({qa['perc_duplicados']}%)")
    print(f"  Celulas ausentes:         {qa['missing_total']} ({qa['perc_missing_total']}%)")
    if qa["missing_por_coluna"]:
        print("  Top colunas com missing:")
        for col, qtd in qa["missing_por_coluna"].items():
            print(f"    - {col}: {qtd}")
    if qa["colunas_constantes"]:
        print(f"  Colunas constantes:       {qa['colunas_constantes']}")
    if qa["colunas_alta_cardinalidade"]:
        print(f"  Colunas tipo ID (>=90%):  {qa['colunas_alta_cardinalidade']}")

    tipos = rel["tipos"]
    _print_secao("Tipos de dados")
    print(f"  Distribuicao dtypes:      {tipos['dtypes']}")
    print(f"  Numericas:                {len(tipos['colunas_numericas'])}")
    print(f"  Categoricas:              {len(tipos['colunas_categoricas'])}")
    print(f"  Datetime:                 {len(tipos['colunas_datetime'])}")
    print(f"  Booleanas:                {len(tipos['colunas_booleanas'])}")

    if rel["estatisticas_numericas"]:
        _print_secao("Estatisticas numericas (por coluna)")
        for col, stats in rel["estatisticas_numericas"].items():
            print(
                f"  - {col}: mean={stats['mean']} std={stats['std']} "
                f"min={stats['min']} med={stats['median']} max={stats['max']} "
                f"skew={stats['skewness']} kurt={stats['kurtosis']} "
                f"outliers={stats['outliers_iqr']} ({stats['perc_outliers']}%)"
            )

    if rel["estatisticas_categoricas"]:
        _print_secao("Estatisticas categoricas (por coluna)")
        for col, stats in rel["estatisticas_categoricas"].items():
            top_key = next((k for k in stats.keys() if k.startswith("top_")), None)
            top = stats.get(top_key, {}) if top_key else {}
            print(
                f"  - {col}: unicos={stats['valores_unicos']} "
                f"moda={stats['valor_mais_comum']} top={top}"
            )

    temporal = rel["temporal"]
    if temporal:
        _print_secao("Temporal")
        print(f"  Primeiro evento:          {temporal['primeiro_evento']}")
        print(f"  Ultimo evento:            {temporal['ultimo_evento']}")
        print(f"  Hora de pico:             {temporal['hora_pico']}h ({temporal['qtd_hora_pico']} registros)")
        print(f"  Intervalo medio (s):      {temporal['intervalo_medio_segundos']}")
        print(f"  Intervalo mediano (s):    {temporal['intervalo_mediano_segundos']}")

    hist = rel["historico"]
    if hist:
        _print_secao("Comparacao historica")
        print(f"  Dias distintos no dataset: {hist['dias_distintos_no_dataset']}")
        print(f"  Media diaria historica:    {hist['media_diaria_historica']}")
        print(f"  Mediana diaria historica:  {hist['mediana_diaria_historica']}")
        print(f"  Desvio padrao diario:      {hist['std_diaria_historica']}")
        print(f"  Volume do dia:             {hist['volume_dia']}")
        print(f"  Dia vs. media:             {hist['volume_dia_vs_media_perc']}%")
        print(f"  Z-score volume:            {hist['z_score_volume']}")
        print(f"  % dataset gerado no dia:   {hist['perc_dataset_gerado_no_dia']}%")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Relatorio de volume e qualidade dos dados gerados no dia."
    )
    parser.add_argument(
        "--arquivo",
        required=True,
        help="Caminho do arquivo (.csv, .parquet ou .json).",
    )
    parser.add_argument(
        "--coluna-data",
        required=True,
        help="Nome da coluna com data/hora dos registros.",
    )
    parser.add_argument(
        "--data",
        default=date.today().isoformat(),
        help="Data de referencia no formato YYYY-MM-DD (padrao: hoje).",
    )
    parser.add_argument(
        "--output-json",
        default=None,
        help="Caminho opcional para salvar o relatorio em JSON.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    arquivo = Path(args.arquivo)

    if not arquivo.exists():
        print(f"Erro: arquivo nao encontrado: {arquivo}")
        sys.exit(1)

    try:
        dia = date.fromisoformat(args.data)
    except ValueError:
        print("Erro: data invalida. Use o formato YYYY-MM-DD.")
        sys.exit(1)

    try:
        relatorio = gerar_relatorio(arquivo=arquivo, coluna_data=args.coluna_data, dia=dia)
    except Exception as exc:  # pragma: no cover - erro de entrada/arquivo
        print(f"Erro ao gerar relatorio: {exc}")
        sys.exit(1)

    imprimir_relatorio(relatorio)

    if args.output_json:
        destino = Path(args.output_json)
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(json.dumps(relatorio, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nRelatorio salvo em: {destino}")


if __name__ == "__main__":
    main()
