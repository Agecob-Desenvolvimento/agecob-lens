# PR: Unify Query Logic and Finalize Production-Ready Data Pipeline

## Summary

This PR consolidates the architectural decisions made during the 2026-04-24 infrastructure validation and unifies the query strategy for both the same-day dashboard and the historical operational analysis. The core change: **one parameterized query replaces the implicit dual-query pattern**, ensuring metric consistency across time windows.

---

## Changes

### 1. Single Parameterized Query (Unified SQL)

The same SQL query now serves three use cases through `@start_date` / `@end_date` parameters:

| Use case | `@start_date` | `@end_date` |
|---|---|---|
| Same-day dashboard | `CAST(GETDATE() AS DATE)` | `DATEADD(DAY, 1, CAST(GETDATE() AS DATE))` |
| Historical analysis | `DATEADD(MONTH, -N, GETDATE())` | `CAST(GETDATE() AS DATE)` |
| Daily aggregation job | `CAST(GETDATE() - 1 AS DATE)` | `CAST(GETDATE() AS DATE)` |

**Rationale:** no duplicate queries, no risk of metric divergence between dashboard and historical views. The query plan is identical; only the index scan range changes proportionally with the window.

### 2. Acionamentos/Contatos CTE Added

The aggregation query (section 9.2) now includes a `CTE_Acionamentos` block pulling from `CTO_MASTER`, joined to `CTE_Acordos` via `FULL OUTER JOIN` on `dia`.

**Added columns to `fato_produtividade_portfolio`:**

```sql
qtd_acionamentos    INT NOT NULL DEFAULT 0,
qtd_contatos        INT NOT NULL DEFAULT 0
This enables the fact table to serve cpc_percentual and taxa_conversao historically — metrics previously available only for the current day via main.py.

3. Portfolio Dimension Limited to Acordos (Phase 1)
CTO_MASTER lacks a direct portfolio field. Acionamentos rows are assigned 'SEM_PORTFOLIO' in the join. Conversion rate by portfolio requires future validation of the ID_COMPLEMENTO → REC_DIVIDAS → DIV_AUX path.

Decision: portfolio-filtered conversion metrics deferred to phase 3. For phase 1, conversion rate is calculated at the banco level by grouping on dia + banco_origem, ignoring the SEM_PORTFOLIO rows for acionamentos. This is documented explicitly in sections 5.1 and 9.2.

4. Granularity Decision Finalized (Issue #7 Resolved)
Dimension	Phase 1	Future
dia	✓	✓
portfolio	Acordos only	Acionamentos (if ID_COMPLEMENTO path validated)
banco_origem	✓	✓
hora	✗	Phase 3+ (requires separate fato_produtividade_hora or column)
agente	✗	Phase 3+ (requires fato_produtividade_agente)
Hourly, agent-level, cohort, and marginal-efficiency cuts are explicitly out of phase 1 scope — enforced in sections 5, 6.2, and 9.1.

5. Endpoint Contracts Adjusted
GET /dashboard/operacional/descritivo/{db} (section 5.1): response contract now reflects only fields materially available from fato_produtividade_portfolio in phase 1.

GET /dashboard/operacional/diagnostico/{db} (section 5.2): corte= values agente, dispersao, cohort, eficiencia_marginal removed from phase 1 scope.

corte=hora and corte=correlacao remain in the document but flagged as dependent on future fact tables with hourly/agent grain.

6. Backend Filtering Strategy
FastAPI endpoint receives optional start_date / end_date query params:

python
@app.get("/dashboard/produtividade/{db}")
async def produtividade(
    db: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
Behavior:

No params → defaults to today's window (CAST(GETDATE() AS DATE) to tomorrow). Backward-compatible with existing dashboard — zero frontend changes required.

With params → any historical window.

No middleware needed. The endpoint function is the filter boundary. Params are validated, passed to the unified query, and the SQL Server execution plan adapts to the date range via existing indexes.

Infrastructure Validation (Pre-PR Checks)
6.1 Indexes Confirmed
All required indexes exist on production tables (COBwebRCBCONSUMER and COBwebRCBAUTOS):

Table	Index	Coverage
REC_MASTER	IND_REC_MASTER_DT_EMISSAO	Historical queries by agreement date ✓
CTO_MASTER	IND_CTO_MASTER_DATA	Historical queries by contact date ✓
CTO_MASTER	IND_CTO_MASTER_ID_USUARIO	Agent joins ✓
Conclusion: no new indexes required before phase 1.

6.2 Performance Tests (6-Month Window)
Queries executed against COBwebRCBCONSUMER on production server:

Query pattern	Window	Time	Verdict
CTO_MASTER aggregated by day	6 months	~5s	Viable
REC_MASTER aggregated by day	6 months	<1s	Viable
Direct row-level join (CTO_MASTER × REC_MASTER)	6 months	~81s	Do not use
CTEs + aggregate join	6 months	~1s	Confirmed pattern
Lesson documented (section 8.2): joins between CTO_MASTER and REC_MASTER must always be between aggregates (CTE-to-CTE), never row-to-row. Direct joins cause implicit Cartesian products and 81× degradation.

6.3 Reshuffle Context (CARGA_LOTE)
Discovered during validation. Classification thresholds established (section 10):

Event type	Threshold
Routine load	QTD_CLI <= 500
Relevant load	500 < QTD_CLI <= 10,000
Reshuffle event	QTD_CLI > 10,000
These serve as visual markers on historical charts, signaling when volume changes are explained by portfolio imports rather than performance shifts.

Architecture (Final)
text
                    ┌─────────────────────────────────┐
                    │       QUERY UNIFICADA.sql         │
                    │       @start_date                 │
                    │       @end_date                   │
                    └───────────────┬───────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
    ┌───────▼────────┐   ┌──────────▼──────────┐   ┌───────▼────────┐
    │  Dashboard      │   │  Análise            │   │  Job de         │
    │  Hoje           │   │  Operacional        │   │  Agregação      │
    │  (sem params)   │   │  (c/ params)        │   │  (incremental)  │
    │                 │   │                     │   │                 │
    │  Retorna JSON   │   │  Retorna JSON       │   │  Insere na fato │
    └─────────────────┘   └─────────────────────┘   └─────────────────┘
One query. Three use cases. Parameters determine the window.

Open Decisions (Unchanged)
#	Decision	Status
1	Final area name ("Operational Analysis" provisional)	Pending
3	Unify with /produtividade-historico/{db} (recommended: unify)	Pending
4	Final prescriptive rule list for v1	Pending — business confirmation needed
5	Rule parameter values (N, X, thresholds)	Pending — business must provide
6	Aggregation job runtime location (SQL Agent / Python cron / external)	Pending
8	Alert retention policy (proposed: 90 days)	Pending
9	Permission to create tables on Agecob DB	Pending — DBA sign-off required
11	BoxPlot implementation (Recharts has no native support)	Pending
Files Changed
docs/future implem/pipeline-analise-operacional_v2.md — full update incorporating all validated decisions, unified query structure, adjusted scope boundaries, and infrastructure validation results.

Next Steps
Get DBA sign-off to create fato_produtividade_portfolio on Agecob DB (decision #9).

Implement parameterized endpoint in main.py — add optional start_date / end_date params to existing /dashboard/produtividade/{db} (phase 1).

Build aggregation job — schedule the unified query with incremental window to populate the fact table (phase 1).

Business review — confirm prescriptive rule list (decision #4) and provide initial YAML parameter values (decision #5).

Reviewers
@dba — table creation permissions

@business — rule parameters and v1 scope

@frontend — endpoint contract alignment