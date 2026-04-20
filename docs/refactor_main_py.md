# Refactor `main.py` — Agecob COBweb Dashboard API

## Role

You are a senior backend engineer working on the Agecob COBweb dashboard API (`main.py`, FastAPI + SQL Server via pyodbc). The codebase serves a real production dashboard that reads from two SQL Server databases (`COBwebRCBCONSUMER` and `COBwebRCBAUTOS`) and exposes aggregated KPIs about debt collection agents.

Your job is to execute the refactor described below **without changing any business rule, any KPI formula, any endpoint path, any response shape, or any status/ID constant**. The refactor is purely structural — it removes duplication, removes redundant post-query work, and closes one date-range gap that will hurt at scale.

## Non-negotiable constraints

Before touching anything, read these constraints and treat them as hard limits. If any proposed change would violate one of these, stop and report it instead of proceeding.

### Business rules that MUST be preserved exactly

- `STATUS_APROVADOS = (1, 3, 12)` — approved agreements (ATIVO + BAIXA POR PAGAMENTO + BAIXA POR PAGAMENTO AVULSO).
- `STATUS_EXCECAO = (11,)` — exception agreements (awaiting bank approval).
- `STATUS_UNIVERSO_ACORDOS = (1, 3, 11, 12)` — universe of considered agreements.
- `CPC_COMPLEMENTO_IDS = (252, 130, 110, 111, 253, 144, 151, 216, 140, 108, 90)` — hardcoded, manually managed by the data scientist. Do not change, do not move to DB config, do not make dynamic.
- `PRIMEIRA_PARCELA = 0` — the first installment in COBweb is `PARCELA = 0`, not 1. Do not "normalize" this.
- `PORTFOLIO_COLUMN = "CAMPO010"` — portfolio/bank name lives in `DIV_AUX.CAMPO010`, not in `CART_MASTER`. This is an integrator decision, do not change it.
- Excluded agents: exact names `COBDESANTOS`, `NEMBUSUSER` and prefixes `ANTLIA%`, `INTERNA%`. The SQL-side filter (`FILTRO_AGENTES_EXCLUIDOS_SQL`) is the source of truth.
- Same agent in CONSUMER and AUTOS databases = treated as two separate agents (by design).
- KPI formulas in `mapa-kpis-dashboard.md` are the contract. Every formula there must still hold after the refactor. In particular:
  - `desconto_medio_percentual = AVG(VALOR_ACORDO / VR_SALDO_ORIGINAL * 100)` with `VR_ORIGINAL > 0` guard.
  - `qtd_acionamentos` uses `COUNT(DISTINCT ID_CTO_MASTER)` in the produtividade-hoje query and `COUNT(ID_CTO_MASTER)` in the comparacao-agentes query. This granularity difference is **intentional** — preserve both behaviors.
  - `taxa_conversao = qtd_acordos / qtd_acionamentos * 100`.

### Endpoints that MUST keep their paths and response shapes

- `GET /dashboard/acordos-hoje`
- `GET /dashboard/acordos-hoje/todos`
- `GET /dashboard/acordos-hoje/{database_name}`
- `GET /dashboard/acordos-hoje-agente/{db}`
- `GET /dashboard/produtividade-hoje/{database_name}`
- `GET /dashboard/status-carga/{db}`
- `GET /dashboard/comparacao-agentes/{db}`
- `GET /dashboard/detalhamento-agentes/{database_name}`
- `GET /dashboard/produtividade/{database_name}`
- `GET /dashboard/primeira-parcela-dia/{db}`
- `GET /dashboard/excecoes-por-portfolio/{db}`
- `GET /dashboard/excecoes-por-agente/{db}`
- `GET /dashboard/acordos-por-portfolio/{db}`
- `GET /dashboard/primeira-parcela-por-agente/{db}`
- `GET /health/db`, `GET /health/db/{database_name}`, `GET /`

Every endpoint must return the exact same JSON shape as before (`build_response_envelope` output: `meta`, `data`, `errors`). The `assessoria` query-string filter on `/produtividade-hoje` and `/status-carga` must still work the same way.

### Things you are NOT allowed to change

- Authentication / rate limit / CORS middleware behavior.
- Agent telemetry logging (`_agent_ndjson`) — keep every existing call site.
- `build_response_envelope` signature and output.
- `validate_produtividade_rows` logic and the `PRODUCTIVITY_REQUIRED_FIELDS` contract.
- The `NOLOCK` hints on all tables — this is required by Agecob DBAs.
- The `OPTION (USE HINT('ENABLE_PARALLEL_PLAN_PREFERENCE'), MAXDOP 0)` on the productivity query — it was added for a reason.
- Any query that currently uses `CROSS APPLY TOP 1` on `DIV_AUX` to avoid row multiplication when an agreement covers multiple debts. Keep this pattern.

## Required changes

Apply these three changes, in order. After each change, the file must still run and every endpoint must still return the correct data.

### Change 1 — Unify the productivity query into a single source of truth

**Problem.** Today there are two implementations of "productivity by agent, today":

1. `QUERY_PRODUTIVIDADE_HOJE` (a module-level f-string constant) — used by `/produtividade-hoje` and `/status-carga`.
2. `get_query_comparacao_agentes(db)` + `QUERY_AGENTES_UNIFICADO_BASE` — used by `/comparacao-agentes`, `/detalhamento-agentes`, and `/produtividade`.

They compute the same KPIs with small intentional granularity differences (see the `COUNT DISTINCT` note above). If the business rule changes, the developer has to update both. This is the highest-priority refactor.

**Action.** Create a single builder function that follows the pattern already used by the chart builders (`_build_primeira_parcela_dia_query`, `_build_excecoes_por_portfolio_query`, etc.) and the helper `_wrap_todos_or_single`:

```python
def _build_produtividade_query(db: str, *, use_distinct_esforco: bool) -> str:
    """
    Single source of truth for 'productivity by agent, today'.

    Parameters
    ----------
    db : str
        'COBwebRCBAUTOS', 'COBwebRCBCONSUMER', or 'todos'.
    use_distinct_esforco : bool
        When True, esforco uses COUNT(DISTINCT ID_CTO_MASTER) — matches the
        old QUERY_PRODUTIVIDADE_HOJE behavior used by /produtividade-hoje
        and /status-carga.
        When False, esforco uses COUNT(ID_CTO_MASTER) — matches the old
        get_query_comparacao_agentes behavior used by /comparacao-agentes,
        /detalhamento-agentes, and /produtividade.
    """
```

The `use_distinct_esforco` flag is the ONLY behavioral difference between the two old implementations. Do not "fix" either — they are different on purpose and downstream consumers depend on the current numbers.

Replace callers:
- `/produtividade-hoje/{db}` → `_build_produtividade_query(db, use_distinct_esforco=True)` (single-db validation — no "todos" here, matches current behavior).
- `/status-carga/{db}` → same as above, looped per database as today.
- `/comparacao-agentes/{db}`, `/detalhamento-agentes/{db}`, `/produtividade/{db}` → `_build_produtividade_query(db, use_distinct_esforco=False)` with todos support.

Delete `QUERY_PRODUTIVIDADE_HOJE`, `QUERY_AGENTES_UNIFICADO_BASE`, `_build_query_agentes_unificado`, and `get_query_comparacao_agentes` after the callers are migrated. The helper `_map_origem_filter` may still be needed for the `todos` branch of the new builder — keep it if so.

**Verification.** For each affected endpoint, run it against both databases and against `todos`, and diff the JSON response against a snapshot taken before the refactor. All values must be byte-identical except for the `meta.generated_at` timestamp and the `run_id`.

### Change 2 — Remove `_filter_excluded_agents()` from the post-query path

**Problem.** Every endpoint calls `_filter_excluded_agents(rows)` after `run_query()`. The SQL queries already embed `FILTRO_AGENTES_EXCLUIDOS_SQL`, which excludes the same agents at the database level. The Python-side filter is redundant work that iterates the result set a second time.

**Action.**
1. Audit every query in the file to confirm `FILTRO_AGENTES_EXCLUIDOS_SQL` (or its equivalent inline `NOT LIKE 'ANTLIA%' ...`) is applied in the `WHERE` clause. The chart builders, the agreements-table builder, and the productivity query all have it. `QUERY_ACORDOS_HOJE` has it inlined — convert it to use `FILTRO_AGENTES_EXCLUIDOS_SQL` for consistency.
2. Once every query is confirmed to filter at the SQL level, remove every `_filter_excluded_agents(...)` call site.
3. Delete `_filter_excluded_agents`, `_is_excluded_agent_row`, and `_normalize_agent_text`.
4. Keep the constants `EXCLUDED_AGENT_EXACT_NAMES` and `EXCLUDED_AGENT_PREFIXES` — they document the business rule and are referenced implicitly by `FILTRO_AGENTES_EXCLUIDOS_SQL`.

**Safety check.** Before deleting the Python filter, temporarily add an assertion in a dev build that compares `rows` to `_filter_excluded_agents(rows)` and logs a warning if they differ. Run the full endpoint suite. If the warning never fires, the filter is provably redundant and safe to remove. If it fires even once, investigate which query is missing the SQL filter before proceeding.

### Change 3 — Add a date predicate to `CTE_Saldo_Original`

**Problem.** In both `QUERY_PRODUTIVIDADE_HOJE` and `QUERY_AGENTES_UNIFICADO_BASE`, the CTE `CTE_Saldo_Original` reads from `REC_DIVIDAS` and `DIV_MASTER` with no date filter. It aggregates the entire debt history and only then joins with today's agreements. At low volume this is invisible; at scale it is the first thing that will break.

**Action.** Restrict `CTE_Saldo_Original` to only the `NR_RECEBIMENTO` values present in today's agreements. The cleanest form:

```sql
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
)
```

Apply the equivalent change in the `todos` branch (where `REC_DIVIDAS` and `DIV_MASTER` come from `UNION ALL` subqueries — the `origem` partitioning must be preserved).

**Verification.** For a day with real data, the output rows of the new and old queries must be identical in every column. Diff them. If `VR_ORIGINAL` changes for any row, a `REC_DIVIDAS` entry exists without a corresponding `REC_MASTER` row — investigate before merging.

## Out of scope for this refactor

Do not do any of the following in this pass, even if tempting:

- Do not introduce an ORM or query builder library.
- Do not split `main.py` into multiple modules. (That is a valid next step, but it should be its own PR after this one is verified.)
- Do not add caching or materialized intermediate tables.
- Do not change the Python-side filtering of `assessoria` (the substring match on `CHAVE` / `NOME`). It stays inline in the endpoint handler.
- Do not touch the frontend build (`agecob-lens/dist`) or the SPA fallback route.
- Do not modify the `.env` loading, CORS parsing, or rate-limit logic.
- Do not "improve" the `NOLOCK` usage, the `MAXDOP` hint, or the `CROSS APPLY TOP 1` pattern.

## Deliverable

A single modified `main.py` that:

1. Has a new `_build_produtividade_query(db, *, use_distinct_esforco)` function and no remaining references to `QUERY_PRODUTIVIDADE_HOJE`, `QUERY_AGENTES_UNIFICADO_BASE`, or `get_query_comparacao_agentes`.
2. Has no calls to `_filter_excluded_agents` anywhere, and the function itself (plus its helpers) is deleted.
3. Has `CTE_Saldo_Original` restricted by today's `NR_RECEBIMENTO` list in both the single-DB and the `todos` variants.
4. Passes a diff check: every endpoint, for every valid `{db}` value, returns the same JSON body (ignoring `generated_at` and `run_id`) as the pre-refactor version on the same input data.

## Reporting

After the refactor, produce a short markdown report containing:

- Line count before / after.
- The endpoint-by-endpoint diff verification results (pass / fail per endpoint).
- Any query where `FILTRO_AGENTES_EXCLUIDOS_SQL` had to be added during Change 2, with the commit/line reference.
- An explicit confirmation that `STATUS_APROVADOS`, `STATUS_EXCECAO`, `CPC_COMPLEMENTO_IDS`, `PRIMEIRA_PARCELA`, and `PORTFOLIO_COLUMN` were not modified.

If any change would require touching something in the "NOT allowed to change" or "Out of scope" list, stop and surface the conflict instead of working around it.
