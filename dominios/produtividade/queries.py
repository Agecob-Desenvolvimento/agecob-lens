from typing import Any, Optional, Tuple

import config.settings as settings


def _date_decl(date_from: Optional[str], date_to_exclusive: Optional[str]) -> str:
    if date_from and date_to_exclusive:
        df = date_from.replace("-", "")
        dt = date_to_exclusive.replace("-", "")
        return f"DECLARE @Hoje DATE = '{df}'; DECLARE @Amanha DATE = '{dt}';"
    return "DECLARE @Hoje DATE = CAST(GETDATE() AS DATE); DECLARE @Amanha DATE = DATEADD(DAY, 1, @Hoje);"


def build_produtividade_query(
    db: str,
    *,
    use_distinct_esforco: bool,
    date_from: Optional[str] = None,
    date_to_exclusive: Optional[str] = None,
    portfolio: Optional[str] = None,
) -> str:
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
    # Filtro por portfólio (DIV_AUX.CAMPO010) via REC_DIVIDAS. EXISTS preserva a
    # cardinalidade (não multiplica linhas) — apropriado p/ filtro, ADR-004.
    # Chave composta (NR_RECEBIMENTO, ID_CARTEIRA): sem ID_CARTEIRA, um
    # NR_RECEBIMENTO presente em mais de uma carteira casa pela carteira ERRADA e
    # infla qtd_acordos/valor_acordos/valor_primeira_parcela do portfólio filtrado.
    # Todo o resto do código resolve portfólio assim — ver o CROSS APPLY em
    # dominios/graficos/queries.py e o índice IX_REC_DIVIDAS_NR_CARTEIRA, cujo
    # propósito documentado é exatamente a chave composta (config/settings.py).
    cart_filter = (
        "AND EXISTS (SELECT 1 FROM REC_DIVIDAS RD2 (NOLOCK) "
        "JOIN DIV_AUX DA2 (NOLOCK) ON RD2.ID_DIVIDA = DA2.ID_DIVIDA "
        "WHERE RD2.NR_RECEBIMENTO = RM.NR_RECEBIMENTO "
        "AND RD2.ID_CARTEIRA = RM.ID_CARTEIRA "
        f"AND DA2.{settings.PORTFOLIO_COLUMN} = ?)"
    ) if portfolio else ""

    if use_distinct_esforco:
        return f"""
{_date_decl(date_from, date_to_exclusive)}

WITH CTE_Acordos AS (
    SELECT
        RM.ID_USUARIO,
        RM.NR_RECEBIMENTO,
        RM.ID_REC_STATUS,
        SUM(RM.VALOR) AS VALOR_TOTAL_ACORDO,
        MAX(CASE WHEN RM.PARCELA = {settings.PRIMEIRA_PARCELA} THEN RM.VALOR ELSE 0 END) AS VALOR_P1,
        MAX(CASE WHEN RM.PARCELA = {settings.PRIMEIRA_PARCELA} THEN RM.VR_PAGO ELSE 0 END) AS VR_PAGO_P1,
        MAX(RM.PLANO) AS PLANO
    FROM REC_MASTER RM (NOLOCK)
     WHERE RM.DT_EMISSAO >= @Hoje AND RM.DT_EMISSAO < @Amanha
       AND (RM.ID_REC_STATUS IN {settings.STATUS_UNIVERSO_SQL}
            OR RM.ID_REC_STATUS IN {settings.STATUS_REJEITADO_SQL})
       {cart_filter}
     GROUP BY RM.ID_USUARIO, RM.NR_RECEBIMENTO, RM.ID_REC_STATUS
),
CTE_Saldo_Original AS (
    SELECT
        RD.NR_RECEBIMENTO,
        SUM(ISNULL(DM.VR_SALDO, 0)) AS VR_ORIGINAL,
        MIN(DM.DT_VENCIMENTO) AS DT_VENC_DIV
    FROM REC_DIVIDAS RD (NOLOCK)
    JOIN DIV_MASTER DM (NOLOCK) ON RD.ID_DIVIDA = DM.ID_DIVIDA
     WHERE RD.NR_RECEBIMENTO IN (
         SELECT RM.NR_RECEBIMENTO
         FROM REC_MASTER RM (NOLOCK)
         WHERE RM.DT_EMISSAO >= @Hoje AND RM.DT_EMISSAO < @Amanha
           {cart_filter}
     )
    GROUP BY RD.NR_RECEBIMENTO
),
-- Pré-agrega valores financeiros por agente para evitar multiplicação de linhas
-- causada pelo JOIN entre CTO_MASTER (N acionamentos) e CTE_Acordos (M acordos).
CTE_Financeiro_Agente AS (
    SELECT
        A.ID_USUARIO,
        COUNT(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL} THEN 1 END)                                   AS qtd_acordos,
        SUM(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL} THEN A.VALOR_TOTAL_ACORDO ELSE 0 END)           AS valor_acordos,
        AVG(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL} THEN A.VALOR_TOTAL_ACORDO END)                  AS acordo_medio,
        AVG(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL} THEN CAST(A.PLANO AS DECIMAL(10,2)) END)        AS parcelamento_medio,
        AVG(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL} AND S.VR_ORIGINAL > 0
            THEN A.VALOR_TOTAL_ACORDO / S.VR_ORIGINAL * 100 END)                                                AS desconto_medio_percentual,
        SUM(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL} THEN A.VALOR_P1 ELSE 0 END)                    AS valor_primeira_parcela,
        SUM(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL} THEN A.VR_PAGO_P1 ELSE 0 END)                  AS valor_p1_recebido,
        COUNT(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL} THEN 1 END)                                     AS qtd_excecoes,
        SUM(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL} THEN A.VALOR_TOTAL_ACORDO ELSE 0 END)             AS valor_excecoes,
        SUM(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL} THEN A.VALOR_P1 ELSE 0 END)                       AS valor_primeira_parcela_excecoes,
        COUNT(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_REJEITADO_SQL} THEN 1 END)                                   AS qtd_rejeitados,
        SUM(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_REJEITADO_SQL} THEN A.VALOR_TOTAL_ACORDO ELSE 0 END)           AS valor_rejeitados,
        AVG(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}
            THEN DATEDIFF(DAY, S.DT_VENC_DIV, @Hoje) END)                                                       AS idade_media_acordos
    FROM CTE_Acordos A
    LEFT JOIN CTE_Saldo_Original S ON A.NR_RECEBIMENTO = S.NR_RECEBIMENTO
    GROUP BY A.ID_USUARIO
),
-- Esforço (acionamentos/alô/contato) pré-agregado por agente. Separado da tabela
-- final para o agente com acordo gerado hoje mas sem acionamento no mesmo dia
-- (ex.: renegociação automática) não sumir do resultado — CTO_MASTER deixa de
-- ser a tabela-âncora (era JOIN direto, excluía quem tinha F mas não tinha CM).
CTE_Esforco_Agente AS (
    SELECT
        CM.ID_USUARIO,
        COUNT(DISTINCT CM.ID_DEV) AS qtd_acionamentos,
        COUNT(DISTINCT CASE WHEN CC.ALO = 1 THEN CM.ID_DEV END) AS qtd_alo,
        COUNT(DISTINCT CASE WHEN CC.ALO = 1 AND CC.COD_COMPLEMENTO IN {settings.CPC_CODS_SQL} THEN CM.ID_DEV END) AS qtd_contatos
    FROM CTO_MASTER CM (NOLOCK)
    LEFT JOIN CTO_COMPLEMENTO CC (NOLOCK) ON CM.ID_COMPLEMENTO = CC.ID_COMPLEMENTO
    WHERE CM.DATA >= @Hoje AND CM.DATA < @Amanha
    GROUP BY CM.ID_USUARIO
),
-- Proxy de horas trabalhadas: janela intradiária entre o primeiro e o último
-- acordo aprovado de cada dia (MAX-MIN de DT_EMISSAO). Somado por dia para não
-- contar o intervalo de um dia para o outro.
CTE_Horas_Agente AS (
    SELECT
        ID_USUARIO,
        SUM(DATEDIFF(SECOND, dia_min, dia_max)) / 3600.0 AS horas_trabalhadas
    FROM (
        SELECT
            RM.ID_USUARIO,
            CAST(RM.DT_EMISSAO AS DATE) AS dia,
            MIN(RM.DT_EMISSAO) AS dia_min,
            MAX(RM.DT_EMISSAO) AS dia_max
         FROM REC_MASTER RM (NOLOCK)
         WHERE RM.DT_EMISSAO >= @Hoje AND RM.DT_EMISSAO < @Amanha
           AND RM.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}
           {cart_filter}
         GROUP BY RM.ID_USUARIO, CAST(RM.DT_EMISSAO AS DATE)
    ) d
    GROUP BY ID_USUARIO
),
-- Boletos emitidos vs pagos no prazo (5d do venc.) por agente — base da Conversão.
-- "Emitido" = boleto vencido (DT_VENCIMENTO < hoje) de acordo gerado (inclui quebras). Parcelas
-- ainda não vencidas não entram: não há como ter sido pagas no prazo ainda.
CTE_Boletos_Agente AS (
    SELECT
        RM.ID_USUARIO,
        COUNT(*) AS qtd_boletos_emitidos,
        SUM({settings.BOLETO_PAGO_PRAZO_SQL}) AS qtd_boletos_pagos
     FROM REC_MASTER RM (NOLOCK)
     WHERE RM.DT_EMISSAO >= @Hoje AND RM.DT_EMISSAO < @Amanha
       AND RM.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}
       AND RM.DT_VENCIMENTO < CAST(GETDATE() AS DATE)
       {cart_filter}
     GROUP BY RM.ID_USUARIO
)
SELECT
    U.CHAVE,
    U.NOME,
    -- qtd_acionamentos = devedores únicos acionados no dia (dedupe por ID_DEV)
    ISNULL(E.qtd_acionamentos, 0) AS qtd_acionamentos,
    -- Alô = alguém atendeu (CTO_COMPLEMENTO.ALO=1). Etapa do funil entre
    -- acionamento e contato/RPC.
    ISNULL(E.qtd_alo, 0) AS qtd_alo,
    -- Contato (RPC) = falou com a pessoa certa (CPC_COMPLEMENTO_CODS curado).
    ISNULL(E.qtd_contatos, 0) AS qtd_contatos,
    CAST(
        CEILING(ISNULL(E.qtd_contatos, 0) * 100.0 / NULLIF(E.qtd_alo, 0))
    AS INT) AS cpc_percentual,
    ISNULL(F.qtd_acordos, 0) AS qtd_acordos,
    ISNULL(BA.qtd_boletos_emitidos, 0) AS qtd_boletos_emitidos,
    ISNULL(BA.qtd_boletos_pagos, 0) AS qtd_boletos_pagos,
    CAST(
        ISNULL(F.qtd_acordos, 0) * 100.0 / NULLIF(E.qtd_acionamentos, 0)
    AS DECIMAL(5,2)) AS acordos_percentual,
    CAST(ISNULL(F.valor_acordos, 0) AS DECIMAL(18,2)) AS valor_acordos,
    CAST(ISNULL(F.acordo_medio, 0) AS DECIMAL(18,2)) AS acordo_medio,
    CAST(ISNULL(F.parcelamento_medio, 0) AS DECIMAL(10,2)) AS parcelamento_medio,
    CAST(ISNULL(F.desconto_medio_percentual, 0) AS DECIMAL(10,2)) AS desconto_medio_percentual,
    CAST(ISNULL(F.valor_primeira_parcela, 0) AS DECIMAL(18,2)) AS valor_primeira_parcela,
    CAST(ISNULL(F.valor_p1_recebido, 0) AS DECIMAL(18,2)) AS valor_p1_recebido,
    ISNULL(F.qtd_excecoes, 0) AS qtd_excecoes,
    CAST(ISNULL(F.valor_excecoes, 0) AS DECIMAL(18,2)) AS valor_excecoes,
    CAST(ISNULL(F.valor_primeira_parcela_excecoes, 0) AS DECIMAL(18,2)) AS valor_primeira_parcela_excecoes,
    ISNULL(F.qtd_rejeitados, 0) AS qtd_rejeitados,
    CAST(ISNULL(F.valor_rejeitados, 0) AS DECIMAL(18,2)) AS valor_rejeitados,
    CAST(ISNULL(F.idade_media_acordos, 0) AS DECIMAL(10,1)) AS idade_media_acordos,
    CAST(ISNULL(H.horas_trabalhadas, 0) AS DECIMAL(10,2)) AS horas_trabalhadas
FROM USU_MASTER U (NOLOCK)
LEFT JOIN CTE_Esforco_Agente E
    ON U.ID_USUARIO = E.ID_USUARIO
LEFT JOIN CTE_Financeiro_Agente F
    ON U.ID_USUARIO = F.ID_USUARIO
LEFT JOIN CTE_Horas_Agente H
    ON U.ID_USUARIO = H.ID_USUARIO
LEFT JOIN CTE_Boletos_Agente BA
    ON U.ID_USUARIO = BA.ID_USUARIO
WHERE
    (E.ID_USUARIO IS NOT NULL OR F.ID_USUARIO IS NOT NULL)
    {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
ORDER BY
    qtd_acionamentos DESC
OPTION (USE HINT('ENABLE_PARALLEL_PLAN_PREFERENCE'), MAXDOP 0);
"""

    normalized = (db or "").strip().lower()
    if normalized == "cobwebrcbconsumer":
        usu_master = "SELECT ID_USUARIO, CHAVE, NOME, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.USU_MASTER (NOLOCK)"
        cto_master = f"SELECT CM2.ID_USUARIO, CM2.ID_CTO_MASTER, CM2.ID_COMPLEMENTO, CM2.ID_DEV, CM2.DATA, CASE WHEN CC.ALO = 1 AND CC.COD_COMPLEMENTO IN {settings.CPC_CODS_SQL} THEN 1 ELSE 0 END AS contato, CASE WHEN CC.ALO = 1 THEN 1 ELSE 0 END AS alo, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.CTO_MASTER CM2 (NOLOCK) LEFT JOIN COBwebRCBCONSUMER.dbo.CTO_COMPLEMENTO CC (NOLOCK) ON CM2.ID_COMPLEMENTO = CC.ID_COMPLEMENTO WHERE CM2.DATA >= @Hoje AND CM2.DATA < @Amanha"
        rec_master = "SELECT ID_USUARIO, NR_RECEBIMENTO, VALOR, PARCELA, ID_REC_STATUS, PLANO, ID_CARTEIRA, VR_PAGO, DT_PAGAMENTO, DT_VENCIMENTO, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.REC_MASTER (NOLOCK) WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha"
        rec_dividas = "SELECT NR_RECEBIMENTO, ID_DIVIDA, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.REC_DIVIDAS (NOLOCK)"
        div_master = "SELECT ID_DIVIDA, VR_SALDO, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.DIV_MASTER (NOLOCK)"
    elif normalized == "cobwebrcbautos":
        usu_master = "SELECT ID_USUARIO, CHAVE, NOME, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.USU_MASTER (NOLOCK)"
        cto_master = f"SELECT CM2.ID_USUARIO, CM2.ID_CTO_MASTER, CM2.ID_COMPLEMENTO, CM2.ID_DEV, CM2.DATA, CASE WHEN CC.ALO = 1 AND CC.COD_COMPLEMENTO IN {settings.CPC_CODS_SQL} THEN 1 ELSE 0 END AS contato, CASE WHEN CC.ALO = 1 THEN 1 ELSE 0 END AS alo, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.CTO_MASTER CM2 (NOLOCK) LEFT JOIN COBwebRCBAUTOS.dbo.CTO_COMPLEMENTO CC (NOLOCK) ON CM2.ID_COMPLEMENTO = CC.ID_COMPLEMENTO WHERE CM2.DATA >= @Hoje AND CM2.DATA < @Amanha"
        rec_master = "SELECT ID_USUARIO, NR_RECEBIMENTO, VALOR, PARCELA, ID_REC_STATUS, PLANO, ID_CARTEIRA, VR_PAGO, DT_PAGAMENTO, DT_VENCIMENTO, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.REC_MASTER (NOLOCK) WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha"
        rec_dividas = "SELECT NR_RECEBIMENTO, ID_DIVIDA, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.REC_DIVIDAS (NOLOCK)"
        div_master = "SELECT ID_DIVIDA, VR_SALDO, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.DIV_MASTER (NOLOCK)"
    else:
        usu_master = """
            SELECT ID_USUARIO, CHAVE, NOME, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.USU_MASTER (NOLOCK)
            UNION ALL
            SELECT ID_USUARIO, CHAVE, NOME, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.USU_MASTER (NOLOCK)
        """
        cto_master = f"""
            SELECT CM2.ID_USUARIO, CM2.ID_CTO_MASTER, CM2.ID_COMPLEMENTO, CM2.ID_DEV, CM2.DATA, CASE WHEN CC.ALO = 1 AND CC.COD_COMPLEMENTO IN {settings.CPC_CODS_SQL} THEN 1 ELSE 0 END AS contato, CASE WHEN CC.ALO = 1 THEN 1 ELSE 0 END AS alo, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.CTO_MASTER CM2 (NOLOCK) LEFT JOIN COBwebRCBCONSUMER.dbo.CTO_COMPLEMENTO CC (NOLOCK) ON CM2.ID_COMPLEMENTO = CC.ID_COMPLEMENTO WHERE CM2.DATA >= @Hoje AND CM2.DATA < @Amanha
            UNION ALL
            SELECT CM2.ID_USUARIO, CM2.ID_CTO_MASTER, CM2.ID_COMPLEMENTO, CM2.ID_DEV, CM2.DATA, CASE WHEN CC.ALO = 1 AND CC.COD_COMPLEMENTO IN {settings.CPC_CODS_SQL} THEN 1 ELSE 0 END AS contato, CASE WHEN CC.ALO = 1 THEN 1 ELSE 0 END AS alo, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.CTO_MASTER CM2 (NOLOCK) LEFT JOIN COBwebRCBAUTOS.dbo.CTO_COMPLEMENTO CC (NOLOCK) ON CM2.ID_COMPLEMENTO = CC.ID_COMPLEMENTO WHERE CM2.DATA >= @Hoje AND CM2.DATA < @Amanha
        """
        rec_master = """
            SELECT ID_USUARIO, NR_RECEBIMENTO, VALOR, PARCELA, ID_REC_STATUS, PLANO, ID_CARTEIRA, VR_PAGO, DT_PAGAMENTO, DT_VENCIMENTO, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.REC_MASTER (NOLOCK) WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha
            UNION ALL
            SELECT ID_USUARIO, NR_RECEBIMENTO, VALOR, PARCELA, ID_REC_STATUS, PLANO, ID_CARTEIRA, VR_PAGO, DT_PAGAMENTO, DT_VENCIMENTO, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.REC_MASTER (NOLOCK) WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha
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
{_date_decl(date_from, date_to_exclusive)}

WITH CTE_Usuarios AS ({usu_master}),

-- Dedup (agente, dia, ID_DEV): mesmo cliente acionado várias vezes no mesmo
-- dia pelo mesmo agente conta 1. Mantém contagem por dia distinta.
CTE_Esforco_Dedup AS (
    SELECT
        CM.ID_USUARIO,
        CM.origem,
        CAST(CM.DATA AS DATE) AS dia,
        CM.ID_DEV,
        MAX(CM.contato) AS teve_contato,
        MAX(CM.alo)     AS teve_alo
    FROM ({cto_master}) CM
    GROUP BY CM.ID_USUARIO, CM.origem, CAST(CM.DATA AS DATE), CM.ID_DEV
),
CTE_Esforco AS (
    SELECT
        ID_USUARIO,
        origem,
        COUNT(*) AS qtd_acionamentos,
        SUM(teve_contato) AS qtd_contatos,
        SUM(teve_alo)     AS qtd_alo
    FROM CTE_Esforco_Dedup
    GROUP BY ID_USUARIO, origem
),

CTE_Acordos_Unicos AS (
    SELECT
        R.ID_USUARIO, R.origem, R.NR_RECEBIMENTO, R.ID_REC_STATUS,
        SUM(R.VALOR) AS VALOR_TOTAL_ACORDO,
        MAX(CASE WHEN R.PARCELA = {settings.PRIMEIRA_PARCELA} THEN R.VALOR ELSE 0 END) AS VALOR_P1,
        MAX(CASE WHEN R.PARCELA = {settings.PRIMEIRA_PARCELA} THEN R.VR_PAGO ELSE 0 END) AS VR_PAGO_P1,
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
        COUNT(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL} THEN A.NR_RECEBIMENTO END) AS qtd_acordos,
        SUM(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL} THEN A.VALOR_TOTAL_ACORDO ELSE 0 END) AS valor_total_acordos,
        AVG(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL} THEN A.VALOR_TOTAL_ACORDO END) AS acordo_medio,
        SUM(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL} THEN A.VALOR_P1 ELSE 0 END) AS valor_total_p1,
        SUM(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL} THEN A.VR_PAGO_P1 ELSE 0 END) AS valor_p1_recebido,
        AVG(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL} THEN CAST(A.PLANO AS DECIMAL(10,2)) END) AS parcelamento_medio,
        AVG(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL} AND S.VR_ORIGINAL > 0
            THEN A.VALOR_TOTAL_ACORDO / S.VR_ORIGINAL * 100
        END) AS desconto_medio,
        COUNT(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL} THEN A.NR_RECEBIMENTO END) AS qtd_excecoes,
        SUM(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL} THEN A.VALOR_TOTAL_ACORDO ELSE 0 END) AS valor_excecoes,
        SUM(CASE WHEN A.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL} THEN A.VALOR_P1 ELSE 0 END) AS valor_primeira_parcela_excecoes
    FROM CTE_Acordos_Unicos A
    LEFT JOIN CTE_Saldo_Original S ON A.NR_RECEBIMENTO = S.NR_RECEBIMENTO AND A.origem = S.origem
    GROUP BY A.ID_USUARIO, A.origem
),

-- Boletos emitidos vs pagos no prazo (5d do venc.) por agente — base da Conversão.
-- "Emitido" = boleto vencido (DT_VENCIMENTO < hoje) de acordo gerado (inclui quebras). Parcelas
-- ainda não vencidas não entram: não há como ter sido pagas no prazo ainda.
CTE_Boletos AS (
    SELECT
        R.ID_USUARIO, R.origem,
        COUNT(*) AS qtd_boletos_emitidos,
        SUM({settings.BOLETO_PAGO_PRAZO_SQL}) AS qtd_boletos_pagos
    FROM ({rec_master}) R
    WHERE R.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}
      AND R.DT_VENCIMENTO < CAST(GETDATE() AS DATE)
    GROUP BY R.ID_USUARIO, R.origem
)

SELECT
    U.origem,
    U.NOME,
    U.CHAVE,
    -- ISNULL porque CTE_Esforco virou LEFT JOIN: o agente com acordo e sem
    -- acionamento no dia agora aparece, com esforço zerado em vez de sumir.
    ISNULL(E.qtd_acionamentos, 0) AS qtd_acionamentos,
    ISNULL(E.qtd_alo, 0) AS qtd_alo,
    ISNULL(E.qtd_contatos, 0) AS qtd_contatos,
    ISNULL(F.qtd_acordos, 0) AS qtd_acordos,
    ISNULL(B.qtd_boletos_emitidos, 0) AS qtd_boletos_emitidos,
    ISNULL(B.qtd_boletos_pagos, 0) AS qtd_boletos_pagos,
    CAST(ISNULL(F.valor_total_acordos, 0) AS DECIMAL(18,2)) AS valor_total_acordos,
    CAST(ISNULL(F.acordo_medio, 0) AS DECIMAL(18,2)) AS acordo_medio,
    CAST(ISNULL(F.parcelamento_medio, 0) AS DECIMAL(10,2)) AS parcelamento_medio,
    CAST(ISNULL(F.valor_total_p1, 0) AS DECIMAL(18,2)) AS valor_primeira_parcela,
    CAST(ISNULL(F.valor_p1_recebido, 0) AS DECIMAL(18,2)) AS valor_p1_recebido,
    -- pagos/emitidos = efetividade do boleto, NAO Conversao. Conversao oficial e
    -- qtd_acordos/qtd_contatos (docs/data-layer.md). O nome antigo era
    -- taxa_conversao e nao tinha consumidor no frontend.
    CAST(100.0 * ISNULL(B.qtd_boletos_pagos, 0) / NULLIF(B.qtd_boletos_emitidos, 0) AS DECIMAL(18,2)) AS efetividade_boleto_pct,
    CAST(CEILING(ISNULL(E.qtd_contatos, 0) * 100.0 / NULLIF(E.qtd_alo, 0)) AS INT) AS cpc_percentual,
    CAST(ISNULL(F.desconto_medio, 0) AS DECIMAL(10,2)) AS desconto_medio_percentual,
    ISNULL(F.qtd_excecoes, 0) AS qtd_excecoes,
    CAST(ISNULL(F.valor_excecoes, 0) AS DECIMAL(18,2)) AS valor_excecoes,
    CAST(ISNULL(F.valor_primeira_parcela_excecoes, 0) AS DECIMAL(18,2)) AS valor_primeira_parcela_excecoes
-- Âncora em CTE_Usuarios, espelhando o branch use_distinct_esforco=True. Antes
-- ancorava em CTE_Esforco com qtd_acionamentos > 0, então o agente que gerou
-- acordo mas não acionou no mesmo dia (ex.: renegociação automática) sumia de
-- /comparacao-agentes, /detalhamento-agentes e /produtividade — o mesmo defeito
-- que o outro branch já tinha corrigido.
FROM CTE_Usuarios U
LEFT JOIN CTE_Esforco E ON U.ID_USUARIO = E.ID_USUARIO AND U.origem = E.origem
LEFT JOIN CTE_Financeiro_Final F ON U.ID_USUARIO = F.ID_USUARIO AND U.origem = F.origem
LEFT JOIN CTE_Boletos B ON U.ID_USUARIO = B.ID_USUARIO AND U.origem = B.origem
WHERE
    (E.ID_USUARIO IS NOT NULL OR F.ID_USUARIO IS NOT NULL)
    {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
    AND U.CHAVE NOT LIKE 'suporte%'
    AND U.CHAVE NOT LIKE 'SISTEMA%'
ORDER BY qtd_acionamentos DESC
OPTION (USE HINT('ENABLE_PARALLEL_PLAN_PREFERENCE'), MAXDOP 0);
"""


def build_produtividade_hoje_params(portfolio: Optional[str]) -> Optional[Tuple[Any, ...]]:
    """Params tuple for build_produtividade_query with use_distinct_esforco=True."""
    if portfolio:
        # One `?` per REC_MASTER reference → 4 placeholders
        return (portfolio, portfolio, portfolio, portfolio)
    return None


def build_produtividade_agentes_query() -> str:
    return f"""
SELECT
    UM.CHAVE                         AS LOGIN_AGENTE,
    UM.NOME                          AS NOME_AGENTE,
    -- devedores únicos acionados (dedupe por ID_DEV no dia)
    COUNT(DISTINCT CM.ID_DEV)        AS QTD_ACIONAMENTOS,
    COUNT(DISTINCT CASE
        WHEN CC.ALO = 1
        THEN CM.ID_DEV
    END)                             AS QTD_ALO,
    COUNT(DISTINCT CASE
        WHEN CC.ALO = 1 AND CC.COD_COMPLEMENTO IN {settings.CPC_CODS_SQL}
        THEN CM.ID_DEV
    END)                             AS QTD_CONTATOS
FROM dbo.CTO_MASTER CM (NOLOCK)
JOIN dbo.USU_MASTER U (NOLOCK) ON U.ID_USUARIO = CM.ID_USUARIO
JOIN dbo.USU_MASTER UM (NOLOCK) ON UM.ID_USUARIO = CM.ID_USUARIO
LEFT JOIN dbo.CTO_COMPLEMENTO CC (NOLOCK) ON CM.ID_COMPLEMENTO = CC.ID_COMPLEMENTO
WHERE CM.DATA >= CAST(GETDATE() AS DATE)
  AND CM.DATA <  CAST(DATEADD(DAY, 1, GETDATE()) AS DATE)
  {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
GROUP BY UM.CHAVE, UM.NOME
"""


def build_benchmark_query(db: str, lookback_months: int = 3) -> str:
    """
    Métricas médias históricas por agente (janela de lookback) para cálculo de
    benchmarks internos (quartis). Sempre por banco individual — não aceita 'todos'
    (AUTOS e CONSUMER são realidades distintas).
    """
    if db == "todos":
        raise ValueError("Benchmarks devem ser consultados por banco individual")

    return f"""
DECLARE @Hoje DATE = CAST(GETDATE() AS DATE);
DECLARE @LookbackStart DATE = DATEADD(MONTH, -{lookback_months}, @Hoje);

WITH CTE_Esforco_Diario AS (
    SELECT
        CM.ID_USUARIO,
        CAST(CM.DATA AS DATE) AS dia,
        CM.ID_DEV,
        MAX(CASE WHEN CC.ALO = 1 AND CC.COD_COMPLEMENTO IN {settings.CPC_CODS_SQL} THEN 1 ELSE 0 END) AS teve_contato,
        MAX(CASE WHEN CC.ALO = 1 THEN 1 ELSE 0 END) AS teve_alo
    FROM dbo.CTO_MASTER CM (NOLOCK)
    LEFT JOIN dbo.CTO_COMPLEMENTO CC (NOLOCK) ON CM.ID_COMPLEMENTO = CC.ID_COMPLEMENTO
    WHERE CM.DATA >= @LookbackStart AND CM.DATA < @Hoje
    GROUP BY CM.ID_USUARIO, CAST(CM.DATA AS DATE), CM.ID_DEV
),
CTE_Esforco_Dia AS (
    SELECT
        ID_USUARIO,
        dia,
        COUNT(*) AS qtd_acionamentos,
        SUM(teve_contato) AS qtd_contatos,
        SUM(teve_alo)     AS qtd_alo
    FROM CTE_Esforco_Diario
    GROUP BY ID_USUARIO, dia
    HAVING COUNT(*) >= 5
),
CTE_Acordos_Diario AS (
    SELECT
        R.ID_USUARIO,
        CAST(R.DT_EMISSAO AS DATE) AS dia,
        SUM(R.VALOR) AS valor_total_acordos,
        COUNT(DISTINCT CASE WHEN R.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}
            THEN R.NR_RECEBIMENTO END) AS qtd_acordos,
        SUM(CASE WHEN R.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}
                 AND R.PARCELA = {settings.PRIMEIRA_PARCELA}
            THEN R.VALOR ELSE 0 END) AS valor_p1,
        SUM(CASE WHEN R.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}
                 AND R.PARCELA = {settings.PRIMEIRA_PARCELA}
            THEN R.VR_PAGO ELSE 0 END) AS valor_p1_recebido,
        SUM(CASE WHEN R.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}
                 AND R.DT_VENCIMENTO < @Hoje
            THEN 1 ELSE 0 END) AS qtd_boletos_emitidos,
        SUM(CASE WHEN R.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL}
            THEN R.VALOR ELSE 0 END) AS valor_excecoes
    FROM dbo.REC_MASTER R (NOLOCK)
    WHERE R.DT_EMISSAO >= @LookbackStart AND R.DT_EMISSAO < @Hoje
      AND R.ID_REC_STATUS IN {settings.STATUS_UNIVERSO_SQL}
    GROUP BY R.ID_USUARIO, CAST(R.DT_EMISSAO AS DATE)
)
SELECT
    U.CHAVE,
    U.NOME,
    SUM(E.qtd_contatos) * 100.0 / NULLIF(SUM(E.qtd_alo), 0) AS avg_taxa_contato,
    ISNULL(SUM(A.qtd_acordos), 0) * 100.0
        / NULLIF(SUM(E.qtd_contatos), 0) AS avg_taxa_conversao,
    ISNULL(SUM(A.valor_p1_recebido), 0) * 100.0
        / NULLIF(SUM(A.valor_p1), 0) AS avg_efetividade_caixa,
    ISNULL(SUM(A.valor_excecoes), 0) * 100.0
        / NULLIF(SUM(A.valor_total_acordos), 0) AS avg_pct_excecoes,
    COUNT(DISTINCT E.dia) AS dias_ativos
FROM CTE_Esforco_Dia E
JOIN dbo.USU_MASTER U (NOLOCK) ON E.ID_USUARIO = U.ID_USUARIO
LEFT JOIN CTE_Acordos_Diario A ON E.ID_USUARIO = A.ID_USUARIO AND E.dia = A.dia
WHERE 1 = 1
{settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
GROUP BY U.CHAVE, U.NOME
HAVING COUNT(DISTINCT E.dia) >= 10
ORDER BY avg_taxa_conversao DESC;
"""


def normalize_agent_key(login: Optional[str], name: Optional[str]) -> str:
    """Unification key across databases. Prefers CHAVE (login) over NOME."""
    base = (login or "").strip().upper()
    if base:
        return base
    return (name or "").strip().upper()