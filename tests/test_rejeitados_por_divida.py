"""Rejeitados contados por DÍVIDA, não por NR_RECEBIMENTO.

`dominios/produtividade/queries.py`, branch `use_distinct_esforco=True`,
CTEs `CTE_Rej_Acordo` / `CTE_Rej_Divida` / `CTE_Rejeitados_Agente`.

Uma dívida rejeitada, ressubmetida e rejeitada de novo, gera 2
`NR_RECEBIMENTO` distintos — cada tentativa é um acordo novo. O dedup de
regravação (chave `NR_RECEBIMENTO, ID_CARTEIRA, PARCELA`) não vê isso: não
é regravação da mesma linha. Só um JOIN em `REC_DIVIDAS` colapsa.
Confirmado em produção 2026-09-08 (CPF 58914366634: 2 acordos rejeitados,
1 `ID_DIVIDA`) — o número "Rejeitado" do Modo TV contava 2.

Roda o SQL real gerado pela função de produção contra um SQLite `:memory:`
com fixture mínima; `_sqlite_adapt` só troca sintaxe T-SQL → SQLite, nunca
a lógica de negócio. Mesma abordagem de `tests/test_dedup_regravacao.py`.
"""
import re
import sqlite3

import config.settings as settings
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
    GETDATE, DATEADD), nunca a lógica de negócio sendo testada."""
    sql = re.sub(r"\b\w+\.dbo\.", "", sql)
    sql = sql.replace("(NOLOCK)", "")
    sql = sql.replace("@Hoje", f"'{hoje}'")
    sql = sql.replace("@Amanha", f"'{amanha}'")
    sql = sql.replace("CAST(GETDATE() AS DATE)", f"'{hoje}'")
    sql = re.sub(r"CAST\('(\d{4})(\d{2})(\d{2})' AS DATE\)", r"'\1-\2-\3'", sql)

    def _dateadd(m):
        n, col = m.group(1), m.group(2)
        sign = "" if n.startswith("-") else "+"
        return f"date({col}, '{sign}{n} day')"

    sql = re.sub(r"DATEADD\(DAY,\s*(-?\d+),\s*([\w.]+)\)", _dateadd, sql)
    return sql


def _extract_after(sql: str, pattern: str) -> str:
    """Acha `pattern` (regex terminando num '(' já aberto) e devolve o
    conteúdo até o parêntese balanceado que fecha esse '('."""
    m = re.search(pattern, sql)
    assert m, f"padrao nao encontrado no SQL gerado: {pattern}"
    start = m.end()
    depth, i = 1, m.end()
    while depth > 0:
        if sql[i] == "(":
            depth += 1
        elif sql[i] == ")":
            depth -= 1
        i += 1
    return sql[start:i - 1]


def _make_db(rec_master_rows, rec_dividas_rows):
    conn = sqlite3.connect(":memory:")
    conn.execute(f"CREATE TABLE REC_MASTER ({', '.join(c + ' TEXT' for c in REC_MASTER_COLUMNS)})")
    cols = ", ".join(REC_MASTER_COLUMNS)
    ph = ", ".join(["?"] * len(REC_MASTER_COLUMNS))
    for row in rec_master_rows:
        conn.execute(f"INSERT INTO REC_MASTER ({cols}) VALUES ({ph})", [row.get(c) for c in REC_MASTER_COLUMNS])
    conn.execute("CREATE TABLE REC_DIVIDAS (NR_RECEBIMENTO TEXT, ID_CARTEIRA TEXT, ID_DIVIDA TEXT)")
    conn.executemany("INSERT INTO REC_DIVIDAS VALUES (?, ?, ?)", rec_dividas_rows)
    conn.row_factory = sqlite3.Row
    return conn


_FULL_SQL = build_produtividade_query(
    "COBwebRCBAUTOS", use_distinct_esforco=True, date_from=HOJE, date_to_exclusive=AMANHA,
)


def _rej_ctes_sql() -> str:
    """Costura CTE_Rej_Acordo + CTE_Rej_Divida + CTE_Rejeitados_Agente (não
    rodam isoladas — referenciam-se) num SELECT executável em SQLite."""
    b1 = _extract_after(_FULL_SQL, r"CTE_Rej_Acordo AS\s*\(")
    b2 = _extract_after(_FULL_SQL, r"CTE_Rej_Divida AS\s*\(")
    b3 = _extract_after(_FULL_SQL, r"CTE_Rejeitados_Agente AS\s*\(")
    return _sqlite_adapt(
        f"WITH CTE_Rej_Acordo AS ({b1}), CTE_Rej_Divida AS ({b2}), "
        f"CTE_Rejeitados_Agente AS ({b3}) SELECT * FROM CTE_Rejeitados_Agente"
    )


def _rej_row(nr, id_rec, valor, dt_emissao):
    return {
        "ID_REC": id_rec, "ID_USUARIO": 1, "NR_RECEBIMENTO": nr, "ID_CARTEIRA": 1,
        "PARCELA": 0, "ID_REC_STATUS": 7, "VALOR": valor, "PLANO": 1, "VR_PAGO": 0,
        "DT_PAGAMENTO": None, "DT_VENCIMENTO": "2026-08-01", "DT_EMISSAO": dt_emissao,
    }


def test_conta_por_divida_nao_por_nr_recebimento():
    """Mesma dívida (999), 2 NR_RECEBIMENTO rejeitados hoje → 1, não 2. Valor
    do acordo vencedor (o mais recente) uma vez só."""
    conn = _make_db(
        [
            _rej_row("555", 100, 1000, "2026-08-20 09:00:00"),
            _rej_row("556", 200, 1500, "2026-08-20 15:00:00"),
        ],
        [("555", "1", "999"), ("556", "1", "999")],
    )

    rows = conn.execute(_rej_ctes_sql()).fetchall()

    assert len(rows) == 1
    assert rows[0]["qtd_rejeitados"] == 1, "contou os 2 NR_RECEBIMENTO da mesma dívida"
    assert rows[0]["valor_rejeitados"] == 1500
    assert rows[0]["valor_primeira_parcela_rejeitados"] == 1500


def test_forma_antiga_contava_dois():
    """Controle: COUNT(DISTINCT NR_RECEBIMENTO) (forma anterior, em
    CTE_Financeiro_Agente) devolve 2 na mesma fixture."""
    conn = _make_db(
        [
            _rej_row("555", 100, 1000, "2026-08-20 09:00:00"),
            _rej_row("556", 200, 1500, "2026-08-20 15:00:00"),
        ],
        [("555", "1", "999"), ("556", "1", "999")],
    )

    old = conn.execute(f"""
        SELECT R.ID_USUARIO, COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd_rejeitados
        FROM REC_MASTER R
        WHERE R.DT_EMISSAO >= '{HOJE}' AND R.DT_EMISSAO < '{AMANHA}'
          AND R.PARCELA = 0 AND R.ID_REC_STATUS IN {settings.STATUS_REJEITADO_SQL}
        GROUP BY R.ID_USUARIO
    """).fetchall()

    assert old[0]["qtd_rejeitados"] == 2


def test_acordo_com_n_dividas_conta_n():
    """Acordo rejeitado que agrupa 2 dívidas conta 2 (decisão de negócio:
    contar dívidas rejeitadas distintas). Valor entra uma vez, não duas."""
    conn = _make_db(
        [_rej_row("777", 300, 2000, "2026-08-20 10:00:00")],
        [("777", "1", "888"), ("777", "1", "889")],
    )

    rows = conn.execute(_rej_ctes_sql()).fetchall()

    assert len(rows) == 1
    assert rows[0]["qtd_rejeitados"] == 2
    assert rows[0]["valor_rejeitados"] == 2000, "somou o valor do acordo uma vez por dívida"
    assert rows[0]["valor_primeira_parcela_rejeitados"] == 2000
