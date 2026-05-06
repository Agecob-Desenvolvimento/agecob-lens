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


def build_tabela_performance_periodo_query(
    database_name: str,
    filter_by_agente: bool,
) -> str:
    """Tabela agregada de métricas por agente — período fixo 2026-04-01 a 2026-05-05.

    Colunas retornadas:
        nome_agente, matricula, qtd_acionamentos, qtd_acordos, conversao_pct,
        valor_total, soma_primeira_parcela, qtd_reprovados

    Status válidos (Acordos + valor): ID_REC_STATUS IN (1, 3, 12) — STATUS_APROVADOS.
    Reprovados: REC_STATUS.DESCR contém REJEITADO, REPROVADO ou RECUSADO.
    Primeira parcela: PARCELA = 0 (convenção do banco — PARCELA=0 é a 1ª, PARCELA=1+ são demais).
    """

    def _single_db(db: str) -> str:
        return f"""
            SELECT
                U.NOME    AS nome_agente,
                U.MATRICULA AS matricula,
                ISNULL(A.qtd_acionamentos, 0) AS qtd_acionamentos,
                ISNULL(AC.qtd_acordos, 0)     AS qtd_acordos,
                ISNULL(AC.valor_total, 0)     AS valor_total,
                ISNULL(AC.soma_primeira_parcela, 0) AS soma_primeira_parcela,
                ISNULL(R.qtd_reprovados, 0)   AS qtd_reprovados
            FROM {db}.dbo.USU_MASTER U
            LEFT JOIN (
                SELECT ID_USUARIO, COUNT(DISTINCT ID_CTO_MASTER) AS qtd_acionamentos
                FROM {db}.dbo.CTO_MASTER
                WHERE DATA >= '2026-04-01' AND DATA < '2026-05-06'
                GROUP BY ID_USUARIO
            ) A ON A.ID_USUARIO = U.ID_USUARIO
            LEFT JOIN (
                -- STATUS_APROVADOS = (1, 3, 12). PARCELA=0 é a primeira parcela neste banco.
                SELECT
                    ID_USUARIO,
                    COUNT(DISTINCT NR_RECEBIMENTO) AS qtd_acordos,
                    SUM(VALOR) AS valor_total,
                    SUM(CASE WHEN PARCELA = 0 THEN VALOR ELSE 0 END) AS soma_primeira_parcela
                FROM {db}.dbo.REC_MASTER
                WHERE DT_EMISSAO >= '2026-04-01' AND DT_EMISSAO < '2026-05-06'
                  AND ID_REC_STATUS IN (1, 3, 12)
                GROUP BY ID_USUARIO
            ) AC ON AC.ID_USUARIO = U.ID_USUARIO
            LEFT JOIN (
                -- Reprovados: status cuja descrição contém REJEITADO, REPROVADO ou RECUSADO.
                SELECT RM.ID_USUARIO, COUNT(DISTINCT RM.NR_RECEBIMENTO) AS qtd_reprovados
                FROM {db}.dbo.REC_MASTER RM
                JOIN {db}.dbo.REC_STATUS RS ON RM.ID_REC_STATUS = RS.ID_REC_STATUS
                WHERE RM.DT_EMISSAO >= '2026-04-01' AND RM.DT_EMISSAO < '2026-05-06'
                  AND (
                      RS.DESCR LIKE '%REJEITADO%'
                      OR RS.DESCR LIKE '%REPROVADO%'
                      OR RS.DESCR LIKE '%RECUSADO%'
                  )
                GROUP BY RM.ID_USUARIO
            ) R ON R.ID_USUARIO = U.ID_USUARIO
            WHERE (
                ISNULL(A.qtd_acionamentos, 0) > 0
                OR ISNULL(AC.qtd_acordos, 0)   > 0
                OR ISNULL(R.qtd_reprovados, 0)  > 0
            )
            {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
        """

    outer_where = "WHERE nome_agente = ?" if filter_by_agente else ""

    if database_name == "todos":
        return f"""
            WITH raw AS (
                {_single_db("COBwebRCBCONSUMER")}
                UNION ALL
                {_single_db("COBwebRCBAUTOS")}
            )
            SELECT
                nome_agente,
                MAX(matricula) AS matricula,
                SUM(qtd_acionamentos) AS qtd_acionamentos,
                SUM(qtd_acordos)      AS qtd_acordos,
                CAST(
                    CASE WHEN SUM(qtd_acionamentos) > 0
                         THEN SUM(qtd_acordos) * 100.0 / SUM(qtd_acionamentos)
                         ELSE 0.0
                    END AS DECIMAL(6,1)
                ) AS conversao_pct,
                CAST(SUM(valor_total)            AS DECIMAL(18,2)) AS valor_total,
                CAST(SUM(soma_primeira_parcela)  AS DECIMAL(18,2)) AS soma_primeira_parcela,
                SUM(qtd_reprovados) AS qtd_reprovados
            FROM raw
            {outer_where}
            GROUP BY nome_agente
            ORDER BY SUM(qtd_acionamentos) DESC
        """

    return f"""
        WITH raw AS (
            {_single_db(database_name)}
        )
        SELECT
            nome_agente,
            matricula,
            qtd_acionamentos,
            qtd_acordos,
            CAST(
                CASE WHEN qtd_acionamentos > 0
                     THEN qtd_acordos * 100.0 / qtd_acionamentos
                     ELSE 0.0
                END AS DECIMAL(6,1)
            ) AS conversao_pct,
            CAST(valor_total           AS DECIMAL(18,2)) AS valor_total,
            CAST(soma_primeira_parcela AS DECIMAL(18,2)) AS soma_primeira_parcela,
            qtd_reprovados
        FROM raw
        {outer_where}
        ORDER BY qtd_acionamentos DESC
    """
