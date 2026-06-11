"""
Cruzamentos agente × carteira × status para o agente de chat (/agente/chat).

Duas visões sobre a mesma base (REC_MASTER, janela da sessão, PARCELA = 0,
pré-filtro do rollup, agentes excluídos no SQL):

  - cruzamento: dado UM lado (carteira ou agente), decompõe o outro lado por
    dimensão de status (gerados / exceções / quebrados / rejeitados);
  - ranking: agentes ordenados por valor numa dimensão de status.
"""
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

import config.settings as settings
from core.cache.cache_manager import cache_manager
from core.database.query_executor import run_query
from core.utils.validation import validate_database_or_todos
from dominios.graficos.queries import wrap_todos_or_single

RANKING_DIMENSOES = ("gerados", "excecoes", "quebrados", "rejeitados")
_CROSS_LIMITE = 20


def _status_sql_da_dimensao(dimensao: str) -> str:
    return {
        "gerados": settings.STATUS_GERADOS_SQL,
        "excecoes": settings.STATUS_EXCECAO_SQL,
        "quebrados": settings.STATUS_QUEBRADO_SQL,
        "rejeitados": settings.STATUS_REJEITADO_SQL,
    }[dimensao]


def build_cruzamento_query(db: str, filtro: str, date_from: str, date_to_exclusive: str) -> str:
    """
    Grão agente × carteira × status, com WHERE parametrizado (`?`, um por
    banco) no lado escolhido: filtro='portfolio' fixa a carteira; 'agente'
    fixa o agente.
    """
    def _base(database: str) -> str:
        where_param = (
            f"AND DA.{settings.PORTFOLIO_COLUMN} = ?"
            if filtro == "portfolio"
            else "AND U.NOME = ?"
        )
        return f"""
            SELECT
                U.NOME AS agente,
                DA.{settings.PORTFOLIO_COLUMN} AS portfolio_name,
                R.ID_REC_STATUS AS id_rec_status,
                COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd,
                SUM(R.VALOR) AS valor
            FROM {database}.dbo.REC_MASTER R (NOLOCK)
            JOIN {database}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
            CROSS APPLY (
                SELECT TOP 1 DA2.{settings.PORTFOLIO_COLUMN}
                FROM {database}.dbo.REC_DIVIDAS RD (NOLOCK)
                JOIN {database}.dbo.DIV_AUX DA2 (NOLOCK) ON RD.ID_DIVIDA = DA2.ID_DIVIDA
                WHERE RD.NR_RECEBIMENTO = R.NR_RECEBIMENTO
                  AND RD.ID_CARTEIRA = R.ID_CARTEIRA
                  AND DA2.{settings.PORTFOLIO_COLUMN} IS NOT NULL
            ) DA
            WHERE R.DT_EMISSAO >= @Hoje AND R.DT_EMISSAO < @Amanha
              AND R.PARCELA = {settings.PRIMEIRA_PARCELA}
              AND R.ID_REC_STATUS IN {settings.STATUS_PORTFOLIO_ROLLUP_SQL}
              {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
              {where_param}
            GROUP BY U.NOME, DA.{settings.PORTFOLIO_COLUMN}, R.ID_REC_STATUS
        """

    agg = """
        SELECT agente, portfolio_name, id_rec_status, SUM(qtd) AS qtd, SUM(valor) AS valor
    """
    order = (
        "GROUP BY agente, portfolio_name, id_rec_status ORDER BY agente, portfolio_name"
        if db == "todos"
        else "ORDER BY agente, portfolio_name"
    )
    return wrap_todos_or_single(db, _base, agg, order_by=order, date_from=date_from, date_to_exclusive=date_to_exclusive)


def _cruzamento_summary(
    rows: List[Dict[str, Any]],
    contraparte_key: str,
    data_referencia: str,
) -> List[Dict[str, Any]]:
    """Agrega o lado livre do cruzamento em baldes de status, ordenado por valor gerado."""
    acc: Dict[str, Dict[str, float]] = {}
    for row in rows:
        nome = str(row.get(contraparte_key) or "").strip()
        if not nome:
            continue
        status = int(row.get("id_rec_status") or 0)
        qtd = int(row.get("qtd") or 0)
        valor = float(row.get("valor") or 0)
        bucket = acc.setdefault(nome, {
            "qtd_acordos": 0,
            "valor_primeira_parcela": 0.0,
            "valor_excecoes": 0.0,
            "valor_quebrados": 0.0,
            "valor_rejeitados": 0.0,
        })
        if status in settings.STATUS_GERADOS:
            bucket["qtd_acordos"] += qtd
            bucket["valor_primeira_parcela"] += valor
        if status in settings.STATUS_EXCECAO:
            bucket["valor_excecoes"] += valor
        if status in settings.STATUS_QUEBRADO:
            bucket["valor_quebrados"] += valor
        if status in settings.STATUS_REJEITADO:
            bucket["valor_rejeitados"] += valor

    entries = [
        {
            contraparte_key: nome,
            "qtd_acordos": int(b["qtd_acordos"]),
            "valor_primeira_parcela": round(b["valor_primeira_parcela"], 2),
            "valor_excecoes": round(b["valor_excecoes"], 2),
            "valor_quebrados": round(b["valor_quebrados"], 2),
            "valor_rejeitados": round(b["valor_rejeitados"], 2),
            "data_referencia": data_referencia,
        }
        for nome, b in acc.items()
    ]
    entries.sort(key=lambda e: e["valor_primeira_parcela"], reverse=True)
    return entries[:_CROSS_LIMITE]


def build_cruzamento(
    db: str,
    date_from: str,
    date_to: str,
    portfolio: Optional[str] = None,
    agente: Optional[str] = None,
    run_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Cruzamento na janela da sessão. Exatamente um de portfolio/agente (validado no dispatch)."""
    validated_db = validate_database_or_todos(db)
    conn_db = settings.ALLOWED_DATABASES[0] if validated_db == "todos" else validated_db
    date_to_exclusive = (date.fromisoformat(date_to) + timedelta(days=1)).isoformat()
    filtro = "portfolio" if portfolio else "agente"
    valor_filtro = portfolio if portfolio else agente

    def _compute() -> List[Dict[str, Any]]:
        query = build_cruzamento_query(validated_db, filtro, date_from, date_to_exclusive)
        params: Tuple[Any, ...] = (
            (valor_filtro, valor_filtro) if validated_db == "todos" else (valor_filtro,)
        )
        return run_query(
            query, conn_db,
            params=params,
            run_id=run_id,
            context="agente/cruzamento",
        )

    cache_key = f"agente|cruzamento|{validated_db}|{date_from}|{date_to}|{filtro}|{valor_filtro}"
    rows = cache_manager.get_or_compute(cache_key, _compute)
    contraparte = "agente" if filtro == "portfolio" else "portfolio_name"
    out: Dict[str, Any] = {
        filtro: valor_filtro,
        "detalhe_por": contraparte,
        "entries": _cruzamento_summary(rows, contraparte, data_referencia=date_to),
        "data_referencia": date_to,
    }
    if not out["entries"]:
        out["aviso"] = "Sem acordos para este filtro no período."
    return out


def build_ranking_agentes_query(db: str, status_sql: str, date_from: str, date_to_exclusive: str) -> str:
    """Agentes com qtd e valor de 1ª parcela na dimensão de status pedida."""
    def _base(database: str) -> str:
        return f"""
            SELECT
                U.NOME AS agente,
                COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd,
                SUM(R.VALOR) AS valor
            FROM {database}.dbo.REC_MASTER R (NOLOCK)
            JOIN {database}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
            WHERE R.DT_EMISSAO >= @Hoje AND R.DT_EMISSAO < @Amanha
              AND R.PARCELA = {settings.PRIMEIRA_PARCELA}
              AND R.ID_REC_STATUS IN {status_sql}
              {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
            GROUP BY U.NOME
        """

    agg = """
        SELECT agente, SUM(qtd) AS qtd, SUM(valor) AS valor
    """
    order = "GROUP BY agente ORDER BY valor DESC" if db == "todos" else "ORDER BY valor DESC"
    return wrap_todos_or_single(db, _base, agg, order_by=order, date_from=date_from, date_to_exclusive=date_to_exclusive)


def build_ranking_agentes(
    db: str,
    date_from: str,
    date_to: str,
    dimensao: str,
    limit: int = 10,
    run_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Ranking de agentes por valor na dimensão (gerados/excecoes/quebrados/rejeitados)."""
    validated_db = validate_database_or_todos(db)
    conn_db = settings.ALLOWED_DATABASES[0] if validated_db == "todos" else validated_db
    date_to_exclusive = (date.fromisoformat(date_to) + timedelta(days=1)).isoformat()

    def _compute() -> List[Dict[str, Any]]:
        query = build_ranking_agentes_query(
            validated_db, _status_sql_da_dimensao(dimensao), date_from, date_to_exclusive
        )
        return run_query(
            query, conn_db,
            run_id=run_id,
            context="agente/ranking-status",
        )

    cache_key = f"agente|ranking-status|{validated_db}|{date_from}|{date_to}|{dimensao}"
    rows = cache_manager.get_or_compute(cache_key, _compute)
    agentes = [
        {
            "agente": str(r.get("agente") or "").strip(),
            "qtd": int(r.get("qtd") or 0),
            "valor": round(float(r.get("valor") or 0), 2),
        }
        for r in rows
        if str(r.get("agente") or "").strip()
    ]
    return {
        "dimensao": dimensao,
        "agentes": agentes[:limit],
        "data_referencia": date_to,
    }
