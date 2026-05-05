from typing import Optional

import config.settings as settings


def build_produtividade_query(db: str, *, use_distinct_esforco: bool) -> str:
    """
    Single source of truth para produtividade-por-agente de hoje.

    Parameters
    ----------
    db : str
        'COBwebRCBAUTOS', 'COBwebRCBCONSUMER' ou 'todos'.
        Quando use_distinct_esforco=True o caller sempre passa um single-db
        (o endpoint /produtividade-hoje não aceita 'todos').
    use_distinct_esforco : bool
        True  -> comportamento do antigo QUERY_PRODUTIVIDADE_HOJE:
                 esforço com COUNT(DISTINCT ID_CTO_MASTER), single-DB, colunas
                 valor_acordos / acordos_percentual, hint MAXDOP.
                 Usado por /produtividade-hoje e /status-carga.
        False -> comportamento do antigo QUERY_AGENTES_UNIFICADO_BASE /
                 get_query_comparacao_agentes: esforço com COUNT sem DISTINCT,
                 suporta 'todos' com coluna origem, colunas
                 valor_total_acordos / taxa_conversao e filtros extras
                 U.CHAVE NOT LIKE 'suporte%'/'SISTEMA%'.
                 Usado por /comparacao-agentes, /detalhamento-agentes e
                 /produtividade.
    """
    if use_distinct_esforco:
        return f"""
DECLARE @Hoje DATE = CAST(GETDATE() AS DATE);
DECLARE @Amanha DATE = DATEADD(DAY, 1, @Hoje);

WITH CTE_Acordos AS (
    SELECT
        RM.ID_USUARIO,
        RM.NR_RECEBIMENTO,
        RM.ID_REC_STATUS,
        SUM(RM.VALOR) AS VALOR_TOTAL_ACORDO,
        MAX(CASE WHEN RM.PARCELA = {settings.PRIMEIRA_PARCELA} THEN RM.VALOR ELSE 0 END) AS VALOR_P1,
        MAX(RM.PLANO) AS PLANO
    FROM REC_MASTER RM (NOLOCK)
    WHERE RM.DT_EMISSAO >= @Hoje AND RM.DT_EMISSAO < @Amanha
      AND RM.ID_REC_STATUS IN {settings.STATUS_UNIVERSO_SQL}
    GROUP BY RM.ID_USUARIO, RM.NR_RECEBIMENTO, RM.ID_REC_STATUS
),
CTE_Saldo_Original AS (
    SELECT
        RD.NR_RECEBIMENTO,
        SUM(ISNULL(DM.VR_SALDO, 0)) AS VR_ORIGINAL
    FROM REC_DIVIDAS RD (NOLOCK)
    JOIN DIV_MASTER DM (NOLOCK) ON RD.ID_DIVIDA = DM.ID_DIVIDA
    WHERE RD.NR_RECEBIMENTO IN (
        SELECT NR_RECEBIMENTO
        FROM REC_MASTER (NOLOCK)
        WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha
    )
    GROUP BY RD.NR_RECEBIMENTO
),
-- Pré-agrega valores financeiros por agente para evitar multiplicação de linhas
-- causada pelo JOIN entre CTO_MASTER (N acionamentos) e CTE_Acordos (M acordos).
CTE_Financeiro_Agente AS (
    SELECT
        A.ID_USUARIO,
        COUNT(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL} THEN 1 END)                                   AS qtd_acordos,
        SUM(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL} THEN A.VALOR_TOTAL_ACORDO ELSE 0 END)           AS valor_acordos,
        AVG(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL} THEN A.VALOR_TOTAL_ACORDO END)                  AS acordo_medio,
        AVG(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL} THEN CAST(A.PLANO AS DECIMAL(10,2)) END)        AS parcelamento_medio,
        AVG(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL} AND S.VR_ORIGINAL > 0
            THEN A.VALOR_TOTAL_ACORDO / S.VR_ORIGINAL * 100 END)                                                AS desconto_medio_percentual,
        SUM(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL} THEN A.VALOR_P1 ELSE 0 END)                    AS valor_primeira_parcela,
        COUNT(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL} THEN 1 END)                                     AS qtd_excecoes,
        SUM(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL} THEN A.VALOR_TOTAL_ACORDO ELSE 0 END)             AS valor_excecoes
    FROM CTE_Acordos A
    LEFT JOIN CTE_Saldo_Original S ON A.NR_RECEBIMENTO = S.NR_RECEBIMENTO
    GROUP BY A.ID_USUARIO
)
SELECT
    U.CHAVE,
    U.NOME,
    COUNT(DISTINCT CM.ID_CTO_MASTER) AS qtd_acionamentos,
    COUNT(DISTINCT CASE WHEN CM.ID_COMPLEMENTO IN {settings.CPC_IDS_SQL} THEN CM.ID_CTO_MASTER END) AS qtd_contatos,
    CAST(
        CEILING(
            COUNT(DISTINCT CASE WHEN CM.ID_COMPLEMENTO IN {settings.CPC_IDS_SQL} THEN CM.ID_CTO_MASTER END) * 100.0
        / NULLIF(COUNT(DISTINCT CM.ID_CTO_MASTER), 0)
        )
    AS INT) AS cpc_percentual,
    ISNULL(MAX(F.qtd_acordos), 0) AS qtd_acordos,
    CAST(
        ISNULL(MAX(F.qtd_acordos), 0) * 100.0
        / NULLIF(COUNT(DISTINCT CM.ID_CTO_MASTER), 0)
    AS DECIMAL(5,2)) AS acordos_percentual,
    CAST(ISNULL(MAX(F.valor_acordos), 0) AS DECIMAL(18,2)) AS valor_acordos,
    CAST(ISNULL(MAX(F.acordo_medio), 0) AS DECIMAL(18,2)) AS acordo_medio,
    CAST(ISNULL(MAX(F.parcelamento_medio), 0) AS DECIMAL(10,2)) AS parcelamento_medio,
    CAST(ISNULL(MAX(F.desconto_medio_percentual), 0) AS DECIMAL(10,2)) AS desconto_medio_percentual,
    CAST(ISNULL(MAX(F.valor_primeira_parcela), 0) AS DECIMAL(18,2)) AS valor_primeira_parcela,
    ISNULL(MAX(F.qtd_excecoes), 0) AS qtd_excecoes,
    CAST(ISNULL(MAX(F.valor_excecoes), 0) AS DECIMAL(18,2)) AS valor_excecoes
FROM CTO_MASTER CM (NOLOCK)
JOIN USU_MASTER U (NOLOCK)
    ON CM.ID_USUARIO = U.ID_USUARIO
LEFT JOIN CTE_Financeiro_Agente F
    ON U.ID_USUARIO = F.ID_USUARIO
WHERE
    CM.DATA >= @Hoje AND CM.DATA < @Amanha
    {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
GROUP BY
    U.CHAVE,
    U.NOME
ORDER BY
    qtd_acionamentos DESC
OPTION (USE HINT('ENABLE_PARALLEL_PLAN_PREFERENCE'), MAXDOP 0);
"""

    normalized = (db or "").strip().lower()
    if normalized == "cobwebrcbconsumer":
        usu_master = "SELECT ID_USUARIO, CHAVE, NOME, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.USU_MASTER (NOLOCK)"
        cto_master = "SELECT ID_USUARIO, ID_CTO_MASTER, ID_COMPLEMENTO, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.CTO_MASTER (NOLOCK) WHERE DATA >= @Hoje AND DATA < @Amanha"
        rec_master = "SELECT ID_USUARIO, NR_RECEBIMENTO, VALOR, PARCELA, ID_REC_STATUS, PLANO, ID_CARTEIRA, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.REC_MASTER (NOLOCK) WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha"
        rec_dividas = "SELECT NR_RECEBIMENTO, ID_DIVIDA, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.REC_DIVIDAS (NOLOCK)"
        div_master = "SELECT ID_DIVIDA, VR_SALDO, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.DIV_MASTER (NOLOCK)"
    elif normalized == "cobwebrcbautos":
        usu_master = "SELECT ID_USUARIO, CHAVE, NOME, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.USU_MASTER (NOLOCK)"
        cto_master = "SELECT ID_USUARIO, ID_CTO_MASTER, ID_COMPLEMENTO, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.CTO_MASTER (NOLOCK) WHERE DATA >= @Hoje AND DATA < @Amanha"
        rec_master = "SELECT ID_USUARIO, NR_RECEBIMENTO, VALOR, PARCELA, ID_REC_STATUS, PLANO, ID_CARTEIRA, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.REC_MASTER (NOLOCK) WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha"
        rec_dividas = "SELECT NR_RECEBIMENTO, ID_DIVIDA, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.REC_DIVIDAS (NOLOCK)"
        div_master = "SELECT ID_DIVIDA, VR_SALDO, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.DIV_MASTER (NOLOCK)"
    else:
        usu_master = """
            SELECT ID_USUARIO, CHAVE, NOME, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.USU_MASTER (NOLOCK)
            UNION ALL
            SELECT ID_USUARIO, CHAVE, NOME, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.USU_MASTER (NOLOCK)
        """
        cto_master = """
            SELECT ID_USUARIO, ID_CTO_MASTER, ID_COMPLEMENTO, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.CTO_MASTER (NOLOCK) WHERE DATA >= @Hoje AND DATA < @Amanha
            UNION ALL
            SELECT ID_USUARIO, ID_CTO_MASTER, ID_COMPLEMENTO, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.CTO_MASTER (NOLOCK) WHERE DATA >= @Hoje AND DATA < @Amanha
        """
        rec_master = """
            SELECT ID_USUARIO, NR_RECEBIMENTO, VALOR, PARCELA, ID_REC_STATUS, PLANO, ID_CARTEIRA, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.REC_MASTER (NOLOCK) WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha
            UNION ALL
            SELECT ID_USUARIO, NR_RECEBIMENTO, VALOR, PARCELA, ID_REC_STATUS, PLANO, ID_CARTEIRA, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.REC_MASTER (NOLOCK) WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha
        """
        rec_dividas = """
            SELECT NR_RECEBIMENTO, ID_DIVIDA, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.REC_DIVIDAS (NOLOCK)
            UNION ALL
            SELECT NR_RECEBIMENTO, ID_DIVIDA, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.REC_DIVIDAS (NOLOCK)
        """
        div_master = """
            SELECT ID_DIVIDA, VR_SALDO, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.DIV_MASTER (NOLOCK)
            UNION ALL
            SELECT ID_DIVIDA, VR_SALDO, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.DIV_MASTER (NOLOCK)
        """

    return f"""
DECLARE @Hoje DATE = CAST(GETDATE() AS DATE);
DECLARE @Amanha DATE = DATEADD(DAY, 1, @Hoje);

WITH CTE_Usuarios AS ({usu_master}),

CTE_Esforco AS (
    SELECT
        CM.ID_USUARIO,
        CM.origem,
        COUNT(CM.ID_CTO_MASTER) AS qtd_acionamentos,
        COUNT(CASE WHEN CM.ID_COMPLEMENTO IN {settings.CPC_IDS_SQL} THEN 1 END) AS qtd_contatos
    FROM ({cto_master}) CM
    GROUP BY CM.ID_USUARIO, CM.origem
),

CTE_Acordos_Unicos AS (
    SELECT
        R.ID_USUARIO, R.origem, R.NR_RECEBIMENTO, R.ID_REC_STATUS,
        SUM(R.VALOR) AS VALOR_TOTAL_ACORDO,
        MAX(CASE WHEN R.PARCELA = {settings.PRIMEIRA_PARCELA} THEN R.VALOR ELSE 0 END) AS VALOR_P1,
        MAX(R.PLANO) AS PLANO
    FROM ({rec_master}) R
    WHERE R.ID_REC_STATUS IN {settings.STATUS_UNIVERSO_SQL}
    GROUP BY R.ID_USUARIO, R.origem, R.NR_RECEBIMENTO, R.ID_REC_STATUS
),

CTE_Saldo_Original AS (
    SELECT
        RD.NR_RECEBIMENTO, RD.origem,
        SUM(ISNULL(DM.VR_SALDO, 0)) AS VR_ORIGINAL
    FROM ({rec_dividas}) RD
    JOIN ({div_master}) DM ON RD.ID_DIVIDA = DM.ID_DIVIDA AND RD.origem = DM.origem
    WHERE EXISTS (
        SELECT 1 FROM CTE_Acordos_Unicos A
        WHERE A.NR_RECEBIMENTO = RD.NR_RECEBIMENTO
          AND A.origem = RD.origem
    )
    GROUP BY RD.NR_RECEBIMENTO, RD.origem
),

CTE_Financeiro_Final AS (
    SELECT
        A.ID_USUARIO, A.origem,
        COUNT(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL} THEN A.NR_RECEBIMENTO END) AS qtd_acordos,
        SUM(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL} THEN A.VALOR_TOTAL_ACORDO ELSE 0 END) AS valor_total_acordos,
        AVG(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL} THEN A.VALOR_TOTAL_ACORDO END) AS acordo_medio,
        SUM(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL} THEN A.VALOR_P1 ELSE 0 END) AS valor_total_p1,
        AVG(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL} THEN CAST(A.PLANO AS DECIMAL(10,2)) END) AS parcelamento_medio,
        AVG(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL} AND S.VR_ORIGINAL > 0
            THEN A.VALOR_TOTAL_ACORDO / S.VR_ORIGINAL * 100
        END) AS desconto_medio,
        COUNT(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL} THEN A.NR_RECEBIMENTO END) AS qtd_excecoes,
        SUM(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL} THEN A.VALOR_TOTAL_ACORDO ELSE 0 END) AS valor_excecoes
    FROM CTE_Acordos_Unicos A
    LEFT JOIN CTE_Saldo_Original S ON A.NR_RECEBIMENTO = S.NR_RECEBIMENTO AND A.origem = S.origem
    GROUP BY A.ID_USUARIO, A.origem
)

SELECT
    U.origem,
    U.NOME,
    U.CHAVE,
    E.qtd_acionamentos,
    E.qtd_contatos,
    ISNULL(F.qtd_acordos, 0) AS qtd_acordos,
    CAST(ISNULL(F.valor_total_acordos, 0) AS DECIMAL(18,2)) AS valor_total_acordos,
    CAST(ISNULL(F.acordo_medio, 0) AS DECIMAL(18,2)) AS acordo_medio,
    CAST(ISNULL(F.parcelamento_medio, 0) AS DECIMAL(10,2)) AS parcelamento_medio,
    CAST(ISNULL(F.valor_total_p1, 0) AS DECIMAL(18,2)) AS valor_primeira_parcela,
    CAST(ISNULL(F.qtd_acordos, 0) * 100.0 / NULLIF(E.qtd_acionamentos, 0) AS DECIMAL(18,2)) AS taxa_conversao,
    CAST(CEILING(ISNULL(E.qtd_contatos, 0) * 100.0 / NULLIF(E.qtd_acionamentos, 0)) AS INT) AS cpc_percentual,
    CAST(ISNULL(F.desconto_medio, 0) AS DECIMAL(10,2)) AS desconto_medio_percentual,
    ISNULL(F.qtd_excecoes, 0) AS qtd_excecoes,
    CAST(ISNULL(F.valor_excecoes, 0) AS DECIMAL(18,2)) AS valor_excecoes
FROM CTE_Esforco E
JOIN CTE_Usuarios U ON E.ID_USUARIO = U.ID_USUARIO AND E.origem = U.origem
LEFT JOIN CTE_Financeiro_Final F ON E.ID_USUARIO = F.ID_USUARIO AND E.origem = F.origem
WHERE
    E.qtd_acionamentos > 0
    {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
    AND U.CHAVE NOT LIKE 'suporte%'
    AND U.CHAVE NOT LIKE 'SISTEMA%'
ORDER BY E.qtd_acionamentos DESC;
"""


def build_produtividade_agentes_query() -> str:
    return f"""
SELECT
    UM.CHAVE                         AS LOGIN_AGENTE,
    UM.NOME                          AS NOME_AGENTE,
    COUNT(DISTINCT CM.ID_CTO_MASTER) AS QTD_ACIONAMENTOS,
    COUNT(DISTINCT CASE
        WHEN CM.ID_COMPLEMENTO IN {settings.CPC_IDS_SQL}
        THEN CM.ID_CTO_MASTER
    END)                             AS QTD_CONTATOS
FROM dbo.CTO_MASTER CM
JOIN dbo.USU_MASTER U ON U.ID_USUARIO = CM.ID_USUARIO
JOIN dbo.USU_MASTER UM ON UM.ID_USUARIO = CM.ID_USUARIO
WHERE CM.DATA >= CAST(GETDATE() AS DATE)
  AND CM.DATA <  CAST(DATEADD(DAY, 1, GETDATE()) AS DATE)
  {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
GROUP BY UM.CHAVE, UM.NOME
"""


def normalize_agent_key(login: Optional[str], name: Optional[str]) -> str:
    """Unification key across databases. Prefers CHAVE (login) over NOME."""
    base = (login or "").strip().upper()
    if base:
        return base
    return (name or "").strip().upper()
