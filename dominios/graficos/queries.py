import config.settings as settings
from core.utils.sql_helpers import build_assessoria_clause


def wrap_todos_or_single(db: str, base_fn, agg_select: str, order_by: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    """
    Helper central dos builders. Monta o query final a partir de:
      - `base_fn(database)` → SELECT base pra um único banco
      - `agg_select` → SELECT de agregação externa quando db == 'todos'
      - `order_by` → ORDER BY final
      - `date_from`/`date_to_exclusive` → quando fornecidos, substituem @Hoje/@Amanha
    """
    if date_from and date_to_exclusive:
        df = date_from.replace("-", "")
        dt = date_to_exclusive.replace("-", "")
        header = f"""
        DECLARE @Hoje DATE = '{df}';
        DECLARE @Amanha DATE = '{dt}';
    """
    else:
        header = """
        DECLARE @Hoje DATE = CAST(GETDATE() AS DATE);
        DECLARE @Amanha DATE = DATEADD(DAY, 1, @Hoje);
    """
    if db == "todos":
        inner = f"{base_fn('COBwebRCBCONSUMER')}\n            UNION ALL\n{base_fn('COBwebRCBAUTOS')}"
        return f"""
            {header}
            {agg_select}
            FROM (
                {inner}
            ) sub
            {order_by}
        """
    return f"""
        {header}
        {base_fn(db)}
        {order_by}
    """


def build_primeira_parcela_dia_query(db: str, assessoria_token: str = "", date_from: str = None, date_to_exclusive: str = None) -> str:
    """
    Card de topo: soma da 1ª parcela de hoje e quantidade de acordos.
    Considera acordos gerados (STATUS_GERADOS = 1,2,3,10,12 — inclui quebras).
    """
    def _base(database: str) -> str:
        assessoria_clause = build_assessoria_clause(assessoria_token)
        return f"""
            SELECT
                SUM(R.VALOR) AS total_valor,
                COUNT(DISTINCT R.NR_RECEBIMENTO) AS total_acordos
            FROM {database}.dbo.REC_MASTER R (NOLOCK)
            JOIN {database}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
            WHERE R.PARCELA = {settings.PRIMEIRA_PARCELA}
              AND R.DT_EMISSAO >= @Hoje AND R.DT_EMISSAO < @Amanha
              AND R.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}
              {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
              {assessoria_clause}
        """

    agg = """
        SELECT
            SUM(sub.total_valor) AS total_valor,
            SUM(sub.total_acordos) AS total_acordos
    """
    return wrap_todos_or_single(db, _base, agg, order_by="", date_from=date_from, date_to_exclusive=date_to_exclusive)


def build_excecoes_por_portfolio_query(db: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    """
    Gráfico: exceções agrupadas por nome do portfolio (CAMPO010 da DIV_AUX).
    Usa CROSS APPLY com TOP 1 para evitar multiplicação de linhas quando
    um acordo tem múltiplas dívidas vinculadas.
    """
    def _base(database: str) -> str:
        return f"""
            SELECT
                DA.{settings.PORTFOLIO_COLUMN} AS portfolio_name,
                COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd_excecoes,
                SUM(R.VALOR) AS valor_excecoes
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
              AND R.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL}
              {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
            GROUP BY DA.{settings.PORTFOLIO_COLUMN}
        """

    agg = """
        SELECT
            portfolio_name,
            SUM(qtd_excecoes) AS qtd_excecoes,
            SUM(valor_excecoes) AS valor_excecoes
    """
    order = "GROUP BY portfolio_name ORDER BY qtd_excecoes DESC" if db == "todos" else "ORDER BY qtd_excecoes DESC"
    return wrap_todos_or_single(db, _base, agg, order_by=order, date_from=date_from, date_to_exclusive=date_to_exclusive)


def build_excecoes_por_agente_query(db: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    """
    Gráfico: exceções agrupadas por agente.
    """
    def _base(database: str) -> str:
        return f"""
            SELECT
                U.NOME AS agente,
                COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd_excecoes,
                SUM(R.VALOR) AS valor_excecoes
            FROM {database}.dbo.REC_MASTER R (NOLOCK)
            JOIN {database}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
            WHERE R.DT_EMISSAO >= @Hoje AND R.DT_EMISSAO < @Amanha
              AND R.PARCELA = {settings.PRIMEIRA_PARCELA}
              AND R.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL}
              {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
            GROUP BY U.NOME
        """

    agg = """
        SELECT
            agente,
            SUM(qtd_excecoes) AS qtd_excecoes,
            SUM(valor_excecoes) AS valor_excecoes
    """
    order = "GROUP BY agente ORDER BY qtd_excecoes DESC" if db == "todos" else "ORDER BY qtd_excecoes DESC"
    return wrap_todos_or_single(db, _base, agg, order_by=order, date_from=date_from, date_to_exclusive=date_to_exclusive)


def build_acordos_por_portfolio_query(db: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    """
    Gráfico: acordos gerados (1,2,3,10,12) agrupados por portfolio (CAMPO010 da DIV_AUX).
    """
    def _base(database: str) -> str:
        return f"""
            SELECT
                DA.{settings.PORTFOLIO_COLUMN} AS portfolio_name,
                COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd_acordos,
                SUM(R.VALOR) AS valor_acordos
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
              AND R.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}
              {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
            GROUP BY DA.{settings.PORTFOLIO_COLUMN}
        """

    agg = """
        SELECT
            portfolio_name,
            SUM(qtd_acordos) AS qtd_acordos,
            SUM(valor_acordos) AS valor_acordos
    """
    order = "GROUP BY portfolio_name ORDER BY qtd_acordos DESC" if db == "todos" else "ORDER BY qtd_acordos DESC"
    return wrap_todos_or_single(db, _base, agg, order_by=order, date_from=date_from, date_to_exclusive=date_to_exclusive)


def build_excecoes_sem_portfolio_query(db: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    """
    Lista detalhe das exceções (PARCELA=0, ID_REC_STATUS na faixa de exceção) cujo
    portfólio (DIV_AUX.CAMPO010) é NULL ou inexistente — invisíveis no gráfico
    `excecoes-por-portfolio`. CPF mascarado: primeiros 3 + últimos 2 dígitos.
    """
    def _base(database: str) -> str:
        return f"""
            SELECT
                R.NR_RECEBIMENTO,
                R.ID_CARTEIRA,
                R.VALOR AS valor_primeira_parcela,
                COALESCE((
                    SELECT SUM(R2.VALOR)
                    FROM {database}.dbo.REC_MASTER R2 (NOLOCK)
                    WHERE R2.NR_RECEBIMENTO = R.NR_RECEBIMENTO
                      AND R2.ID_CARTEIRA = R.ID_CARTEIRA
                ), R.VALOR) AS valor_total,
                U.NOME AS agente,
                CASE
                    WHEN LEN(D.CPF_CNPJ) >= 5
                    THEN LEFT(D.CPF_CNPJ, 3) + '.***.***-' + RIGHT(D.CPF_CNPJ, 2)
                    ELSE D.CPF_CNPJ
                END AS cpf_mask,
                D.NOME_RAZAO AS nome_devedor
            FROM {database}.dbo.REC_MASTER R (NOLOCK)
            JOIN {database}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
            LEFT JOIN {database}.dbo.DEV_MASTER D (NOLOCK) ON R.ID_DEV = D.ID_DEV
            WHERE R.DT_EMISSAO >= @Hoje AND R.DT_EMISSAO < @Amanha
              AND R.PARCELA = {settings.PRIMEIRA_PARCELA}
              AND R.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL}
              {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
              AND NOT EXISTS (
                SELECT 1
                FROM {database}.dbo.REC_DIVIDAS RD (NOLOCK)
                JOIN {database}.dbo.DIV_AUX DA2 (NOLOCK) ON RD.ID_DIVIDA = DA2.ID_DIVIDA
                WHERE RD.NR_RECEBIMENTO = R.NR_RECEBIMENTO
                  AND RD.ID_CARTEIRA = R.ID_CARTEIRA
                  AND DA2.{settings.PORTFOLIO_COLUMN} IS NOT NULL
              )
        """

    agg = """
        SELECT NR_RECEBIMENTO, ID_CARTEIRA, valor_primeira_parcela, valor_total, agente, cpf_mask, nome_devedor
    """
    order = "ORDER BY valor_primeira_parcela DESC"
    return wrap_todos_or_single(db, _base, agg, order_by=order, date_from=date_from, date_to_exclusive=date_to_exclusive)


def build_rejeitados_por_portfolio_query(db: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    """
    Gráfico: acordos rejeitados (ID_REC_STATUS = 7) por portfolio (CAMPO010).
    """
    def _base(database: str) -> str:
        return f"""
            SELECT
                DA.{settings.PORTFOLIO_COLUMN} AS portfolio_name,
                COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd_rejeitados,
                SUM(R.VALOR) AS valor_rejeitados
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
              AND R.ID_REC_STATUS IN {settings.STATUS_REJEITADO_SQL}
              {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
            GROUP BY DA.{settings.PORTFOLIO_COLUMN}
        """

    agg = """
        SELECT
            portfolio_name,
            SUM(qtd_rejeitados) AS qtd_rejeitados,
            SUM(valor_rejeitados) AS valor_rejeitados
    """
    order = "GROUP BY portfolio_name ORDER BY qtd_rejeitados DESC" if db == "todos" else "ORDER BY qtd_rejeitados DESC"
    return wrap_todos_or_single(db, _base, agg, order_by=order, date_from=date_from, date_to_exclusive=date_to_exclusive)


def build_quebrados_por_portfolio_query(db: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    """
    Gráfico: boletos quebrados (ID_REC_STATUS = 2) por portfolio (CAMPO010).
    """
    def _base(database: str) -> str:
        return f"""
            SELECT
                DA.{settings.PORTFOLIO_COLUMN} AS portfolio_name,
                COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd_quebrados,
                SUM(R.VALOR) AS valor_quebrados
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
              AND R.ID_REC_STATUS IN {settings.STATUS_QUEBRADO_SQL}
              {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
            GROUP BY DA.{settings.PORTFOLIO_COLUMN}
        """

    agg = """
        SELECT
            portfolio_name,
            SUM(qtd_quebrados) AS qtd_quebrados,
            SUM(valor_quebrados) AS valor_quebrados
    """
    order = "GROUP BY portfolio_name ORDER BY qtd_quebrados DESC" if db == "todos" else "ORDER BY qtd_quebrados DESC"
    return wrap_todos_or_single(db, _base, agg, order_by=order, date_from=date_from, date_to_exclusive=date_to_exclusive)


def build_portfolio_rollup_query(db: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    """
    Cluster A consolidado (Phase 2). UM único scan de REC_MASTER agrupado por
    portfólio (CAMPO010) E ID_REC_STATUS. Reproduz client-side, por fatiamento
    de status, os 5 endpoints por-portfólio:

        acordos-por-portfolio              -> id_rec_status IN (1, 2, 3, 10, 12)
        primeira-parcela-por-portfolio     -> id_rec_status IN (1, 2, 3, 10, 12)
        excecoes-por-portfolio             -> id_rec_status = 5
        rejeitados-por-portfolio           -> id_rec_status = 7
        quebrados-por-portfolio            -> id_rec_status = 2

    JOIN graph, CROSS APPLY TOP 1, resolução de portfólio, PARCELA = 0, filtro
    de agentes e janela de data são IDÊNTICOS aos 5 builders originais — apenas
    o filtro de status é a união (STATUS_PORTFOLIO_ROLLUP_SQL) e a grade ganha
    R.ID_REC_STATUS. Medidas: COUNT(DISTINCT NR_RECEBIMENTO) e SUM(VALOR),
    exatamente como nos builders originais.

    Paridade de `qtd` para os slices multi-status (acordos / 1ª parcela, que
    somam 1,2,3,10,12 — valores gerados) só é exata se nenhum NR_RECEBIMENTO
    aparecer sob mais de um status gerado no mesmo portfólio — verificado pelo harness de paridade
    (scripts/parity_portfolio_rollup.py). `valor` é aditivo: paridade incondicional.
    """
    def _base(database: str) -> str:
        return f"""
            SELECT
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
            GROUP BY DA.{settings.PORTFOLIO_COLUMN}, R.ID_REC_STATUS
        """

    agg = """
        SELECT
            portfolio_name,
            id_rec_status,
            SUM(qtd) AS qtd,
            SUM(valor) AS valor
    """
    order = (
        "GROUP BY portfolio_name, id_rec_status ORDER BY portfolio_name, id_rec_status"
        if db == "todos"
        else "ORDER BY portfolio_name, id_rec_status"
    )
    return wrap_todos_or_single(db, _base, agg, order_by=order, date_from=date_from, date_to_exclusive=date_to_exclusive)


def _build_detalhe_por_portfolio(db: str, status_sql: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    """
    Lista detalhe (1 linha por acordo) de um portfólio específico, filtrado por
    status. O nome do portfólio entra como parâmetro `?` (um por banco). CPF
    mascarado: primeiros 3 + últimos 2 dígitos.
    """
    def _base(database: str) -> str:
        return f"""
            SELECT
                R.NR_RECEBIMENTO,
                R.ID_CARTEIRA,
                R.VALOR AS valor_primeira_parcela,
                COALESCE((
                    SELECT SUM(R2.VALOR)
                    FROM {database}.dbo.REC_MASTER R2 (NOLOCK)
                    WHERE R2.NR_RECEBIMENTO = R.NR_RECEBIMENTO
                      AND R2.ID_CARTEIRA = R.ID_CARTEIRA
                ), R.VALOR) AS valor_total,
                U.NOME AS agente,
                U.MATRICULA AS matricula,
                CASE
                    WHEN LEN(D.CPF_CNPJ) >= 5
                    THEN LEFT(D.CPF_CNPJ, 3) + '.***.***-' + RIGHT(D.CPF_CNPJ, 2)
                    ELSE D.CPF_CNPJ
                END AS cpf_mask,
                D.NOME_RAZAO AS nome_devedor,
                CONVERT(varchar(10), R.DT_EMISSAO, 120) AS data_acordo,
                CONVERT(varchar(10), R.DT_VENCIMENTO, 120) AS data_vencimento,
                (
                    SELECT COUNT(1)
                    FROM {database}.dbo.REC_MASTER R3 (NOLOCK)
                    WHERE R3.NR_RECEBIMENTO = R.NR_RECEBIMENTO
                      AND R3.ID_CARTEIRA = R.ID_CARTEIRA
                ) AS total_parcelas
            FROM {database}.dbo.REC_MASTER R (NOLOCK)
            JOIN {database}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
            LEFT JOIN {database}.dbo.DEV_MASTER D (NOLOCK) ON R.ID_DEV = D.ID_DEV
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
              AND R.ID_REC_STATUS IN {status_sql}
              {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
              AND DA.{settings.PORTFOLIO_COLUMN} = ?
        """

    agg = """
        SELECT NR_RECEBIMENTO, ID_CARTEIRA, valor_primeira_parcela, valor_total, agente, matricula, cpf_mask, nome_devedor, data_acordo, data_vencimento, total_parcelas
    """
    order = "ORDER BY valor_primeira_parcela DESC"
    return wrap_todos_or_single(db, _base, agg, order_by=order, date_from=date_from, date_to_exclusive=date_to_exclusive)


def _build_detalhe_por_agente(db: str, status_sql: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    """Detalhe por agente (U.NOME = ?) em vez de portfólio. Mesma estrutura de colunas."""
    def _base(database: str) -> str:
        return f"""
            SELECT
                R.NR_RECEBIMENTO,
                R.ID_CARTEIRA,
                R.VALOR AS valor_primeira_parcela,
                COALESCE((
                    SELECT SUM(R2.VALOR)
                    FROM {database}.dbo.REC_MASTER R2 (NOLOCK)
                    WHERE R2.NR_RECEBIMENTO = R.NR_RECEBIMENTO
                      AND R2.ID_CARTEIRA = R.ID_CARTEIRA
                ), R.VALOR) AS valor_total,
                U.NOME AS agente,
                U.MATRICULA AS matricula,
                CASE
                    WHEN LEN(D.CPF_CNPJ) >= 5
                    THEN LEFT(D.CPF_CNPJ, 3) + '.***.***-' + RIGHT(D.CPF_CNPJ, 2)
                    ELSE D.CPF_CNPJ
                END AS cpf_mask,
                D.NOME_RAZAO AS nome_devedor,
                CONVERT(varchar(10), R.DT_EMISSAO, 120) AS data_acordo,
                CONVERT(varchar(10), R.DT_VENCIMENTO, 120) AS data_vencimento,
                (
                    SELECT COUNT(1)
                    FROM {database}.dbo.REC_MASTER R3 (NOLOCK)
                    WHERE R3.NR_RECEBIMENTO = R.NR_RECEBIMENTO
                      AND R3.ID_CARTEIRA = R.ID_CARTEIRA
                ) AS total_parcelas
            FROM {database}.dbo.REC_MASTER R (NOLOCK)
            JOIN {database}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
            LEFT JOIN {database}.dbo.DEV_MASTER D (NOLOCK) ON R.ID_DEV = D.ID_DEV
            WHERE R.DT_EMISSAO >= @Hoje AND R.DT_EMISSAO < @Amanha
              AND R.PARCELA = {settings.PRIMEIRA_PARCELA}
              AND R.ID_REC_STATUS IN {status_sql}
              {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
              AND U.NOME = ?
        """
    agg = """
        SELECT NR_RECEBIMENTO, ID_CARTEIRA, valor_primeira_parcela, valor_total, agente, matricula, cpf_mask, nome_devedor, data_acordo, data_vencimento, total_parcelas
    """
    order = "ORDER BY valor_primeira_parcela DESC"
    return wrap_todos_or_single(db, _base, agg, order_by=order, date_from=date_from, date_to_exclusive=date_to_exclusive)


def build_excecoes_detalhe_query(db: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    """Detalhe das exceções (ID_REC_STATUS = 5) de um portfólio (param `?`)."""
    return _build_detalhe_por_portfolio(db, settings.STATUS_EXCECAO_SQL, date_from, date_to_exclusive)


def build_rejeitados_detalhe_query(db: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    """Detalhe dos rejeitados (ID_REC_STATUS = 7) de um portfólio (param `?`)."""
    return _build_detalhe_por_portfolio(db, settings.STATUS_REJEITADO_SQL, date_from, date_to_exclusive)


def build_acordos_detalhe_query(db: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    """Detalhe dos acordos gerados (ID_REC_STATUS IN (1,2,3,10,12)) de um portfólio (param `?`)."""
    return _build_detalhe_por_portfolio(db, settings.STATUS_GERADOS_SQL, date_from, date_to_exclusive)


def build_quebrados_detalhe_query(db: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    """Detalhe dos boletos quebrados (ID_REC_STATUS = 2) de um portfólio (param `?`)."""
    return _build_detalhe_por_portfolio(db, settings.STATUS_QUEBRADO_SQL, date_from, date_to_exclusive)


def build_excecoes_detalhe_agente_query(db: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    return _build_detalhe_por_agente(db, settings.STATUS_EXCECAO_SQL, date_from, date_to_exclusive)


def build_rejeitados_detalhe_agente_query(db: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    return _build_detalhe_por_agente(db, settings.STATUS_REJEITADO_SQL, date_from, date_to_exclusive)


def build_quebrados_detalhe_agente_query(db: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    return _build_detalhe_por_agente(db, settings.STATUS_QUEBRADO_SQL, date_from, date_to_exclusive)


def build_primeira_parcela_por_agente_query(db: str, assessoria_token: str = "", date_from: str = None, date_to_exclusive: str = None) -> str:
    """
    Gráfico: valor e quantidade da 1ª parcela por agente (acordos gerados — 1,2,3,10,12).
    """
    def _base(database: str) -> str:
        assessoria_clause = build_assessoria_clause(assessoria_token)
        return f"""
            SELECT
                U.NOME AS agente,
                COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd_acordos_primeira_parcela,
                SUM(R.VALOR) AS valor_primeira_parcela
            FROM {database}.dbo.REC_MASTER R (NOLOCK)
            JOIN {database}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
            WHERE R.PARCELA = {settings.PRIMEIRA_PARCELA}
              AND R.DT_EMISSAO >= @Hoje AND R.DT_EMISSAO < @Amanha
              AND R.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}
              {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
              {assessoria_clause}
            GROUP BY U.NOME
        """

    agg = """
        SELECT
            agente,
            SUM(qtd_acordos_primeira_parcela) AS qtd_acordos_primeira_parcela,
            SUM(valor_primeira_parcela) AS valor_primeira_parcela
    """
    order = "GROUP BY agente ORDER BY valor_primeira_parcela DESC" if db == "todos" else "ORDER BY valor_primeira_parcela DESC"
    return wrap_todos_or_single(db, _base, agg, order_by=order, date_from=date_from, date_to_exclusive=date_to_exclusive)


def build_primeira_parcela_por_portfolio_query(db: str, date_from: str = None, date_to_exclusive: str = None) -> str:
    """
    Gráfico: valor da 1ª parcela agrupado por portfolio (CAMPO010 da DIV_AUX).
    Acordos gerados (1,2,3,10,12). Usado para análise de rentabilidade por portfólio.
    """
    def _base(database: str) -> str:
        return f"""
            SELECT
                DA.{settings.PORTFOLIO_COLUMN} AS portfolio_name,
                COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd_acordos,
                SUM(R.VALOR) AS valor_primeira_parcela
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
              AND R.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}
              {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
            GROUP BY DA.{settings.PORTFOLIO_COLUMN}
        """

    agg = """
        SELECT
            portfolio_name,
            SUM(qtd_acordos) AS qtd_acordos,
            SUM(valor_primeira_parcela) AS valor_primeira_parcela
    """
    order = "GROUP BY portfolio_name ORDER BY valor_primeira_parcela DESC" if db == "todos" else "ORDER BY valor_primeira_parcela DESC"
    return wrap_todos_or_single(db, _base, agg, order_by=order, date_from=date_from, date_to_exclusive=date_to_exclusive)