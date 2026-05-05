from typing import Any, Dict, List

import config.settings as settings
from core.utils.sql_helpers import build_assessoria_clause

QUERY_ACORDOS_HOJE: str = f"""
DECLARE @Hoje DATE = CAST(? AS DATE);
DECLARE @Amanha DATE = DATEADD(DAY, 1, @Hoje);
DECLARE @Offset INT = ?;
DECLARE @Limit INT = ?;

WITH CTE_Hoje_Acordos AS (
    -- Subconjunto dos NR_RECEBIMENTO emitidos hoje; base de redução para as CTEs abaixo.
    SELECT DISTINCT NR_RECEBIMENTO
    FROM REC_MASTER (NOLOCK)
    WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha
),
CTE_Total_Acordo AS (
    -- Soma todas as parcelas para achar o valor total do acordo (restrito ao dia).
    SELECT
        RM.NR_RECEBIMENTO,
        SUM(RM.VALOR) AS VALOR_TOTAL_ACORDO
    FROM REC_MASTER RM (NOLOCK)
    WHERE RM.NR_RECEBIMENTO IN (SELECT NR_RECEBIMENTO FROM CTE_Hoje_Acordos)
    GROUP BY RM.NR_RECEBIMENTO
),
CTE_Saldo_Divida AS (
    -- Saldo atualizado (VR_SALDO) das dívidas dos acordos de hoje.
    SELECT
        RD.NR_RECEBIMENTO,
        SUM(ISNULL(DM.VR_SALDO, 0)) AS SALDO_ATUALIZADO_DIVIDA
    FROM REC_DIVIDAS RD (NOLOCK)
    JOIN DIV_MASTER DM (NOLOCK) ON RD.ID_DIVIDA = DM.ID_DIVIDA
    WHERE RD.NR_RECEBIMENTO IN (SELECT NR_RECEBIMENTO FROM CTE_Hoje_Acordos)
    GROUP BY RD.NR_RECEBIMENTO
)
SELECT
    COUNT(*) OVER() AS _total_rows,

    -- 1. DADOS DO AGENTE
    U.CHAVE AS agente,

    -- 2. DADOS DO DEVEDOR
    DEV.CPF_CNPJ AS cpf_cnpj,
    DEV.NOME_RAZAO AS nome_razao,

    -- 3. DADOS FINANCEIROS TOTAIS E DESCONTO
    ISNULL(SD.SALDO_ATUALIZADO_DIVIDA, 0) AS valor_atualizado_divida,
    ISNULL(TA.VALOR_TOTAL_ACORDO, 0) AS valor_total_acordo,
    ISNULL(SD.SALDO_ATUALIZADO_DIVIDA, 0) - ISNULL(TA.VALOR_TOTAL_ACORDO, 0) AS desconto_concedido,

    -- 4. DADOS DAS PARCELAS
    RM.NR_RECEBIMENTO AS acordo,
    RM.PLANO AS qtd_parcelas,
    RM.PARCELA AS numero_parcela,
    RM.DT_EMISSAO AS data_emissao,
    RM.DT_VENCIMENTO AS data_vencimento,
    RM.VALOR AS valor_parcela,
    RS.DESCR AS status_parcela,

    -- 5. PAGAMENTO E BAIXA
    RM.DT_PAGAMENTO AS dt_pagamento,
    CASE
        WHEN RM.DT_PAGAMENTO IS NOT NULL THEN 'PAGO'
        ELSE 'EM ABERTO'
    END AS situacao_pagamento

FROM REC_MASTER RM (NOLOCK)
JOIN USU_MASTER U (NOLOCK) ON RM.ID_USUARIO = U.ID_USUARIO
JOIN DEV_MASTER DEV (NOLOCK) ON RM.ID_DEV = DEV.ID_DEV
LEFT JOIN REC_STATUS RS (NOLOCK) ON RM.ID_REC_STATUS = RS.ID_REC_STATUS
LEFT JOIN CTE_Total_Acordo TA ON RM.NR_RECEBIMENTO = TA.NR_RECEBIMENTO
LEFT JOIN CTE_Saldo_Divida SD ON RM.NR_RECEBIMENTO = SD.NR_RECEBIMENTO
WHERE RM.DT_EMISSAO >= @Hoje AND RM.DT_EMISSAO < @Amanha
  {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
ORDER BY RM.DT_EMISSAO DESC, RM.NR_RECEBIMENTO, RM.PARCELA
OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
"""


def build_agreements_tabela_query(
    database_name: str,
    filter_by_agente: bool,
    assessoria_token: str = "",
) -> str:
    def _single_db_query(db_name: str) -> str:
        assessoria_clause = build_assessoria_clause(assessoria_token)
        return f"""
            SELECT
                U.NOME AS agente,
                DEV.CPF_CNPJ AS cpf_cnpj,
                DEV.NOME_RAZAO AS nome_devedor,
                RM.NR_RECEBIMENTO AS nr_acordo,
                RS.DESCR AS tipo_acordo,
                MAX(CASE WHEN RM.PARCELA = 0 THEN RM.DT_VENCIMENTO END) AS vencimento_primeira_parcela,
                MAX(CASE WHEN RM.PARCELA = 0 THEN RM.VALOR END) AS valor_primeira_parcela,
                MAX(CASE WHEN RM.PARCELA = 1 THEN RM.VALOR END) AS valor_demais_parcelas,
                MAX(RM.PLANO) AS qtd_parcelas,
                SUM(RM.VALOR) AS valor_total_acordo,
                MAX(RM.DT_EMISSAO) AS data_emissao
            FROM {db_name}.dbo.REC_MASTER RM (NOLOCK)
            JOIN {db_name}.dbo.USU_MASTER U (NOLOCK) ON RM.ID_USUARIO = U.ID_USUARIO
            JOIN {db_name}.dbo.DEV_MASTER DEV (NOLOCK) ON RM.ID_DEV = DEV.ID_DEV
            LEFT JOIN {db_name}.dbo.REC_STATUS RS (NOLOCK) ON RM.ID_REC_STATUS = RS.ID_REC_STATUS
            WHERE RM.DT_EMISSAO >= @Hoje AND RM.DT_EMISSAO < @Amanha
              AND RM.ID_REC_STATUS IN {settings.STATUS_UNIVERSO_SQL}
              {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
              {assessoria_clause}
            GROUP BY U.NOME, DEV.CPF_CNPJ, DEV.NOME_RAZAO, RM.NR_RECEBIMENTO, RS.DESCR
        """

    # PARAM ORDER CONTRACT — callers must supply bind params in this exact sequence:
    #   1. assessoria LIKE params for COBwebRCBCONSUMER subquery  (2 params: CHAVE, NOME)
    #   2. assessoria LIKE params for COBwebRCBAUTOS subquery     (2 params: CHAVE, NOME)
    #      (only 1 pair when database_name != "todos")
    #   3. agente param for outer WHERE base.agente = ?           (1 param, only if filter_by_agente)
    # Use build_assessoria_params(token, repetitions=2 if todos else 1) + optional agente.
    outer_where = "WHERE base.agente = ?" if filter_by_agente else ""
    if database_name == "todos":
        return f"""
            DECLARE @Hoje DATE = CAST(GETDATE() AS DATE);
            DECLARE @Amanha DATE = DATEADD(DAY, 1, @Hoje);
            WITH base AS (
                {_single_db_query("COBwebRCBCONSUMER")}
                UNION ALL
                {_single_db_query("COBwebRCBAUTOS")}
            )
            SELECT
                base.agente,
                base.cpf_cnpj,
                base.nome_devedor,
                base.nr_acordo,
                base.tipo_acordo,
                base.vencimento_primeira_parcela,
                base.valor_primeira_parcela,
                base.valor_demais_parcelas,
                base.qtd_parcelas,
                base.valor_total_acordo,
                base.data_emissao
            FROM base
            {outer_where}
            ORDER BY
                base.agente,
                CASE WHEN UPPER(LTRIM(RTRIM(base.tipo_acordo))) = 'EXCEÇÃO' THEN 1 ELSE 0 END,
                base.cpf_cnpj,
                base.nr_acordo
        """

    return f"""
        DECLARE @Hoje DATE = CAST(GETDATE() AS DATE);
        DECLARE @Amanha DATE = DATEADD(DAY, 1, @Hoje);
        WITH base AS (
            {_single_db_query(database_name)}
        )
        SELECT
            base.agente,
            base.cpf_cnpj,
            base.nome_devedor,
            base.nr_acordo,
            base.tipo_acordo,
            base.vencimento_primeira_parcela,
            base.valor_primeira_parcela,
            base.valor_demais_parcelas,
            base.qtd_parcelas,
            base.valor_total_acordo,
            base.data_emissao
        FROM base
        {outer_where}
        ORDER BY
            CASE WHEN UPPER(LTRIM(RTRIM(base.tipo_acordo))) = 'EXCEÇÃO' THEN 1 ELSE 0 END,
            base.cpf_cnpj,
            base.nr_acordo
    """
