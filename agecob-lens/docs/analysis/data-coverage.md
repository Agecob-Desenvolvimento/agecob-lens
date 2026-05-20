# Placeholder and Endpoint Coverage Analysis

## Screen Coverage Matrix

| Screen/Block | Current Source | Status | Gap |
|---|---|---|---|
| `Index` KPI row | `/dashboard/produtividade-hoje/{db}` | Covered | None |
| `Index` productivity cards | `/dashboard/produtividade-hoje/{db}` | Covered | None |
| `Index` reference/dispersion/bottom cards | `/dashboard/produtividade-hoje/{db}` | Partially covered | Uses derived metrics only |
| `ComparacaoAgentes` top chart + table | `/dashboard/produtividade-hoje/{db}` + `/dashboard/produtividade-agentes` | Covered | None |
| `ComparacaoAgentes` resilience | `health` + productivity | Covered | Needed partial-failure handling (implemented) |
| `AnaliseProdutividade` chart area | `/dashboard/produtividade-hoje/{db}` | Partially covered | Built with derived aggregates |
| `DetalhamentoAgentes` chart area | `/dashboard/produtividade-hoje/{db}` | Partially covered | Built with derived aggregates |

## Placeholder Findings

- Placeholders in home and analysis pages were mostly UI scaffolding.
- Main data endpoint already returns core metrics needed for first version:
  - `qtd_acionamentos`
  - `qtd_contatos`
  - `qtd_acordos`
  - `valor_acordos`
  - conversion-related percentages.
- Missing fields for richer visuals (for example explicit `tempo_trabalhado`) are not in the current contract.

## Data Sufficiency Check

- For operational dashboard cards and ranking charts: **sufficient**.
- For deep behavior analytics (pause time, timeline, activity states): **insufficient** with current endpoint.

## Recent contract update

- Added unified endpoint: `GET /dashboard/produtividade-agentes`.
- Response now supports both granularities in one call:
  - consolidated by normalized agent key across databases,
  - split by database in `by_database` (`AUTOS` / `CONSUMER`).
- Cache behavior:
  - default cached calls within TTL,
  - manual bypass with `?force_refresh=true`.

## Productivity Analysis Expansion Study

Business context to validate:
- Only one office currently appears in "Análise por Escritório".
- Data longevity requirement: **28 months and 15 days**.

### What is possible right now

- The current endpoint in app usage is daily productivity and supports short-range operational insights.
- Frontend can increase display volume by:
  - showing more rows,
  - adding pagination,
  - improving grouping/filtering.

### What is missing for long-history expansion

- Historical date range parameters in productivity endpoint.
- Source-level historical query/windowing for 28 months + 15 days.
- Office dimension guarantees for full cross-office analysis.

### Recommended one-page pilot (`AnaliseProdutividade`)

1. Add a dedicated productivity-history endpoint with date range (`start_date`, `end_date`) and office filters.
2. Keep all other pages unchanged.
3. Validate:
   - office cardinality > 1 when data exists,
   - timeline coverage for 28 months + 15 days,
   - query performance and payload size.

## Decision

- There is scope to increase data volume in one page (`AnaliseProdutividade`), but for full historical target the backend needs at least one new history-capable source/query.
