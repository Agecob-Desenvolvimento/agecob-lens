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
    Considera acordos aprovados (ATIVO, BAIXA POR PAGAMENTO, BAIXA AVULSA).
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
              AND R.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL}
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
    Gráfico: acordos aprovados agrupados por portfolio (CAMPO010 da DIV_AUX).
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
              AND R.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL}
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
                R.VALOR,
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
        SELECT NR_RECEBIMENTO, ID_CARTEIRA, VALOR, agente, cpf_mask, nome_devedor
    """
    order = "ORDER BY VALOR DESC"
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


def build_primeira_parcela_por_agente_query(db: str, assessoria_token: str = "", date_from: str = None, date_to_exclusive: str = None) -> str:
    """
    Gráfico: valor e quantidade da 1ª parcela por agente (acordos aprovados).
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
              AND R.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL}
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
