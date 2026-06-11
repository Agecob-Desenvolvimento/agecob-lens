"""
Série temporal diária para o agente de chat (/agente/chat).

Reusa as MESMAS regras do rollup de carteiras (status, PARCELA = 0, filtro de
agentes, janela DT_EMISSAO) com grão diário. As métricas são derivadas
client-side dos baldes por status: `valor`/`qtd` (gerados) e `risco`
(composto = MAX das fatias do universo do dia, como em risco.py).
"""
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

import config.settings as settings
from core.cache.cache_manager import cache_manager
from core.database.query_executor import run_query
from core.utils.validation import validate_database_or_todos
from dominios.graficos.queries import wrap_todos_or_single

SERIES_METRICS: Tuple[str, ...] = ("valor", "qtd", "risco")
SERIES_PERIODS: Dict[str, int] = {"7d": 7, "30d": 30, "90d": 90}


def build_daily_rollup_query(
    db: str,
    date_from: str,
    date_to_exclusive: str,
    with_portfolio_filter: bool = False,
) -> str:
    """
    Rollup por dia + status. Sem filtro de carteira não há CROSS APPLY de
    portfólio (mais barato e inclui acordos sem portfólio, como nas queries de
    1ª parcela); com filtro, a resolução de portfólio é idêntica à do rollup
    consolidado e o nome entra como parâmetro `?` (um por banco).
    """
    def _base(database: str) -> str:
        portfolio_apply = ""
        portfolio_where = ""
        if with_portfolio_filter:
            portfolio_apply = f"""
            CROSS APPLY (
                SELECT TOP 1 DA2.{settings.PORTFOLIO_COLUMN}
                FROM {database}.dbo.REC_DIVIDAS RD (NOLOCK)
                JOIN {database}.dbo.DIV_AUX DA2 (NOLOCK) ON RD.ID_DIVIDA = DA2.ID_DIVIDA
                WHERE RD.NR_RECEBIMENTO = R.NR_RECEBIMENTO
                  AND RD.ID_CARTEIRA = R.ID_CARTEIRA
                  AND DA2.{settings.PORTFOLIO_COLUMN} IS NOT NULL
            ) DA"""
            portfolio_where = f"AND DA.{settings.PORTFOLIO_COLUMN} = ?"
        return f"""
            SELECT
                CAST(R.DT_EMISSAO AS DATE) AS dia,
                R.ID_REC_STATUS AS id_rec_status,
                COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd,
                SUM(R.VALOR) AS valor
            FROM {database}.dbo.REC_MASTER R (NOLOCK)
            JOIN {database}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
            {portfolio_apply}
            WHERE R.DT_EMISSAO >= @Hoje AND R.DT_EMISSAO < @Amanha
              AND R.PARCELA = {settings.PRIMEIRA_PARCELA}
              AND R.ID_REC_STATUS IN {settings.STATUS_PORTFOLIO_ROLLUP_SQL}
              {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
              {portfolio_where}
            GROUP BY CAST(R.DT_EMISSAO AS DATE), R.ID_REC_STATUS
        """

    agg = """
        SELECT dia, id_rec_status, SUM(qtd) AS qtd, SUM(valor) AS valor
    """
    order = (
        "GROUP BY dia, id_rec_status ORDER BY dia, id_rec_status"
        if db == "todos"
        else "ORDER BY dia, id_rec_status"
    )
    return wrap_todos_or_single(db, _base, agg, order_by=order, date_from=date_from, date_to_exclusive=date_to_exclusive)


def _series_from_rows(
    rows: List[Dict[str, Any]],
    metric: str,
    date_from: str,
    date_to: str,
) -> List[Dict[str, Any]]:
    """Pontos diários contínuos (dias sem linha viram 0) na janela inclusiva."""
    acc: Dict[str, Dict[str, float]] = {}
    for row in rows:
        dia = row.get("dia")
        if dia is None:
            continue
        key = str(dia)[:10]
        status = int(row.get("id_rec_status") or 0)
        qtd = float(row.get("qtd") or 0)
        valor = float(row.get("valor") or 0)
        bucket = acc.setdefault(key, {
            "valor_gerados": 0.0,
            "qtd_gerados": 0.0,
            "valor_excecoes": 0.0,
            "valor_quebrados": 0.0,
            "valor_rejeitados": 0.0,
        })
        if status in settings.STATUS_GERADOS:
            bucket["valor_gerados"] += valor
            bucket["qtd_gerados"] += qtd
        if status in settings.STATUS_EXCECAO:
            bucket["valor_excecoes"] += valor
        if status in settings.STATUS_QUEBRADO:
            bucket["valor_quebrados"] += valor
        if status in settings.STATUS_REJEITADO:
            bucket["valor_rejeitados"] += valor

    points: List[Dict[str, Any]] = []
    current = date.fromisoformat(date_from)
    end = date.fromisoformat(date_to)
    while current <= end:
        bucket = acc.get(current.isoformat())
        if bucket is None:
            value: Any = 0 if metric == "qtd" else 0.0
        elif metric == "valor":
            value = round(bucket["valor_gerados"], 2)
        elif metric == "qtd":
            value = int(bucket["qtd_gerados"])
        else:  # risco
            universo = bucket["valor_gerados"] + bucket["valor_excecoes"] + bucket["valor_rejeitados"]
            if universo <= 0:
                value = 0.0
            else:
                pior = max(bucket["valor_excecoes"], bucket["valor_quebrados"], bucket["valor_rejeitados"])
                value = round(pior * 100.0 / universo, 2)
        points.append({"data": current.isoformat(), "valor": value})
        current += timedelta(days=1)
    return points


def _tendencia(points: List[Dict[str, Any]]) -> Tuple[str, Optional[float]]:
    """
    Compara a média da 2ª metade da janela com a da 1ª (robusto a ruído
    diário); zona morta de ±5% vira 'estavel'. variacao_percentual é None
    quando a 1ª metade é zero (divisão sem sentido).
    """
    valores = [float(p["valor"]) for p in points]
    if len(valores) < 2:
        return "estavel", None
    half = len(valores) // 2
    m1 = sum(valores[:half]) / half
    m2 = sum(valores[half:]) / (len(valores) - half)
    variacao = round((m2 - m1) * 100.0 / m1, 2) if m1 > 0 else None
    if m2 > m1 * 1.05:
        return "crescente", variacao
    if m2 < m1 * 0.95:
        return "decrescente", variacao
    return "estavel", variacao


def build_time_series(
    db: str,
    metric: str,
    period: str,
    portfolio: Optional[str],
    date_to: str,
    run_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Série diária da métrica nos últimos N dias terminando em date_to (inclusivo)."""
    validated_db = validate_database_or_todos(db)
    conn_db = settings.ALLOWED_DATABASES[0] if validated_db == "todos" else validated_db
    days = SERIES_PERIODS[period]
    end = date.fromisoformat(date_to)
    date_from = (end - timedelta(days=days - 1)).isoformat()
    date_to_exclusive = (end + timedelta(days=1)).isoformat()

    def _compute() -> List[Dict[str, Any]]:
        query = build_daily_rollup_query(
            validated_db, date_from, date_to_exclusive,
            with_portfolio_filter=bool(portfolio),
        )
        params = None
        if portfolio:
            params = (portfolio, portfolio) if validated_db == "todos" else (portfolio,)
        return run_query(
            query, conn_db,
            params=params,
            run_id=run_id,
            context="agente/time-series",
        )

    cache_key = f"agente|daily-rollup|{validated_db}|{date_from}|{date_to}|{portfolio or '*'}"
    rows = cache_manager.get_or_compute(cache_key, _compute)
    points = _series_from_rows(rows, metric, date_from, date_to)
    tendencia, variacao = _tendencia(points)
    return {
        "metric": metric,
        "period": period,
        "portfolio": portfolio,
        "data": points,
        "tendencia": tendencia,
        "variacao_percentual": variacao,
        "data_referencia": date_to,
    }
