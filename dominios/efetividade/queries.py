
from typing import Any, Optional, Tuple

import config.settings as settings

_EF_PAID = settings.BOLETO_PAGO_PRAZO_SQL
_EF_CONV = (
    f"CAST(FLOOR(100.0 * SUM({_EF_PAID}) / NULLIF(COUNT(*), 0) + 0.5) AS INT)"
)
_EF_AGENT_FILTER = (
    "AND UPPER(U.CHAVE) NOT LIKE '%SERASA%' "
    "AND UPPER(U.CHAVE) NOT LIKE '%COBDESANTOS%' "
    "AND UPPER(U.CHAVE) NOT LIKE '%NEMBUS%' "
    "AND UPPER(U.CHAVE) NOT LIKE '%ANTLIA%' "
    "AND UPPER(U.CHAVE) NOT LIKE '%SUPORTE%' "
    "AND UPPER(U.CHAVE) NOT LIKE '%INTERNA%' "
    "AND UPPER(U.CHAVE) NOT LIKE '%SISTEMA%' "
    "AND UPPER(U.NOME) NOT LIKE '%COBDESANTOS%' "
    "AND UPPER(U.NOME) NOT LIKE '%NEMBUSUSER%'"
)
_EF_DB_A = "COBwebRCBAUTOS"
_EF_DB_C = "COBwebRCBCONSUMER"
_EF_STATUS = settings.STATUS_GERADOS_SQL  # (1, 2, 3, 10, 12) — valores gerados
_EF_DB_VARIANTS = ["todos", _EF_DB_A, _EF_DB_C]


def _ef_inner_simple(db: str, parcela_cond: str, date_col: str, extra_cols: str = "") -> str:
    """Builds the inner SELECT(s) for simple (non-agent) efetividade queries."""
    sel = f"SELECT R.{date_col}, R.VR_PAGO, R.DT_PAGAMENTO"
    if "DT_VENCIMENTO" not in date_col and "DT_VENCIMENTO" not in extra_cols:
        sel += ", R.DT_VENCIMENTO"
    sel += extra_cols.replace(", ", ", R.") if extra_cols else ""
    raw_col = date_col.split(" AS ")[0].strip().replace("CAST(", "").replace(" AS DATE)", "")
    where = (
        f"WHERE R.PARCELA {parcela_cond} AND R.ID_REC_STATUS IN {_EF_STATUS} "
        f"AND YEAR(R.{raw_col}) >= 2026 {_EF_AGENT_FILTER}"
    )
    def _one(database: str) -> str:
        return (
            f"{sel} FROM {database}.dbo.REC_MASTER (NOLOCK) R "
            f"INNER JOIN {database}.dbo.USU_MASTER (NOLOCK) U ON R.ID_USUARIO = U.ID_USUARIO "
            f"{where}"
        )
    if db == "todos":
        return f"{_one(_EF_DB_A)}\n    UNION ALL\n    {_one(_EF_DB_C)}"
    return _one(db)


def _ef_inner_agent(db: str, parcela_cond: str, date_col: str) -> str:
    """Builds the inner SELECT(s) for agent efetividade queries."""
    venc_col = "" if "DT_VENCIMENTO" in date_col else " R.DT_VENCIMENTO,"
    def _one(database: str) -> str:
        return (
            f"SELECT R.{date_col}, R.VR_PAGO, R.DT_PAGAMENTO,{venc_col} R.ID_REC_STATUS,\n"
            f"           U.CHAVE AS Agente, YEAR(R.{date_col}) AS Ano, MONTH(R.{date_col}) AS Mes\n"
            f"    FROM {database}.dbo.REC_MASTER (NOLOCK) R\n"
            f"    INNER JOIN {database}.dbo.USU_MASTER (NOLOCK) U ON R.ID_USUARIO = U.ID_USUARIO\n"
            f"    WHERE R.PARCELA {parcela_cond} AND R.ID_REC_STATUS IN {_EF_STATUS} AND YEAR(R.{date_col}) >= 2026\n"
            f"      {_EF_AGENT_FILTER}"
        )
    if db == "todos":
        return f"{_one(_EF_DB_A)}\n    UNION ALL\n    {_one(_EF_DB_C)}"
    return _one(db)


def _build_ef_diaria_primeira(db: str) -> str:
    inner = _ef_inner_simple(db, "= 0", "DT_EMISSAO", ", DT_VENCIMENTO")
    return f"""
SELECT CAST(DT_EMISSAO AS DATE) AS Dia_Emissao, COUNT(*) AS Boletos_Gerados,
    SUM({_EF_PAID}) AS Pagos_No_Prazo, {_EF_CONV} AS Conversao_Prazo_5d
FROM ({inner}) AS T
GROUP BY CAST(DT_EMISSAO AS DATE) ORDER BY Dia_Emissao
"""


def _build_ef_mensal_primeira(db: str) -> str:
    inner = _ef_inner_simple(db, "= 0", "DT_EMISSAO", ", DT_VENCIMENTO")
    return f"""
SELECT YEAR(DT_EMISSAO) AS Ano, MONTH(DT_EMISSAO) AS Mes, COUNT(*) AS Boletos_Gerados,
    SUM({_EF_PAID}) AS Pagos_No_Prazo, {_EF_CONV} AS Conversao_Prazo_5d
FROM ({inner}) AS T
GROUP BY YEAR(DT_EMISSAO), MONTH(DT_EMISSAO) ORDER BY Ano, Mes
"""


def _build_ef_diaria_colchao(db: str) -> str:
    inner = _ef_inner_simple(db, "> 0", "DT_EMISSAO", ", DT_VENCIMENTO")
    return f"""
SELECT CAST(DT_EMISSAO AS DATE) AS Dia_Emissao, COUNT(*) AS Boletos_Gerados_Colchao,
    SUM({_EF_PAID}) AS Pagos_No_Prazo, {_EF_CONV} AS Conversao_Colchao
FROM ({inner}) AS T
GROUP BY CAST(DT_EMISSAO AS DATE) ORDER BY Dia_Emissao
"""


def _build_ef_mensal_colchao(db: str) -> str:
    inner = _ef_inner_simple(db, "> 0", "DT_EMISSAO", ", DT_VENCIMENTO")
    return f"""
SELECT YEAR(DT_EMISSAO) AS Ano, MONTH(DT_EMISSAO) AS Mes, COUNT(*) AS Boletos_Gerados_Colchao,
    SUM({_EF_PAID}) AS Pagos_No_Prazo, {_EF_CONV} AS Conversao_Colchao
FROM ({inner}) AS T
GROUP BY YEAR(DT_EMISSAO), MONTH(DT_EMISSAO) ORDER BY Ano, Mes
"""


def _build_ef_diaria_colchao_vencimento(db: str) -> str:
    inner = _ef_inner_simple(db, "> 0", "DT_VENCIMENTO", "")
    return f"""
SELECT CAST(DT_VENCIMENTO AS DATE) AS Dia_Vencimento, COUNT(*) AS Boletos_Gerados_Colchao,
    SUM({_EF_PAID}) AS Pagos_No_Prazo, {_EF_CONV} AS Conversao_Colchao
FROM ({inner}) AS T
GROUP BY CAST(DT_VENCIMENTO AS DATE) ORDER BY Dia_Vencimento
"""


def _build_ef_mensal_colchao_vencimento(db: str) -> str:
    inner = _ef_inner_simple(db, "> 0", "DT_VENCIMENTO", "")
    return f"""
SELECT YEAR(DT_VENCIMENTO) AS Ano, MONTH(DT_VENCIMENTO) AS Mes, COUNT(*) AS Boletos_Gerados_Colchao,
    SUM({_EF_PAID}) AS Pagos_No_Prazo, {_EF_CONV} AS Conversao_Colchao
FROM ({inner}) AS T
GROUP BY YEAR(DT_VENCIMENTO), MONTH(DT_VENCIMENTO) ORDER BY Ano, Mes
"""


def _build_ef_mensal_agente_primeira(db: str) -> str:
    inner = _ef_inner_agent(db, "= 0", "DT_EMISSAO")
    return f"""
SELECT Agente, Ano, Mes, COUNT(*) AS Boletos_Gerados,
    SUM({_EF_PAID}) AS Pagos_No_Prazo, {_EF_CONV} AS Conversao_Prazo_5d
FROM ({inner}) AS T
GROUP BY Agente, Ano, Mes ORDER BY Ano, Mes, Agente
"""


def _build_ef_mensal_agente_colchao(db: str) -> str:
    inner = _ef_inner_agent(db, "> 0", "DT_EMISSAO")
    return f"""
SELECT Agente, Ano, Mes, COUNT(*) AS Boletos_Gerados_Colchao,
    SUM({_EF_PAID}) AS Pagos_No_Prazo, {_EF_CONV} AS Conversao_Colchao
FROM ({inner}) AS T
GROUP BY Agente, Ano, Mes ORDER BY Ano, Mes, Agente
"""


def _build_ef_mensal_agente_colchao_vencimento(db: str) -> str:
    inner = _ef_inner_agent(db, "> 0", "DT_VENCIMENTO")
    return f"""
SELECT Agente, Ano, Mes, COUNT(*) AS Boletos_Gerados_Colchao,
    SUM({_EF_PAID}) AS Pagos_No_Prazo, {_EF_CONV} AS Conversao_Colchao,
    SUM(CASE WHEN ID_REC_STATUS = {settings.STATUS_QUEBRADO[0]} THEN 1 ELSE 0 END) AS Quebrados
FROM ({inner}) AS T
GROUP BY Agente, Ano, Mes HAVING COUNT(*) >= 10
ORDER BY Ano, Mes, Agente
"""


_EF_BUILDER_MAP = {
    "diaria-primeira": _build_ef_diaria_primeira,
    "mensal-primeira": _build_ef_mensal_primeira,
    "diaria-colchao": _build_ef_diaria_colchao,
    "mensal-colchao": _build_ef_mensal_colchao,
    "diaria-colchao-vencimento": _build_ef_diaria_colchao_vencimento,
    "mensal-colchao-vencimento": _build_ef_mensal_colchao_vencimento,
    "mensal-agente-primeira": _build_ef_mensal_agente_primeira,
    "mensal-agente-colchao": _build_ef_mensal_agente_colchao,
    "mensal-agente-colchao-vencimento": _build_ef_mensal_agente_colchao_vencimento,
}


def _build_ef_resumo_sql(
    db: str,
    parcela_tipo: str,
    date_from_lit: str,  # YYYYMMDD, already validated via date.fromisoformat()
    date_to_lit: str,    # YYYYMMDD, already validated via date.fromisoformat()
    id_portfolio: Optional[int] = None,
) -> Tuple[str, str]:
    parcela_cond = "= 0" if parcela_tipo == "primeira" else "> 0"
    # dates embedded as YYYYMMDD literals — safe (validated upstream) and unambiguous in SQL Server
    portfolio_filter = "\n      AND R.ID_CARTEIRA = ?" if id_portfolio is not None else ""

    pago_expr = (
        "CASE WHEN DT_PAGAMENTO IS NOT NULL AND VR_PAGO > 0 "
        "AND DT_PAGAMENTO <= DATEADD(DAY, 5, DT_VENCIMENTO) "
        "THEN 1 ELSE 0 END"
    )
    recv_expr = (
        "CASE WHEN DT_PAGAMENTO IS NOT NULL AND VR_PAGO > 0 "
        "THEN VR_PAGO ELSE 0 END"
    )

    def _inner(database: str) -> str:
        return (
            f"    SELECT R.NR_RECEBIMENTO, R.VALOR, R.VR_PAGO, R.DT_PAGAMENTO, R.DT_VENCIMENTO\n"
            f"    FROM {database}.dbo.REC_MASTER (NOLOCK) R\n"
            f"    INNER JOIN {database}.dbo.USU_MASTER (NOLOCK) U ON R.ID_USUARIO = U.ID_USUARIO\n"
            f"    WHERE R.DT_VENCIMENTO >= CONVERT(DATE, '{date_from_lit}', 112)\n"
            f"      AND R.DT_VENCIMENTO <= CONVERT(DATE, '{date_to_lit}', 112)\n"
            f"      AND R.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}\n"
            f"      AND R.PARCELA {parcela_cond}{portfolio_filter}\n"
            f"      {_EF_AGENT_FILTER}"
        )

    inner = (
        f"{_inner(_EF_DB_A)}\n    UNION ALL\n{_inner(_EF_DB_C)}"
        if db == "todos"
        else _inner(db)
    )

    kpi_sql = f"""
SELECT
    COUNT(*) AS generated,
    COUNT(DISTINCT NR_RECEBIMENTO) AS total_acordos,
    SUM(CASE WHEN DT_VENCIMENTO >= CAST(GETDATE() AS DATE)
             AND (DT_PAGAMENTO IS NULL OR VR_PAGO = 0) THEN 1 ELSE 0 END) AS to_mature,
    SUM(CASE WHEN DT_VENCIMENTO < CAST(GETDATE() AS DATE)
             AND ({pago_expr}) = 0 THEN 1 ELSE 0 END) AS overdue_unpaid,
    SUM({pago_expr}) AS paid_on_time,
    CAST(100.0 * SUM({pago_expr}) / NULLIF(COUNT(*), 0) AS DECIMAL(8, 2)) AS conversion_pct,
    COALESCE(SUM(VALOR), 0) AS amount_maturing,
    COALESCE(SUM({recv_expr}), 0) AS amount_received,
    CAST(100.0 * SUM({recv_expr}) / NULLIF(SUM(VALOR), 0) AS DECIMAL(8, 2)) AS effectiveness_pct
FROM (
{inner}
) AS T
"""

    daily_sql = f"""
SELECT
    CAST(DT_VENCIMENTO AS DATE) AS dia,
    COUNT(*) AS generated,
    SUM({pago_expr}) AS paid_on_time,
    CAST(100.0 * SUM({pago_expr}) / NULLIF(COUNT(*), 0) AS DECIMAL(8, 2)) AS conversion_pct,
    COALESCE(SUM(VALOR), 0) AS amount_maturing,
    COALESCE(SUM({recv_expr}), 0) AS amount_received,
    CAST(100.0 * SUM({recv_expr}) / NULLIF(SUM(VALOR), 0) AS DECIMAL(8, 2)) AS effectiveness_pct
FROM (
{inner}
) AS T
GROUP BY CAST(DT_VENCIMENTO AS DATE)
ORDER BY dia
"""
    return kpi_sql, daily_sql


def _build_ef_resumo_params(
    db: str,
    id_portfolio: Optional[int] = None,
) -> Optional[Tuple[Any, ...]]:
    if id_portfolio is None:
        return None
    per_db: Tuple[Any, ...] = (id_portfolio,)
    return per_db + per_db if db == "todos" else per_db


def _build_ef_curva_quebra_query(db: str, date_from_lit: str, date_to_lit: str) -> str:
    """Curva de quebra por idade do boleto.

    Classifica cada boleto pela idade atual (dias desde o vencimento até hoje) e,
    por faixa, calcula o percentual já quebrado. Não usa DT_QUEBRA (data de
    registro de quebra), que concentrava artificialmente quebras nos dias 9-11
    por processo batch do COBweb.

    - total   = boletos da faixa (todos, por idade)
    - quebrados = boletos da faixa com ID_REC_STATUS = 2
    - taxa    = quebrados / total
    """
    def _one(database: str) -> str:
        return f"""
    SELECT
        R.ID_REC_STATUS,
        DATEDIFF(DAY, R.DT_VENCIMENTO, GETDATE()) AS dias_desde_vencimento
    FROM {database}.dbo.REC_MASTER R (NOLOCK)
    WHERE R.PARCELA = 0
      AND R.DT_VENCIMENTO >= CONVERT(DATE, '{date_from_lit}', 112)
      AND R.DT_VENCIMENTO <= CONVERT(DATE, '{date_to_lit}', 112)
      AND R.ID_REC_STATUS IN (1, 3, 12, 2)
"""

    inner = (
        f"{_one(_EF_DB_A)}\n    UNION ALL\n{_one(_EF_DB_C)}"
        if db == "todos"
        else _one(db)
    )

    return f"""
SELECT
    faixa,
    COUNT(*)                                                            AS total,
    SUM(CASE WHEN ID_REC_STATUS = 2 THEN 1 ELSE 0 END)                  AS quebrados,
    CAST(100.0 * SUM(CASE WHEN ID_REC_STATUS = 2 THEN 1 ELSE 0 END)
         / NULLIF(COUNT(*), 0) AS DECIMAL(5,1))                         AS taxa_quebra
FROM (
    SELECT
        ID_REC_STATUS,
        CASE
            WHEN dias_desde_vencimento BETWEEN 0  AND 5  THEN '0-5 dias'
            WHEN dias_desde_vencimento BETWEEN 6  AND 15 THEN '6-15 dias'
            WHEN dias_desde_vencimento BETWEEN 16 AND 30 THEN '16-30 dias'
            WHEN dias_desde_vencimento BETWEEN 31 AND 60 THEN '31-60 dias'
            WHEN dias_desde_vencimento >= 61             THEN '60+ dias'
        END AS faixa,
        CASE
            WHEN dias_desde_vencimento BETWEEN 0  AND 5  THEN 0
            WHEN dias_desde_vencimento BETWEEN 6  AND 15 THEN 1
            WHEN dias_desde_vencimento BETWEEN 16 AND 30 THEN 2
            WHEN dias_desde_vencimento BETWEEN 31 AND 60 THEN 3
            WHEN dias_desde_vencimento >= 61             THEN 4
        END AS ord
    FROM ({inner}) AS B
) AS T
WHERE faixa IS NOT NULL
GROUP BY faixa, ord
ORDER BY ord
"""