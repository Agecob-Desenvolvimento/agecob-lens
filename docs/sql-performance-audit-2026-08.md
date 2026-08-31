# SQL Server Performance Audit — AgDash

**Date:** 2026-08-18 · **Scope:** every SQL statement the dashboard issues · **Type:** read-only investigation

**Nothing was changed.** No index created, no SQL edited, no backend touched, no production configuration altered.

---

## 1. Executive Summary

**43 generated query shapes were inventoried and 42 were executed and measured** against the live
`COBwebRCBAUTOS` database (`SET STATISTICS IO / TIME`, controlled A/B variants).

The headline result is that **the dominant bottleneck is not a missing index, and not data volume.
It is a single code pattern that blinds the query optimizer.**

`_date_decl()` in `dominios/produtividade/queries.py:6` emits a `DECLARE @Hoje DATE = …` block that
every other builder inherits. **31 of the 43 query shapes carry it.** A value held in a local variable
is not visible to the optimizer at compile time, so every date-filtered query is compiled against a
blind guess (~9–30 % of the table) instead of the real selectivity (today = 134 of 234,420 rows in
`REC_MASTER`, 0.06 %). The optimizer therefore chooses full scans, nested-loop re-execution and
oversized spools for row counts that never materialise.

Measured effect of making the same dates visible to the optimizer — identical SQL, dates bound as
real `?` parameters, no index, no rewrite:

| Query | Logical reads | CPU | Isolated | 4 concurrent |
|---|---|---|---|---|
| `Q021` acordos-detalhe-todos | 689,859 → **603** (1,144×) | 2,203 → **0 ms** | 3,168 → **4 ms** | 2,942 → **7 ms** |
| `Q023` rejeitados-detalhe-todos | 684,059 → **63** (10,858×) | 2,312 → **101 ms** | — | — |
| `Q032` fases (chat agent) | 685,485 → **682** (1,005×) | 1,937 → **0 ms** | — | — |
| `Q004` benchmarks 3 m | 2,903,691 → **21,075** (138×) | 4,249 → **2,142 ms** | 2,163 → **1,180 ms** | 9,143 → **4,542 ms** |
| `Q001` produtividade-hoje | 42,015 → **10,267** (4.1×) | 358 → **31 ms** | 228 → **25 ms** | 687 → **57 ms** |

**A realistic Home page load (5 distinct endpoints fired together) went from a 2,049 ms median to a
165 ms median — 12.4× — with no schema change at all.**

**Biggest single opportunity:** fix `_date_decl()`. It is one function, it touches 31 of 43 query
shapes, and it requires no DDL, no maintenance window and no index.

**Index verdict:** after that fix, **no new index is justified by any day-scoped dashboard query.**
Exactly one index candidate survives scrutiny (`CTO_MASTER`, for the 3-month benchmark), and even
that one is out-ranked by a cache-TTL change that costs nothing. See §4 and §8.

**Concurrency verdict:** the reported "1 s isolated → 4 s at 4 concurrent" was **reproduced**
(`Q001`: 190 ms → 669 ms, 3.5×). It is CPU saturation caused by the bad plans above — not locking,
not the connection pool, and **not** the `MAXDOP 0` hint. Removing that hint made things *worse* (§7).

---

## 2. Query Inventory

Method: every builder in `dominios/` and `api/routers/` was instantiated with representative
arguments and the emitted SQL dumped, then executed twice (warm) against `COBwebRCBAUTOS` with
`SET STATISTICS IO ON; SET STATISTICS TIME ON`. Values below are the second (warm) execution on
2026-08-18 (~11:00, production server under normal load).

Classification: **A** = confirmed bottleneck · **B** = measurable but modest · **C** = healthy ·
**D** = irrelevant at current volume.

| ID | Builder | Endpoint | Main tables | Reads (as-is) | CPU ms | Wall ms | Reads once dates are sniffable | Class |
|---|---|---|---|---|---|---|---|---|
| Q001 | `build_produtividade_query(distinct=True)` | `/dashboard/produtividade-hoje/{db}`, `/status-carga` | REC_MASTER, CTO_MASTER, DIV_MASTER | 41,742 | 375 | 237 | 10,267 | **B** |
| Q002 | `build_produtividade_query(distinct=False)` | `/comparacao-agentes`, `/detalhamento-agentes`, `/produtividade` | CTO_MASTER, REC_MASTER, DIV_MASTER | 33,891 | 313 | 168 | 12,914 | **B** |
| Q003 | idem, `db=todos` | idem | CTO_MASTER, REC_MASTER, DIV_MASTER | 72,421 | 1,016 | 520 | 22,267 | **B** |
| Q004 | `build_benchmark_query(3m)` | `/dashboard/benchmarks/{db}` | REC_MASTER, CTO_MASTER | **2,903,691** | **4,423** | 2,706 | 21,075 | **A** |
| Q005 | `build_produtividade_agentes_query` | `/dashboard/produtividade-agentes` | CTO_MASTER, USU_MASTER | 5,635 | 15 | 23 | n/a (no `DECLARE`) | C |
| Q006 | `QUERY_ACORDOS_HOJE` | `/dashboard/acordos-hoje[/{db}\|/todos]` | REC_MASTER, DIV_MASTER, DEV_MASTER | 10,459 | 125 | 145 | n/a | **B** |
| Q007 | `build_agreements_tabela_query` | `/dashboard/acordos-hoje-agente/{db}` | REC_MASTER, DEV_MASTER | 5,955 | 47 | 53 | n/a | **B** |
| Q008 | `build_tabela_performance_periodo_query` | `/dashboard/tabela-performance-periodo/{db}` | — | not exercised — agent filter returned 0 rows | — | 2 | — | — |
| Q009 | `build_primeira_parcela_dia_query` | `/dashboard/primeira-parcela-dia/{db}` | REC_MASTER | 4,682 | 32 | 35 | **106** (44×) | **B** |
| Q010 | `build_excecoes_por_portfolio_query` | `/dashboard/excecoes-por-portfolio/{db}` | REC_MASTER, DIV_AUX | 26 | 0 | 6 | n/a | D |
| Q011 | `build_excecoes_por_agente_query` | `/dashboard/excecoes-por-agente/{db}` | REC_MASTER | 16 | 0 | 7 | n/a | D |
| Q012 | `build_acordos_por_portfolio_query` | `/dashboard/acordos-por-portfolio/{db}` | REC_MASTER, DIV_AUX, REC_DIVIDAS | 4,970 | 78 | 51 | **217** (23×) | **B** |
| Q013 | `build_excecoes_sem_portfolio_query` | `/dashboard/excecoes-sem-portfolio/{db}` | REC_MASTER, DIV_AUX | 21 | 0 | 7 | n/a | D |
| Q014 | `build_rejeitados_por_portfolio_query` | `/dashboard/rejeitados-por-portfolio/{db}` | REC_MASTER, DIV_AUX | 174 | 0 | 10 | n/a | D |
| Q015 | `build_quebrados_por_portfolio_query` | `/dashboard/quebrados-por-portfolio/{db}` | REC_MASTER, DIV_AUX | 3,371 | 63 | 38 | **44** (77×) | **B** |
| Q016 | `build_portfolio_rollup_query` | `/dashboard/portfolio-rollup/{db}` | REC_MASTER, DIV_AUX, REC_DIVIDAS | 5,165 | 94 | 50 | **277** (19×) | **B** |
| Q017 | `build_excecoes_detalhe_query` | `/dashboard/excecoes-detalhe/{db}/{pf}` | REC_MASTER | 25 | 0 | 7 | n/a | D |
| Q018 | `build_acordos_detalhe_query` | `/dashboard/acordos-detalhe/{db}/{pf}` | REC_MASTER, DEV_MASTER | 5,972 | 141 | 130 | **162** (37×) | **B** |
| Q019 | `build_rejeitados_detalhe_query` | `/dashboard/rejeitados-detalhe/{db}/{pf}` | REC_MASTER, DEV_MASTER | 196 | 16 | 11 | n/a | D |
| Q020 | `build_quebrados_detalhe_query` | `/dashboard/quebrados-detalhe/{db}/{pf}` | REC_MASTER, DEV_MASTER | 3,220 | 62 | 58 | **34** (95×) | **B** |
| Q021 | `build_acordos_detalhe_global_query` | `/dashboard/acordos-detalhe-todos/{db}` | REC_MASTER, DEV_MASTER | **689,506** | **2,204** | 2,215 | **603** (1,144×) | **A** |
| Q022 | `build_excecoes_detalhe_global_query` | `/dashboard/excecoes-detalhe-todos/{db}` | REC_MASTER | 115 | 0 | 7 | n/a | D |
| Q023 | `build_rejeitados_detalhe_global_query` | `/dashboard/rejeitados-detalhe-todos/{db}` | REC_MASTER, DEV_MASTER | **683,718** | **3,000** | 3,034 | **63** (10,858×) | **A** |
| Q024 | `build_excecoes_detalhe_agente_query` | `/dashboard/excecoes-detalhe-agente/{db}/{ag}` | REC_MASTER | 16 | 16 | 14 | n/a | D |
| Q025 | `build_rejeitados_detalhe_agente_query` | `/dashboard/rejeitados-detalhe-agente/{db}/{ag}` | REC_MASTER, DEV_MASTER | 200 | 16 | 9 | n/a | D |
| Q026 | `build_quebrados_detalhe_agente_query` | `/dashboard/quebrados-detalhe-agente/{db}/{ag}` | REC_MASTER, DEV_MASTER | 3,405 | 62 | 34 | **54** (63×) | **B** |
| Q027 | `build_primeira_parcela_por_portfolio_query` | `/dashboard/primeira-parcela-por-portfolio/{db}` | REC_MASTER, DIV_AUX | 4,970 | 77 | 68 | **217** (23×) | **B** |
| Q028 | `build_real_por_portfolio_query` | `/dashboard/real-por-portfolio/{db}` | REC_MASTER, DIV_AUX | 5,363 | 47 | 31 | 1,550 (3.5×) | **B** |
| Q029 | `build_primeira_parcela_por_agente_query` | `/dashboard/primeira-parcela-por-agente/{db}` | REC_MASTER | 4,682 | 31 | 49 | n/a | **B** |
| Q030 | `build_cruzamento_query` | `/agente/chat` tool | REC_MASTER, DIV_AUX | 4,872 | 31 | 42 | **235** (21×) | **B** |
| Q031 | `build_ranking_agentes_query` | `/agente/chat` tool | REC_MASTER | 4,682 | 31 | 32 | **106** (44×) | **B** |
| Q032 | `build_fases_query` (183 d) | `/agente/chat` tool | REC_MASTER, DIV_AUX | **684,935** | **2,094** | 2,114 | **682** (1,005×) | **A** |
| Q033 | `build_daily_rollup_query` (90 d) | `/agente/chat` tool | REC_MASTER | 4,852 | 109 | 106 | 4,855 (**1.0×**) | C |
| Q034–Q043 | 10 efetividade builders | `/efetividade/*` | REC_MASTER | 4,682–4,940 | 78–611 | 68–367 | unchanged (**1.0×**) | C |

**Control group.** The 12 shapes that do **not** use the `DECLARE` pattern (Q005, Q008, Q033–Q043 —
efetividade binds dates as `CONVERT(DATE, ?, 112)`) showed **exactly 1.0× change** in the same A/B
test. That is a clean internal control: the improvements above come from the date-binding mechanism,
not from measurement drift.

### Data volume (both databases, measured)

| Table | AUTOS rows | CONSUMER rows | Data MB (AUTOS) | Index MB (AUTOS) | NC indexes |
|---|---|---|---|---|---|
| `CTO_MASTER` | 1,571,495 | 1,753,664 | 124 | 177 | 4 |
| `REC_MASTER` | 234,420 | 182,843 | 46 | **89** | **9** |
| `DIV_AUX` | 146,525 | 646,360 | 53 | 3 | 1 |
| `DIV_MASTER` | 146,525 | 646,360 | 22 | 63 | 9 |
| `DEV_MASTER` | 128,644 | 480,425 | 10 | 9 | 4 |
| `REC_DIVIDAS` | 15,208 | 25,402 | 4 | 2 | 4 |
| `USU_MASTER` | 140 | 112 | <1 | <1 | 3 |

Rows touched by a *typical day-scoped* query on 2026-08-18: **134** `REC_MASTER` rows (AUTOS),
309 (CONSUMER); **1,291** `CTO_MASTER` rows (AUTOS), 455 (CONSUMER). The entire dashboard working
set is ≈ 700 MB per database and stays resident in the buffer pool — **physical reads were 0 in every
measurement**. This is a CPU-and-plan problem, not an I/O problem.

---

## 3. Top Bottlenecks

Ordered by operational impact (latency × frequency × concurrency × visibility).

### B-1 — `Q004` `/dashboard/benchmarks/{db}` · 2.9 M logical reads, 4.4 s CPU

* **Evidence:** 2,903,691 logical reads on `REC_MASTER` — a table whose clustered index is only
  5,896 pages. That is ≈ **490 full passes** of the table to return 28 rows. Corroborated
  independently by the team's own production note in
  `agecob-lens/src/hooks/useHomeViewModel.ts:105` — *"p50 9,5s e 5,0s em produção, pico 27s"*.
* **Cause:** `CTE_Acordos_Diario` is consumed by
  `LEFT JOIN CTE_Acordos_Diario A ON E.ID_USUARIO = A.ID_USUARIO AND E.dia = A.dia`. Because the
  `@LookbackStart`/`@Hoje` local variables hide the real selectivity, the optimizer under-estimates
  the driving side and picks nested-loop re-execution of the CTE instead of a single hash join. CTEs
  are not materialised in SQL Server — the whole 3-month aggregate is recomputed per driving row.
* **Plan:** inferred from I/O, not read (see §12). With sniffable dates the access collapses to a
  single pass (21,075 reads).
* **Recommendation:** bind the dates (§9 P0-1) **and** raise the backend cache TTL. A 3-month
  lookback is refreshed at most once a day, yet `cache_key = f"benchmarks|{db}|{lookback}m"` uses the
  global 60 s TTL (`api/routers/dashboard.py:1029`). The frontend already caches it for 1 hour; the
  backend does not. **No index required.**

### B-2 — `Q021` / `Q023` `/dashboard/*-detalhe-todos/{db}` · ~684 k worktable reads, 2–3 s CPU

* **Evidence:** `Q023` 683,718 reads of which **673,300 are Worktable** (a spool), returning **2 rows**.
  `Q021` 689,506 reads / 673,312 Worktable, returning 6 rows. Sibling `Q022` — *same builder*, status 5 —
  costs 115 reads. The builder is fine; the *plan* is not.
* **Cause:** `_build_detalhe_global()` combines two correlated scalar subqueries over `REC_MASTER`
  (`SUM(R2.VALOR)`, `COUNT(1)`) with an `OUTER APPLY … TOP 1` over `REC_DIVIDAS ⋈ DIV_AUX`. Fed a
  blind estimate of tens of thousands of driving rows, the optimizer builds a spool sized for that
  phantom cardinality. The actual driving set is 2–6 rows.
* **Recommendation:** bind the dates. `Q023` drops to **63 reads / 108 ms**; `Q021` to
  **603 reads / 38 ms**. **No index required.**

### B-3 — `Q032` `build_fases_query` (183-day window) · 685 k reads, 2.1 s CPU

Same shape as B-2 (two `CROSS APPLY` blocks over `REC_MASTER` and `REC_DIVIDAS`). Note this query
already receives **literal** dates — but they are still assigned into `DECLARE @Hoje DATE = '20260818'`,
which is *still a local variable* and *still* non-sniffable. **685,485 → 682 reads (1,005×).** This is
the clearest proof that the defect is the `DECLARE` indirection itself, not the caller.

### B-4 — `Q001` `/dashboard/produtividade-hoje/{db}` · the most-requested heavy query

* **Evidence:** 41,742 reads for 18 result rows. `CTO_MASTER: 15,984` reads — the clustered index is
  15,987 pages, i.e. **exactly one full table scan** of 1.57 M rows to read the day's 1,291 contacts.
  `REC_MASTER: 19,924` ≈ 3.4 full passes; the builder references `REC_MASTER` **five** times
  (`CTE_Acordos`, the `IN (SELECT …)` inside `CTE_Saldo_Original`, `CTE_Horas_Agente`,
  `CTE_Boletos_Agente`, `CTE_Contratos_Agente`).
* **Isolated experiment** — `CTO_MASTER` day aggregate only, everything else held constant:

  | variant | logical reads | CPU | wall |
  |---|---|---|---|
  | `DECLARE @Hoje` (current code) | 15,984 | 360 ms | 303 ms |
  | `+ OPTION (RECOMPILE)` | 3,972 | 15 ms | 20 ms |
  | literal date inline | 3,964 | 0 ms | 11 ms |
  | real `?` parameter | 3,964 | 16 ms | 14 ms |

  The same experiment on `REC_MASTER.DT_EMISSAO`: 4,948 → 422 reads.
* **Recommendation:** bind the dates. Full query: 42,015 → 10,267 reads, CPU 358 → 31 ms,
  4-concurrent median 687 → 57 ms. **No index required.**

### B-5 — `/status-carga/{db}` runs `Q001` for *both* databases

`api/routers/dashboard.py:491` executes `build_produtividade_query(source, use_distinct_esforco=True)`
per database — two copies of the heaviest day query. Same cost profile as B-4, fixed by the same change.

---

## 4. Index Candidates

Only one candidate survives evidence review. Everything else is in §8.

### C-1 — `CTO_MASTER (DATA) INCLUDE (ID_USUARIO, ID_DEV)` · **conditional, re-evaluate after P0-1**

* **Table:** `dbo.CTO_MASTER` (1.57 M / 1.75 M rows, 124 MB data, the highest-insert table in the schema).
* **Key:** `DATA` · **Include:** `ID_USUARIO`, `ID_DEV`.
  `ID_COMPLEMENTO`, `ID_DEVEDORES` and `ID_CTO_MASTER` come free — they are the clustered key and are
  therefore already present in every nonclustered index.
* **Problem today:** no existing index covers `{DATA, ID_USUARIO, ID_DEV}`.
  `IND_CTO_MASTER_DATA (DATA)` has no includes → seek + key lookup per row.
  `IND_CTO_MASTER_ID_USUARIO (ID_USUARIO, DATA)` covers `ID_USUARIO` but not `ID_DEV`.
  `IND00 (ID_DEV, DATA)` covers `ID_DEV` but not `ID_USUARIO`.
  For the 90-day benchmark window (967,033 rows = 62 % of the table) the optimizer falls back to a
  full clustered scan (16,037 reads) — the *correct* choice given what exists.
* **Measured proxy** — forced `IND_CTO_MASTER_ID_USUARIO` scan on an equivalent aggregate, i.e. a
  narrow covering structure: **6,009 reads / 1,137 ms CPU** vs **16,037 reads / 1,624 ms CPU** for the
  clustered scan. Forcing the two *non*-covering alternatives instead costs 2.96 M reads, confirming
  the current plan is already the best of the available options.
* **Expected benefit:** MEDIUM (~2.7× reads, ~1.4× CPU) **and only on `Q004`**. Day-scoped queries do
  not need it: after P0-1, `CTO_MASTER` costs 4,556 logical reads / 6 ms wall / 0 ms measurable CPU at
  day scope. Shaving that to ~15 reads saves single-digit milliseconds.
* **Confidence:** MEDIUM. The proxy substitutes the dedupe column, and no execution plan could be
  captured (SHOWPLAN denied — §12).
* **Cost:** MEDIUM — roughly 40–55 MB on a 300 MB table.
* **Risk / write impact:** **MEDIUM–HIGH.** `CTO_MASTER` is the write-hot table (every dialler event
  inserts). A fifth nonclustered index adds sustained insert cost to the operational collections
  system in order to speed up one cached analytics query.
* **Verdict:** **do not create it yet.** Raising the `/benchmarks` cache TTL (P0-2) removes almost all
  of that query's frequency for free. Re-measure `Q004` after P0-1 + P0-2, then decide.

### Candidates explicitly rejected after analysis

| Considered | Why rejected |
|---|---|
| `REC_MASTER (DT_EMISSAO) INCLUDE (…)` | After P0-1 the existing `IND_REC_MASTER_DT_EMISSAO` seek + 134 key lookups costs **413 logical reads / 3 ms**. A covering index would save ~400 reads on an already over-indexed table. |
| `REC_MASTER (DT_VENCIMENTO / DT_PAGAMENTO) INCLUDE (…)` | The efetividade queries filter `DT_EMISSAO >= '20260101'`, which selects **144,199 of 234,420 rows (61 %)**. A scan is the correct plan; a seek would be slower. |
| `REC_DIVIDAS (NR_RECEBIMENTO, ID_CARTEIRA)` | 15,208 rows / 530 pages, already served by `PK_REC_DIVIDAS`, `IND01` and `IND_REC_DIVIDAS_NR_RECEBIMENTO`. Measured cost after P0-1: 470 reads. |
| `USU_MASTER (ID_USUARIO)` | 140 rows. Already exists as `IND_USU_MASTER_ID_USUARIO`. |
| `DIV_AUX (ID_DIVIDA) INCLUDE (CAMPO010)` | `ID_DIVIDA` **is** the clustered primary key of `DIV_AUX`. A nonclustered copy would be pure duplication. |

---

## 5. Existing Index Problems

### 5.1 `config.RECOMMENDED_INDEXES` would duplicate 9 existing indexes — do not run `/admin/indexes/apply`

All 10 entries in `config/settings.py:84` report `ABSENT`, because
`core/utils/index_helpers.py:46 index_exists()` matches **by index name only**. Every one of them
duplicates the leading key of an index that already exists under an `IND_*` name:

| Recommended (`IX_…`) | Already present | Status |
|---|---|---|
| `IX_REC_MASTER_DT_EMISSAO (DT_EMISSAO)` | `IND_REC_MASTER_DT_EMISSAO (DT_EMISSAO)` | duplicate key; differs only in INCLUDE |
| `IX_REC_MASTER_NR_RECEBIMENTO` | `IND_REC_MASTER_NR_RECEBIMENTO` | duplicate |
| `IX_REC_MASTER_DT_VENCIMENTO_COV` | `IND_REC_MASTER_DT_VENCIMENTO` | duplicate key |
| `IX_REC_MASTER_DT_PAGAMENTO_COV` | `IND_REC_MASTER_DT_PAGAMENTO` | duplicate key |
| `IX_CTO_MASTER_DATA` | `IND_CTO_MASTER_DATA` | duplicate key |
| `IX_USU_MASTER_ID_USUARIO` | `IND_USU_MASTER_ID_USUARIO` | duplicate (140-row table) |
| `IX_REC_DIVIDAS_NR_RECEBIMENTO` | `IND_REC_DIVIDAS_NR_RECEBIMENTO` | duplicate |
| `IX_DIV_MASTER_ID_DIVIDA` | `IND_DIV_MASTER_ID_DIVIDA` | duplicate |
| `IX_DIV_AUX_ID_DIVIDA` | `PK_DIV_AUX` **clustered on `ID_DIVIDA`** | fully redundant |
| `IX_REC_DIVIDAS_NR_CARTEIRA (NR_RECEBIMENTO, ID_CARTEIRA)` | `IND01 (ID_CARTEIRA, NR_RECEBIMENTO)` + PK | reversed-order overlap |

Running `POST /admin/indexes/apply/{db}?dry_run=false` today would add 10 indexes to two databases,
roughly doubling index maintenance on `REC_MASTER` and `CTO_MASTER` for no measured read benefit.
`ENABLE_INDEX_ADMIN=false` is the only thing currently preventing it.

### 5.2 `REC_MASTER` is already over-indexed

**9 nonclustered indexes; 89 MB of index against 46 MB of data.** `IND_BOLETOS_FICHA` alone is
4,821 pages with **24 INCLUDE columns** — effectively a second copy of the whole table. It is not
useless (several day-scoped queries scan it instead of the clustered index), but it makes every
`REC_MASTER` write expensive and is a strong argument against adding a tenth index. `DIV_MASTER` in
CONSUMER is worse: 290 MB index vs 102 MB data across 9 nonclustered indexes.

### 5.3 Two auto-generated indexes were never renamed

`DIV_AUX.missing_index_94_93 (CAMPO001)` in AUTOS and `DIV_AUX.missing_index_45_44 (CAMPO004)` in
CONSUMER are artefacts of someone applying a `sys.dm_db_missing_index_details` suggestion verbatim.
Neither column is referenced by any dashboard query — the dashboard uses `CAMPO010`. Whether they
serve the collections application is outside this audit's scope.

### 5.4 Usage statistics unavailable

`sys.dm_db_index_usage_stats` and `sys.dm_db_index_operational_stats` are denied to the `AGECOB`
login. **EVIDÊNCIA INSUFICIENTE** to declare any existing index unused and safe to drop. See §12.

---

## 6. SARGability

### 6.1 The real defect is not a function on a column — it is a local variable

Standard SARGability is, with one exception, **correct** throughout this codebase. The date
predicates are textbook:

```sql
RM.DT_EMISSAO >= @Hoje AND RM.DT_EMISSAO < @Amanha   -- half-open, no CONVERT on the column
```

No `CONVERT(date, coluna)`, no `YEAR(coluna)`, no `FORMAT()` in any `WHERE`. `CAST(DT_EMISSAO AS DATE)`
appears only in `GROUP BY`, which is harmless. The efetividade builders use
`R.DT_EMISSAO >= CONVERT(DATE, ?, 112)` — the conversion is on the **parameter**, not the column, and
stays SARGable.

**The predicates are SARGable; the optimizer simply has no value to be selective with.**
`DECLARE @Hoje DATE = …` is resolved at *execution* time, after the plan is compiled. SQL Server falls
back to a fixed guess (≈30 % per open-ended inequality, ≈9 % for a `>=` AND `<` pair) — roughly 21,000
estimated rows for `REC_MASTER` against 134 actual, and ~141,000 for `CTO_MASTER` against 1,291 actual.
A seek plus 21,000 key lookups looks more expensive than a scan, so the optimizer chooses the scan.
A correct decision from bad input.

**Affected:** 31 of 43 query shapes, all inheriting `_date_decl()`
(`dominios/produtividade/queries.py:6`) or an equivalent inline `DECLARE` block in
`dominios/graficos/queries.py` and `dominios/agente/*.py`.

### 6.2 Genuinely non-SARGable predicates that do not matter

`FILTRO_AGENTES_EXCLUIDOS_SQL` (`config/settings.py:210`) wraps the filtered column in functions:

```sql
AND UPPER(LTRIM(RTRIM(U.NOME))) <> 'COBDESANTOS'
AND UPPER(LTRIM(RTRIM(U.CHAVE))) NOT LIKE 'INTERNA%'
```

Present in 33 of 43 queries, textbook non-SARGable — and **irrelevant**: `USU_MASTER` holds 140 rows
(112 in CONSUMER) in under one page. Measured `USU_MASTER` cost across the whole inventory: **4–72
logical reads**. The same applies to `FILTRO_AGENTES_EFETIVIDADE_SQL`, which additionally uses
leading-wildcard `LIKE '%SERASA%'`. Do not "fix" either — see §8.

---

## 7. Concurrency

### 7.1 The reported degradation is reproduced — and it is CPU, not locking

`Q001`, same query fired *N* ways in parallel, median latency over 3 repetitions:

| variant | n = 1 | n = 4 | ratio |
|---|---|---|---|
| current (`DECLARE`) | 190 ms | 669 ms | **3.5×** |
| dates bound as `?` | 25 ms | 57 ms | 2.3× |

`Q021`: 3,168 ms → 2,942 ms at n=4 with the current code; **4 ms → 7 ms** once the dates are bound.

**Realistic Home page load** (`Q001 + Q009 + Q012 + Q016 + Q021` fired together, as the browser does):

| | median page wall | individual runs |
|---|---|---|
| current | **2,049 ms** | 1,777 / 3,932 / 2,049 |
| dates bound | **165 ms** | 436 / 160 / 165 |

The degradation is proportional to CPU consumed per execution. `Q001` burns 358 ms of CPU in 185 ms of
elapsed time (CPU > elapsed ⇒ a parallel plan pulling ~2 schedulers). Four of those saturate the box.
Cut per-execution CPU by 11× and the cliff disappears. **This is a plan-quality problem presenting as a
concurrency problem — classify it as such, and do not index for it.**

### 7.2 `MAXDOP 0` is not the culprit — leave the hint alone

`OPTION (USE HINT('ENABLE_PARALLEL_PLAN_PREFERENCE'), MAXDOP 0)` on `Q001`/`Q002`/`Q003` is a natural
suspect. It is not the problem. Holding everything else constant:

| | isolated CPU | isolated wall | n = 4 median |
|---|---|---|---|
| `MAXDOP 0` (current) | 157 ms | 157 ms | **504 ms** |
| `MAXDOP 1` | 297 ms | 315 ms | 886 ms |

Serialising the plan made it **worse both isolated and under load**. Do not remove the hint.

### 7.3 The connection "pool" does not bound concurrency

`core/database/pool_manager.py:91` acquires with `pool.get_nowait()`; on `queue.Empty` it immediately
opens a brand-new connection. `DB_POOL_SIZE` therefore caps only the number of *idle* connections
retained, not concurrent connections. **`_DB_POOL_ACQUIRE_TIMEOUT` (env `DB_POOL_TIMEOUT`, documented
in the README as "Segundos de espera por conexão") is defined in `config/settings.py:328` and never
read anywhere in the codebase** — the pool never waits.

Under a burst, connections grow without limit and every one of them is allowed to run a parallel plan.
This is the amplifier, not the cause. Measured connection cost is negligible (new connection +
`SELECT 1` = 1–4 ms; reuse = 0.7 ms), so bounding the pool costs nothing in latency and would convert
an uncontrolled CPU stampede into a queue. Worth doing **after** P0-1, and worth deciding whether
`DB_POOL_TIMEOUT` should be honoured or removed from the README.

### 7.4 The cache already does the right thing

`CacheManager.get_or_compute` implements single-flight with a bounded leader wait
(`core/cache/cache_manager.py:53`), so N users on the same dashboard produce one SQL execution, not N.
That design is sound and should not be changed. It also means the concurrency that hurts is **across
different endpoints**, which is exactly what the Home-mix measurement above models.

---

## 8. DO NOT INDEX

Queries and symptoms that look indexable and are not.

| # | Target | Why an index is the wrong answer |
|---|---|---|
| 1 | **All 10 efetividade queries (Q034–Q043)** | `DT_EMISSAO >= '20260101'` selects **144,199 of 234,420 rows (61 %)**. Scanning `IND_BOLETOS_FICHA` (4,821 pages) is the optimal plan; a seek plus 144 k key lookups would be far worse. They also showed **1.0×** in the date A/B test — they already bind parameters correctly. Their 78–611 ms CPU is aggregation over a large fraction of the table. Cost is CPU + volume. |
| 2 | **`Q033` daily rollup (90-day series)** | 4,852 reads, 109 ms, **1.0×** in the A/B test. Already close to the minimum for a 90-day window. |
| 3 | **`FILTRO_AGENTES_EXCLUIDOS_SQL` / `FILTRO_AGENTES_EFETIVIDADE_SQL`** | Non-SARGable by construction, present in 33 of 43 queries — and harmless: `USU_MASTER` is **140 rows**, measured 4–72 reads. An index cannot be used through those functions anyway, and rewriting them risks changing which agents are excluded, which is a business rule (ADR-005). |
| 4 | **`Q021` / `Q023` / `Q032` worktable explosion** | 673 k Worktable reads look like a missing index on `REC_MASTER`/`REC_DIVIDAS`. They are not: the spool is sized from a phantom cardinality. Binding the dates removes 99.9 % of the reads with no DDL. Indexing here would add write cost and leave the bad estimate in place. |
| 5 | **`Q004` benchmarks — the CPU half** | Even with correct estimates it still consumes ~2.1 s CPU aggregating 967,033 `CTO_MASTER` rows over 90 days. Genuine volume. An index cuts reads, not the `COUNT(DISTINCT …)`/hash-aggregate CPU. The right lever is cache TTL, not DDL. |
| 6 | **`REC_MASTER` date columns** | Post-fix cost is 413 logical reads / 3 ms. `REC_MASTER` already carries 9 nonclustered indexes and 89 MB of index against 46 MB of data. A tenth buys milliseconds and costs writes. |
| 7 | **`USU_MASTER`, `REC_DIVIDAS`, `DIV_AUX`, `CTO_COMPLEMENTO`** | 140 / 15,208 / 146,525 / 1,716 rows. All sub-second, all already served by their clustered keys. `DIV_AUX.ID_DIVIDA` **is** the clustered PK. |
| 8 | **`Q010`, `Q011`, `Q013`, `Q014`, `Q017`, `Q019`, `Q022`, `Q024`, `Q025`** | 16–200 logical reads, ≤16 ms. Already seeking `IND02 (ID_REC_STATUS, DT_EMISSAO)` because the narrow statuses (5, 7) are highly selective. Nothing to gain. |
| 9 | **Everything, as a response to the concurrency cliff** | See §7.1. The cliff is CPU saturation from bad plans. Indexes that do not reduce CPU per execution will not change it. |

---

## 9. Prioritized Roadmap

### P0 — high impact, low risk

**P0-1 · Make date filters visible to the optimizer.**
Replace the `DECLARE @Hoje/@Amanha` indirection in `_date_decl()`
(`dominios/produtividade/queries.py:6`) and the equivalent inline blocks in
`dominios/graficos/queries.py` and `dominios/agente/*.py` with **bound `?` parameters**; where
threading parameters through a builder is impractical, append `OPTION (RECOMPILE)` to that statement.
*Impact:* Home page 2,049 → 165 ms median; `Q021` 3,168 → 4 ms; `Q004` reads ÷ 138.
*Risk:* LOW — no result-set change, no DDL, fully reversible.
*Choosing between the two options:* real parameters are strictly better than `RECOMPILE` where the
range varies. Measured on `Q001`: 25 ms vs 136 ms isolated, 57 ms vs 366 ms at n=4 — `RECOMPILE` pays
50–143 ms of compile CPU on *every* execution, which itself becomes a concurrency cost. Use
`RECOMPILE` only as the fallback. Verify row-for-row parity per endpoint before and after.

**P0-2 · Give `/dashboard/benchmarks` its own long cache TTL.**
`api/routers/dashboard.py:1029` uses the global 60 s TTL for a 3-month lookback that changes once a
day. The frontend already uses `staleTime: 3_600_000`. Align the backend.
*Impact:* removes the heaviest query from the hot path almost entirely. *Risk:* LOW.

**P0-3 · Turn Query Store ON in both databases and grant a monitoring login `VIEW DATABASE STATE` +
`SHOWPLAN`.**
`sys.database_query_store_options.actual_state_desc = OFF` today, and the `AGECOB` login holds only
`CONNECT SQL` + `VIEW ANY DATABASE`. Every DMV-based conclusion in this audit had to be replaced by a
controlled experiment (§12).
*Impact:* makes the P0-1 result measurable in production instead of inferred. *Risk:* LOW —
Query Store overhead on this workload is negligible (`READ_WRITE`, `QUERY_CAPTURE_MODE = AUTO`).
Grant to a dedicated monitoring login rather than widening the application login.

### P1 — high impact, medium risk

**P1-1 · Bound the connection pool.** Honour `_DB_POOL_ACQUIRE_TIMEOUT` (or delete it and the README
row that documents it). Replace `get_nowait()` + unconditional open with a blocking `get(timeout=…)`
above a real ceiling. Do this *after* P0-1, so the ceiling is sized against the corrected CPU profile.

**P1-2 · Re-measure `Q004`, then decide on `CTO_MASTER (DATA) INCLUDE (ID_USUARIO, ID_DEV)`** (§4 C-1).
Medium benefit, medium-to-high write cost on the hottest insert table. Not justified today.

### P2 — low impact, low risk

* **P2-1** Collapse the five `REC_MASTER` references inside `Q001` into fewer passes. After P0-1 the
  query costs 10,267 reads / 31 ms CPU, so this is tidiness, not performance.
* **P2-2** Remove the duplicate `USU_MASTER` self-join in `build_produtividade_agentes_query`
  (aliases `U` and `UM` join the same table on the same key).
* **P2-3** Fix the README reference to `docs/sql-indexes-recommendations.sql` — the file does not exist
  anywhere in the repository or in git history; the definitions now live in
  `config/settings.py:RECOMMENDED_INDEXES`.

### IGNORE for now

* Any change to `MAXDOP 0` / `ENABLE_PARALLEL_PLAN_PREFERENCE` (§7.2 — measured, it helps).
* Any rewrite of the agent-exclusion filters (§8 #3).
* Dropping `IND_BOLETOS_FICHA` or the `missing_index_*` indexes — **EVIDÊNCIA INSUFICIENTE** without
  `sys.dm_db_index_usage_stats` (§5.4).
* Partitioning, columnstore, schema redesign. The hot working set is ~700 MB per database and fully
  cached; there is no volume problem to solve inside a 4-month horizon.

---

## 10. Recommended Next Step

**If only three database-side changes were possible, in order:**

1. **P0-1 — bind the dates.** One helper function, 31 of 43 query shapes. Evidence: the A/B table in
   §1, the isolated variable experiment in §3 B-4, and the 12-query control group that showed 1.0×
   (§2). Home page median 2,049 ms → 165 ms.
2. **P0-2 — long cache TTL for `/benchmarks`.** Evidence: 2.9 M logical reads / 4.4 s CPU per
   execution (§3 B-1), the production p50 of 9.5 s recorded by the team itself, and a payload that
   changes once a day being cached for 60 s.
3. **P0-3 — Query Store ON + `VIEW DATABASE STATE`/`SHOWPLAN` for a monitoring login.** Evidence:
   Query Store is `OFF`; the application login cannot read a single performance DMV or capture one
   execution plan. Without this, the next round of tuning is guesswork again.

**Which queries look bad but must not be fixed with indexes:** the ten efetividade builders (61 % of
the table by design), the 673 k-read worktable trio `Q021`/`Q023`/`Q032` (phantom cardinality, not a
missing index), every `UPPER(LTRIM(RTRIM(…)))` agent filter (140-row table), and the concurrency cliff
itself (§7, §8).

**What must not be done:** run `POST /admin/indexes/apply` (§5.1) — it would add 10 indexes that
duplicate 9 existing ones across two databases.

**Growth watch (no action now):** `CTO_MASTER` currently retains ~10 months (earliest row 2025-10-28)
and grows ~160 k rows/month; the 3-month benchmark window already covers 62 % of it.
`EFETIVIDADE_DATA_MINIMA = '20260101'` is a fixed floor whose selectivity worsens monotonically.
Neither justifies action inside a 4-month horizon, but both should be re-measured if the benchmark
lookback or the efetividade floor is widened.

---

## 11. Appendix — Method

**Environment.** SQL Server 2022 (16.0.1000.6) Developer Edition on Windows Server 2022. Databases
`COBwebRCBAUTOS` (16.5 GB) and `COBwebRCBCONSUMER` (8.3 GB). Login `AGECOB`, permissions
`CONNECT SQL` + `VIEW ANY DATABASE` only. Measurements taken 2026-08-18 ~11:00 against the live
server under normal user load; all statements read-only, all with `NOLOCK` exactly as the application
issues them.

**What was measured.** All 43 generated shapes executed warm (second execution) with
`SET STATISTICS IO ON; SET STATISTICS TIME ON`, messages captured via `pyodbc cursor.messages`.
Access paths were inferred by comparing logical reads against per-index page counts from
`sys.partitions` / `sys.allocation_units` — e.g. `CTO_MASTER` 15,984 reads vs `PK_CTO_MASTER`
15,987 pages ⇒ exactly one full scan. Controlled A/B variants isolated the date-binding mechanism;
the 12-query control group that does not use the pattern confirmed no measurement drift.

## 12. Appendix — Limitations

Stated explicitly rather than papered over.

* **No execution plans.** `SET SHOWPLAN_XML` / `SET STATISTICS XML` return
  *"Permissão SHOWPLAN negada"*. Every plan-shape statement in §3 is **inferred** from logical-read
  counts, page counts and A/B behaviour, not read from a plan. Confidence is high for the
  access-method claims (read counts match page counts exactly) and lower for the specific
  join/spool operators named.
* **No DMVs.** `sys.dm_exec_query_stats`, `sys.dm_db_index_usage_stats`,
  `sys.dm_db_index_operational_stats`, `sys.dm_db_missing_index_details`, `sys.dm_os_wait_stats` and
  `sys.dm_os_sys_info` are all denied (`VIEW SERVER PERFORMANCE STATE`). Consequently: **no
  missing-index DMV was consulted at all** (which is acceptable — those are signals, not
  recommendations), **no index can be declared unused**, **no wait statistics were collected**, and
  **the server's core count is unknown** (parallelism was inferred from CPU-time ÷ elapsed-time ratios).
* **No Query Store.** `actual_state_desc = OFF`, so no production execution counts or historical
  latency distributions exist. Frequency estimates come from reading the frontend
  (`QueryClient staleTime: 55_000` / `refetchInterval: 120_000` in `agecob-lens/src/App.tsx:34`;
  `POLL_MS = 20000` for Modo TV in `useAcordoAnnouncer.ts:18`), not from the server.
* **Single day, single database.** All measurements are from 2026-08-18 against `COBwebRCBAUTOS`.
  `COBwebRCBCONSUMER` has ~1.4× the day volume and 3.5× the `DIV_AUX`/`DIV_MASTER` size; the
  conclusions should hold but absolute numbers will differ.
* **Wall-clock variance.** The server was serving real users; wall times for the same query varied by
  2–5× between runs (`Q001`: 190 ms–980 ms). **Logical reads are deterministic and CPU time nearly so
  — every claim in this report is anchored to those, not to wall clock.** Wall-clock figures are
  medians of at least 3 runs and are used only for concurrency comparisons, where both arms ran under
  the same conditions.
* **`Q008` was not exercised** — the representative agent name produced an empty result set, so it has
  no measurement and no classification.
* **No percentage was estimated without a measurement behind it.** Where evidence was insufficient,
  this report says **EVIDÊNCIA INSUFICIENTE** (§5.4, §9 IGNORE).
