"""Prova de correção do Cluster A (pt4-fixes): dedup de regravação mal escopado.

Causa raiz comum (achados #1, #4a, #4b, #6): `ROW_NUMBER() OVER (PARTITION BY
chave ORDER BY DT_EMISSAO DESC, ID_REC DESC)` roda sem o filtro de negócio
(data/status) dentro do particionamento, e esse filtro é aplicado DEPOIS de
`rn = 1` já ter escolhido a linha vencedora. Se a linha vencedora (regravação
mais recente) não passa no filtro externo, o grupo inteiro desaparece — mesmo
que uma linha mais antiga do mesmo grupo passasse. A suíte principal (197
testes) não pega essa classe de bug: nenhum teste existente monta 2 linhas de
mesma chave (NR_RECEBIMENTO, ID_CARTEIRA, PARCELA) com uma delas vencendo o
rank e falhando no filtro. Este arquivo faz exatamente isso, por achado.

Não toca no banco real (sem SQL Server disponível em CI) e a suíte existente
(test_produtividade_query_shape.py) só confere forma da string — o que a regra
dura do pt4 explicitly diz não provar nada pra esta classe de bug. Em vez
disso, cada teste roda o SQL real gerado pelas funções de produção (extraído
via corte de parênteses balanceados, sem reescrever a lógica à mão) contra um
SQLite :memory: com fixture de 2 linhas — a mesma chave, uma vencendo o rank e
falhando no filtro, outra perdendo o rank mas válida. `_sqlite_adapt` só troca
sintaxe (NOLOCK, nomes `banco.dbo.`, `@Hoje`/`@Amanha`, `GETDATE()`, `DATEADD`)
— nunca a lógica de negócio.

Achados #7 e #8-corr (CTE_Contratos_Agente / qtd_reprovados) usam
`COUNT(DISTINCT chave)` como agregado — uma checagem de existência pura, sem
nenhuma coluna de valor que dependa de QUAL linha venceu o rank. Pra esse
formato, dedup-antes-do-filtro e filtro-sem-dedup são matematicamente
equivalentes (ver docstring de cada teste abaixo) — os testes desses dois
confirmam essa equivalência empiricamente em vez de reproduzir uma divergência
que, verificada, não existe.
"""
import re
import sqlite3

import config.settings as settings
from dominios.acordos.queries import build_tabela_performance_periodo_query
from dominios.graficos.queries import _rec_master_dedup, build_real_por_portfolio_query
from dominios.produtividade.queries import build_produtividade_query

HOJE = "2026-08-20"
AMANHA = "2026-08-21"

REC_MASTER_COLUMNS = (
    "ID_REC", "ID_USUARIO", "NR_RECEBIMENTO", "ID_CARTEIRA", "PARCELA",
    "ID_REC_STATUS", "VALOR", "PLANO", "VR_PAGO", "DT_PAGAMENTO",
    "DT_VENCIMENTO", "DT_EMISSAO",
)


def _sqlite_adapt(sql: str, hoje: str = HOJE, amanha: str = AMANHA) -> str:
    """T-SQL -> SQLite: só sintaxe (NOLOCK, `banco.dbo.`, @Hoje/@Amanha,
    GETDATE(), DATEADD), nunca a lógica de negócio sendo testada."""
    sql = re.sub(r"\b\w+\.dbo\.", "", sql)
    sql = sql.replace("(NOLOCK)", "")
    sql = sql.replace("@Hoje", f"'{hoje}'")
    sql = sql.replace("@Amanha", f"'{amanha}'")
    sql = sql.replace("CAST(GETDATE() AS DATE)", f"'{hoje}'")
    # CAST('YYYYMMDD' AS DATE): SQL Server aceita YYYYMMDD sem separador; em
    # SQLite isso vira afinidade NUMERIC e '20260820' vira o inteiro 20260820
    # (perde a formatação, nunca bate com DT_EMISSAO='2026-08-20' em TEXT) —
    # reformata pro literal ISO com hífen antes de comparar.
    sql = re.sub(r"CAST\('(\d{4})(\d{2})(\d{2})' AS DATE\)", r"'\1-\2-\3'", sql)

    def _dateadd(m):
        n = m.group(1)
        col = m.group(2)
        sign = "" if n.startswith("-") else "+"
        return f"date({col}, '{sign}{n} day')"

    sql = re.sub(r"DATEADD\(DAY,\s*(-?\d+),\s*([\w.]+)\)", _dateadd, sql)
    return sql


def _extract_after(sql: str, pattern: str) -> str:
    """Acha `pattern` (regex terminando em '\\(' já aberto) e devolve o
    conteúdo até o parêntese balanceado que fecha esse '('. Não reescreve a
    query — só recorta o texto real gerado pela função de produção."""
    m = re.search(pattern, sql)
    assert m, f"padrao nao encontrado no SQL gerado: {pattern}"
    start = m.end()
    depth = 1
    i = start
    while depth > 0:
        if sql[i] == "(":
            depth += 1
        elif sql[i] == ")":
            depth -= 1
        i += 1
    return sql[start:i - 1]


def _make_db(rows):
    conn = sqlite3.connect(":memory:")
    conn.execute(f"CREATE TABLE REC_MASTER ({', '.join(c + ' TEXT' for c in REC_MASTER_COLUMNS)})")
    for row in rows:
        cols = ", ".join(REC_MASTER_COLUMNS)
        placeholders = ", ".join(["?"] * len(REC_MASTER_COLUMNS))
        conn.execute(
            f"INSERT INTO REC_MASTER ({cols}) VALUES ({placeholders})",
            [row.get(c) for c in REC_MASTER_COLUMNS],
        )
    conn.row_factory = sqlite3.Row
    return conn


# Par-base de fixture reusado nos achados #1/#4a/#4b/#6: mesma chave
# (NR_RECEBIMENTO=555, ID_CARTEIRA=1, PARCELA=0). Linha A é a válida, mais
# antiga por ID_REC. Linha B é a "regravação por erro do sistema" — mesmo
# DT_EMISSAO (empate, desempatado por ID_REC DESC = B vence o rank cru) mas
# com status fora do universo aceito pela query. Sem o fix, B vence o rank e
# o filtro de status (aplicado depois) derruba o grupo inteiro — A nunca
# aparece, mesmo sendo válida.
def _linha_valida(**overrides):
    row = {
        "ID_REC": 100, "ID_USUARIO": 1, "NR_RECEBIMENTO": 555, "ID_CARTEIRA": 1,
        "PARCELA": 0, "ID_REC_STATUS": 1, "VALOR": 1000, "PLANO": 1, "VR_PAGO": 0,
        "DT_PAGAMENTO": None, "DT_VENCIMENTO": "2026-08-01", "DT_EMISSAO": HOJE,
    }
    row.update(overrides)
    return row


def _linha_regravacao(**overrides):
    row = {
        "ID_REC": 200, "ID_USUARIO": 1, "NR_RECEBIMENTO": 555, "ID_CARTEIRA": 1,
        "PARCELA": 0, "ID_REC_STATUS": 7, "VALOR": 0, "PLANO": 1, "VR_PAGO": 0,
        "DT_PAGAMENTO": None, "DT_VENCIMENTO": "2026-08-01", "DT_EMISSAO": HOJE,
    }
    row.update(overrides)
    return row


# ─── #1 — dominios/graficos/queries.py:_rec_master_dedup ─────────────────


def test_achado1_rec_master_dedup_prefiltrado_nao_perde_linha_valida():
    """
    Filtro de status DENTRO do particionamento (extra_filter_sql): a
    regravação (status 7, fora de STATUS_GERADOS_SQL) nunca entra no pool de
    ranking, então a linha válida (status 1) vence trivialmente.
    """
    conn = _make_db([_linha_valida(), _linha_regravacao()])

    extra = f"AND R.PARCELA = 0 AND R.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}"
    fixed_sql = _sqlite_adapt(_rec_master_dedup("TESTDB", alias="R", extra_filter_sql=extra))
    fixed = conn.execute(f"SELECT * FROM {fixed_sql} R WHERE R.rn = 1").fetchall()

    assert len(fixed) == 1
    assert fixed[0]["ID_REC"] == "100"
    assert fixed[0]["VALOR"] == "1000"


def test_achado1_forma_antiga_reproduz_o_bug_na_mesma_fixture():
    """Prova que a fixture acima realmente reproduz o bug relatado: a forma
    pré-fix (filtro só depois de rn=1) some com o grupo inteiro."""
    conn = _make_db([_linha_valida(), _linha_regravacao()])

    buggy_sql = _sqlite_adapt(_rec_master_dedup("TESTDB", alias="R"))
    buggy = conn.execute(
        f"SELECT * FROM {buggy_sql} R WHERE R.rn = 1 AND R.PARCELA = 0 "
        f"AND R.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}"
    ).fetchall()

    assert len(buggy) == 0


# ─── #4a — produtividade/queries.py: CTE_Acordos_Unicos ──────────────────


def test_achado4a_cte_acordos_unicos_prefiltra_status_antes_do_rank():
    full_sql = build_produtividade_query(
        "COBwebRCBAUTOS", use_distinct_esforco=False,
        date_from=HOJE, date_to_exclusive=AMANHA,
    )
    cte_body = _sqlite_adapt(_extract_after(full_sql, r"CTE_Acordos_Unicos AS\s*\("))

    conn = _make_db([_linha_valida(ID_REC_STATUS=1), _linha_regravacao(ID_REC_STATUS=7)])
    result = conn.execute(f"SELECT * FROM ({cte_body}) t WHERE NR_RECEBIMENTO = '555'").fetchall()

    assert len(result) == 1
    assert result[0]["ID_REC_STATUS"] == "1"
    assert result[0]["VALOR_TOTAL_ACORDO"] == 1000


# ─── #4b — produtividade/queries.py: CTE_Boletos (achado desta sessão) ───


def test_achado4b_cte_boletos_prefiltra_status_e_vencimento_antes_do_rank():
    full_sql = build_produtividade_query(
        "COBwebRCBAUTOS", use_distinct_esforco=False,
        date_from=HOJE, date_to_exclusive=AMANHA,
    )
    cte_body = _sqlite_adapt(_extract_after(full_sql, r"CTE_Boletos AS\s*\("))

    conn = _make_db([_linha_valida(ID_REC_STATUS=1), _linha_regravacao(ID_REC_STATUS=7)])
    result = conn.execute(f"SELECT * FROM ({cte_body}) t WHERE ID_USUARIO = '1'").fetchall()

    assert len(result) == 1
    assert result[0]["qtd_boletos_emitidos"] == 1


# ─── #6 — graficos/queries.py: build_real_por_portfolio_query ────────────


def test_achado6_real_por_portfolio_dedupa_por_pagamento_nao_por_emissao():
    """
    Filtra por DT_PAGAMENTO mas a ordem de "versão vencedora" do dedup
    continua DT_EMISSAO DESC (convenção de _rec_master_dedup). Sem o fix,
    uma regravação sem pagamento no período (DT_PAGAMENTO NULL) vencia o
    rank cru e escondia o pagamento real de uma versão mais antiga da mesma
    chave.
    """
    full_sql = build_real_por_portfolio_query("COBwebRCBAUTOS", date_from=HOJE, date_to_exclusive=AMANHA)
    dedup_fragment = _sqlite_adapt(_extract_after(full_sql, r"FROM\s*\("))

    pago = _linha_valida(ID_REC=100, ID_REC_STATUS=1, VR_PAGO=500, DT_PAGAMENTO=HOJE)
    regravacao_sem_pagamento = _linha_regravacao(ID_REC=200, ID_REC_STATUS=1, VR_PAGO=0, DT_PAGAMENTO=None)
    conn = _make_db([pago, regravacao_sem_pagamento])

    fixed = conn.execute(f"SELECT * FROM ({dedup_fragment}) R WHERE R.rn = 1").fetchall()

    assert len(fixed) == 1
    assert fixed[0]["ID_REC"] == "100"
    assert fixed[0]["VR_PAGO"] == "500"


def test_achado6_forma_antiga_reproduz_o_bug_na_mesma_fixture():
    conn = _make_db([
        _linha_valida(ID_REC=100, ID_REC_STATUS=1, VR_PAGO=500, DT_PAGAMENTO=HOJE),
        _linha_regravacao(ID_REC=200, ID_REC_STATUS=1, VR_PAGO=0, DT_PAGAMENTO=None),
    ])

    buggy_sql = _sqlite_adapt(_rec_master_dedup("TESTDB", alias="R"))
    buggy = conn.execute(
        f"SELECT * FROM {buggy_sql} R WHERE R.rn = 1 AND R.DT_PAGAMENTO >= '{HOJE}' "
        f"AND R.DT_PAGAMENTO < '{AMANHA}' AND R.VR_PAGO > 0 "
        f"AND R.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}"
    ).fetchall()

    assert len(buggy) == 0


# ─── #7 e #8-corr — verificação de que o fix é neutro no resultado ───────
#
# Diferente de #1/#4a/#4b/#6, estas duas CTEs agregam com
# COUNT(DISTINCT chave) — checagem de existência pura, sem nenhuma coluna de
# valor (VALOR/VR_PAGO) que dependa de qual linha especificamente vence o
# rank. Pra esse formato, "existe ao menos uma linha que casa o filtro" dá o
# mesmo resultado com ou sem dedup — dedup só decide QUAL linha entre as que
# já casam o filtro é usada, e aqui nenhuma coluna pós-filtro é lida dela.
# Os testes abaixo confirmam essa equivalência empiricamente (rodando as duas
# formas na mesma fixture) em vez de alegar uma divergência que a análise diz
# não existir. O fix foi mantido por consistência estrutural com as CTEs
# irmãs (CTE_Acordos / AC-EX) e por segurança caso alguém adicione uma coluna
# de valor a estas CTEs no futuro — mas não é uma correção de dado observável
# hoje.


def test_achado7_contratos_agente_dedup_e_neutro_no_count_distinct():
    full_sql = build_produtividade_query(
        "COBwebRCBAUTOS", use_distinct_esforco=True,
        date_from=HOJE, date_to_exclusive=AMANHA,
    )
    cte_body = _sqlite_adapt(_extract_after(full_sql, r"CTE_Contratos_Agente AS\s*\("))

    conn = _make_db([_linha_valida(ID_REC_STATUS=1), _linha_regravacao(ID_REC_STATUS=7)])
    conn.execute("CREATE TABLE REC_DIVIDAS (NR_RECEBIMENTO TEXT, ID_CARTEIRA TEXT, ID_DIVIDA TEXT)")
    conn.execute("INSERT INTO REC_DIVIDAS VALUES ('555', '1', '999')")

    fixed = conn.execute(f"SELECT * FROM ({cte_body}) t").fetchall()
    assert len(fixed) == 1
    assert fixed[0]["qtd_acordos_por_contrato"] == 1

    old_equivalent = conn.execute(f"""
        SELECT RM.ID_USUARIO,
               COUNT(DISTINCT RM.NR_RECEBIMENTO || '|' || RM.ID_CARTEIRA || '|' || RD.ID_DIVIDA)
                   AS qtd_acordos_por_contrato
        FROM REC_MASTER RM
        JOIN REC_DIVIDAS RD ON RD.NR_RECEBIMENTO = RM.NR_RECEBIMENTO AND RD.ID_CARTEIRA = RM.ID_CARTEIRA
        WHERE RM.DT_EMISSAO >= '{HOJE}' AND RM.DT_EMISSAO < '{AMANHA}'
          AND RM.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}
        GROUP BY RM.ID_USUARIO
    """).fetchall()

    assert [dict(r) for r in old_equivalent] == [dict(r) for r in fixed]


def test_achado8corr_qtd_reprovados_dedup_e_neutro_no_count_distinct():
    full_sql = build_tabela_performance_periodo_query(
        "COBwebRCBAUTOS", filter_by_agente=False, date_from=HOJE, date_to_exclusive=AMANHA,
    )
    join_body = _sqlite_adapt(_extract_after(full_sql, r"qtd_reprovados\s*FROM\s*\("))

    conn = _make_db([_linha_valida(ID_REC_STATUS=1), _linha_regravacao(ID_REC_STATUS=7)])
    conn.execute("CREATE TABLE REC_STATUS (ID_REC_STATUS TEXT, DESCR TEXT)")
    conn.executemany("INSERT INTO REC_STATUS VALUES (?, ?)", [("1", "ATIVO"), ("7", "REJEITADO")])

    fixed = conn.execute(f"""
        SELECT RM.ID_USUARIO, COUNT(DISTINCT RM.NR_RECEBIMENTO) AS qtd_reprovados
        FROM ({join_body}) RM
        WHERE RM.rn = 1
        GROUP BY RM.ID_USUARIO
    """).fetchall()
    assert len(fixed) == 1
    assert fixed[0]["qtd_reprovados"] == 1

    old_equivalent = conn.execute(f"""
        SELECT RM.ID_USUARIO, COUNT(DISTINCT RM.NR_RECEBIMENTO) AS qtd_reprovados
        FROM REC_MASTER RM
        JOIN REC_STATUS RS ON RM.ID_REC_STATUS = RS.ID_REC_STATUS
        WHERE RM.DT_EMISSAO >= '{HOJE}' AND RM.DT_EMISSAO < '{AMANHA}'
          AND (RS.DESCR LIKE '%REJEITADO%' OR RS.DESCR LIKE '%REPROVADO%' OR RS.DESCR LIKE '%RECUSADO%')
        GROUP BY RM.ID_USUARIO
    """).fetchall()

    assert [dict(r) for r in old_equivalent] == [dict(r) for r in fixed]
