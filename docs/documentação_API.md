# AgDash Backend — API Documentation

> Backend-oriented reference: architecture, full endpoint inventory, security model,
> business rules, and technical decisions behind the FastAPI service that powers AgDash.
> Written for the Lovable frontend handoff — Lovable will edit the SPA only; this API
> keeps running where it runs today (see `README.md` → "Deploy em produção").

**Related docs (do not duplicate, cross-reference):**

| Doc | Covers |
|---|---|
| [`agecob-lens/docs/api-contract.md`](../agecob-lens/docs/api-contract.md) | Frontend consumer view — every `fetch*()` helper, TS row types, query param casing. Source of truth for response *shapes*. |
| [`agecob-lens/docs/data-layer.md`](../agecob-lens/docs/data-layer.md) | Business rules for data/metrics work. **Mandatory full read** before touching fetching, ViewModels, selectors, or the data contract. |
| [`README.md`](../README.md) | Quickstart, deploy runbook, `.env` reference, SQL index ops. |
| `agecob-lens/docs/regras/id-rec-status.md` | `ID_REC_STATUS` enum lookup — verified current, matches code. |
| `agecob-lens/docs/regras/decisoes-tecnicas.md` | Full ADR history (lightweight ADR format) — see §6, some entries are stale. |

---

## 1. Architecture

```
Browser / Lovable SPA
        │  fetch (X-Run-Id header only)
        ▼
Caddy (prod, LAN only)  ── TLS + Basic Auth, injects X-API-Key + Authorization: Bearer
        │
        ▼
FastAPI app (main.py)
        │  api_prefix_middleware   → strips /api prefix
        │  security_middleware     → auth + rate limit + run_id
        ▼
api/routers/*.py  (7 routers, all included in main.py)
        │
        ▼
dominios/*/  (domain services: build SQL, apply business rules)
        │
        ▼
core/database/query_executor.run_query()
        │
        ▼
core/database/pool_manager.PoolManager   (pooled pyodbc connections)
        │
        ▼
SQL Server — COBwebRCBAUTOS | COBwebRCBCONSUMER
```

Everything funnels through `run_query()` — no route or domain module opens a
`pyodbc` connection directly. Response bodies are built by
`build_response_envelope()` (`core/utils/response_envelope.py:27`), except the
documented exceptions (§4.7).

### Routers (`main.py:63-69`)

| Router file | Prefix | Registered in |
|---|---|---|
| `api/routers/dashboard.py` | `/dashboard` | `main.py:63` |
| `api/routers/efetividade.py` | `/efetividade` | `main.py:64` |
| `api/routers/admin.py` | `/admin` | `main.py:65` |
| `api/routers/health.py` | `/health` | `main.py:66` |
| `api/routers/ritmo_dia.py` | `/dashboard` (shares dashboard's prefix) | `main.py:67` |
| `api/routers/regressao.py` | `/regressao` | `main.py:68` |
| `api/routers/agente.py` | `/agente` | `main.py:69` |

`api/static.py` additionally serves the built SPA (`dist/`) at `/` in production.

### Connection pool (`core/database/pool_manager.py`)

- One `queue.Queue` per database name, lazily created, max size `DB_POOL_SIZE` (default 6).
- Connections are reused if alive and younger than `DB_POOL_MAX_AGE_SECONDS`
  (default 1800s); otherwise closed and reopened.
- Opened with `autocommit=True` — workload is read-only; without it SQL Server
  keeps an implicit transaction open for the connection's life in the pool,
  blocking log truncation (`pool_manager.py:56-59`).
- Liveness check is a `SELECT 1` before handing out a reused connection.

### Query executor (`core/database/query_executor.py`)

- `run_query(sql, database_name, params, run_id, context)` — the only sanctioned
  path to the database (per `data-layer.md`, no exceptions).
- Sets `conn.timeout = DB_QUERY_TIMEOUT_SECONDS` (default 60s) per query — the
  connect-time timeout only covers login.
- `pyodbc.Error` with SQLSTATE `HYT*` → HTTP `504` (distinguishable "slow" from
  "broken"); any other DB error → `500`. Both wrapped in the response envelope's
  `errors[]`, never a bare stack trace.

### Cache (`core/cache/cache_manager.py`)

- In-memory, TTL from `DASHBOARD_CACHE_TTL` (default 60s, `0` disables).
- **Single-flight**: concurrent requests for the same cache key share one
  `fetcher()` execution instead of firing duplicate queries — followers wait up
  to `CACHE_LEADER_WAIT_TIMEOUT` (`DB_QUERY_TIMEOUT_SECONDS + 5`) then get a
  `504` if the leader is still running.
- Bounded to `DASHBOARD_CACHE_MAX_ENTRIES` (default 500) — evicts expired
  entries first, then the soonest-to-expire. Cache keys embed free-form client
  strings (portfolio, agent, dates), so this cap exists specifically to stop
  unbounded growth.
- Process-local. Service restart clears it (NSSM restart in `atualizar.bat`).

---

## 2. Security Model

Relevant to the Lovable decision already discussed (Option A: edit-only, vs
Option B: Lovable hosts production and calls this API over the public internet).

### Auth (`api/dependencias.py:22`, `require_auth`)

- Header pair: `X-API-Key: <API_KEY>` + `Authorization: Bearer <API_TOKEN>`.
- Constant-time compare (`hmac.compare_digest`) on both — avoids timing
  side-channel.
- Active only when `REQUIRE_API_AUTH=true`. Default `false` (LAN dev).
- **The SPA bundle never carries the credential.** `agecob-lens/src/services/api.ts`'s
  `request()` sends only `X-Run-Id`. In production, Caddy injects
  `X-API-Key`/`Authorization` into the upstream call after its own Basic Auth
  gate (`infra/Caddyfile`) — this is *why* the Caddy layer exists, not an
  incidental detail. **A frontend hosted directly on Lovable would have nowhere
  to put this injection step** — that's the crux of Option B's risk flagged
  earlier in this conversation.

### What requires auth (`api/middleware.py:22`, `security_middleware`)

Only `/` is open. Every other prefix — `/dashboard/`, `/efetividade/`,
`/regressao/`, `/health/`, `/admin/`, `/agente/` — requires auth *when
`REQUIRE_API_AUTH=true`*. `/health/*` is gated too (monitoring tools need the
credential in prod).

### Rate limiting (`api/dependencias.py:41`, `rate_limit_dashboard`)

- `75` requests / `60`s window, bucketed by `(client_ip, api_key)`.
- Applies only to `/dashboard/`, `/agente/`, `/admin/`, `/regressao/` — `/health/`
  and everything else is excluded so monitoring and normal SPA navigation aren't
  throttled.
- Bucket dict is pruned past `5000` entries to bound memory.

### Execution gate

`ENABLE_VALIDATED_ROUTES` (default `true`) — when `false`, every `/dashboard/*`
call returns `503` regardless of auth. Applies to `/dashboard/*` only, not the
other routers.

### Docs exposure

`/docs`, `/redoc`, `/openapi.json` are auto-disabled whenever
`REQUIRE_API_AUTH=true` (`main.py:42-49`) — kept off the LAN schema surface in
production.

### CORS

`CORS_ALLOW_ORIGINS` env (default `http://127.0.0.1:5173,http://localhost:5173`).
`CORS_ALLOW_CREDENTIALS` forced `false` if `*` is in the origin list
(`config/settings.py:263-273`).

---

## 3. Environment Variables (backend)

Beyond what's already in `README.md`'s table:

| Variable | Default | Purpose |
|---|---|---|
| `RATE_LIMIT_REQUESTS` / `RATE_LIMIT_WINDOW_SECONDS` | `75` / `60` | Hardcoded, not env-driven (`config/settings.py:281-282`) |
| `ENABLE_VALIDATED_ROUTES` | `true` | Kill switch for all `/dashboard/*` |
| `DASHBOARD_CACHE_MAX_ENTRIES` | `500` | Cache eviction ceiling |
| `DB_QUERY_TIMEOUT` | `60` | Per-query timeout (seconds), maps to `conn.timeout` |
| `ENABLE_AGENT_CHAT` | `false` | Gates `/agente/chat` |
| `AGENT_PROVIDER` | `anthropic` | `anthropic` or `deepseek` |
| `ANTHROPIC_API_KEY` / `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` | — | Chat agent LLM credentials |
| `AGENT_MODEL` | `claude-sonnet-4-6` (or `deepseek-chat`) | Chat agent model override |
| `AGENT_MAX_TOOL_ITERS` | `4` | Chat agent tool-call loop cap |
| `AGENT_HTTP_TIMEOUT` | `60` | Per-call budget to the LLM provider |
| `CORS_ALLOW_ORIGINS` | `127.0.0.1:5173,localhost:5173` | CSV of allowed origins |
| `CORS_ALLOW_CREDENTIALS` | `false` | Forced `false` if origins include `*` |
| `SENTRY_DSN` / `SENTRY_TRACES_SAMPLE_RATE` / `SENTRY_ENABLE_LOGS` | empty / `0.1` / `true` | Error + perf monitoring, no-op if DSN empty |

---

## 4. Endpoint Inventory

Full paths, verified against `@router.get/post` decorators in `api/routers/*.py`
(not just what the frontend happens to call — see §7 for two that the frontend
calls but the backend doesn't implement). Row shapes, query params and TS types
live in `api-contract.md`; this table is the path/method/gate reference.

All routes below require auth + are rate-limited when `REQUIRE_API_AUTH=true`,
except where noted.

### `/health` — not rate-limited

| Method | Path | Notes |
|---|---|---|
| GET | `/health/live` | Liveness only — never touches the DB (`health.py:27`) |
| GET | `/health/ready` | Per-DB readiness + ETL freshness, `503` if any DB down |
| GET | `/health/db` | All configured DBs, `503` if any down |
| GET | `/health/db/{database_name}` | Single DB |

### `/dashboard` — rate-limited, gated by `ENABLE_VALIDATED_ROUTES`

| Method | Path |
|---|---|
| GET | `/acordos-hoje` |
| GET | `/acordos-hoje/todos` |
| GET | `/acordos-hoje/{database_name}` |
| GET | `/acordos-hoje-agente/{db}` |
| GET | `/tabela-performance-periodo/{db}` |
| GET | `/portfolios/{database_name}` |
| GET | `/produtividade-hoje/{database_name}` |
| GET | `/status-carga/{db}` |
| GET | `/comparacao-agentes/{db}` (dual-registered, also accepts `{database_name}`) |
| GET | `/detalhamento-agentes/{database_name}` |
| GET | `/produtividade/{database_name}` (alias of `comparacao-agentes`) |
| GET | `/produtividade-agentes` (`?force_refresh=true`) — **response shape differs**, see §4.7 |
| GET | `/primeira-parcela-dia/{db}` |
| GET | `/primeira-parcela-por-portfolio/{db}` |
| GET | `/primeira-parcela-por-agente/{db}` |
| GET | `/excecoes-por-portfolio/{db}` |
| GET | `/excecoes-por-agente/{db}` |
| GET | `/excecoes-sem-portfolio/{db}` |
| GET | `/rejeitados-por-portfolio/{db}` |
| GET | `/quebrados-por-portfolio/{db}` |
| GET | `/acordos-por-portfolio/{db}` |
| GET | `/portfolio-rollup/{db}` |
| GET | `/excecoes-detalhe/{db}/{portfolio}` |
| GET | `/acordos-detalhe/{db}/{portfolio}` |
| GET | `/rejeitados-detalhe/{db}/{portfolio}` |
| GET | `/quebrados-detalhe/{db}/{portfolio}` |
| GET | `/acordos-detalhe-todos/{db}` |
| GET | `/excecoes-detalhe-todos/{db}` |
| GET | `/rejeitados-detalhe-todos/{db}` |
| GET | `/excecoes-detalhe-agente/{db}/{agente}` |
| GET | `/rejeitados-detalhe-agente/{db}/{agente}` |
| GET | `/quebrados-detalhe-agente/{db}/{agente}` |
| GET | `/benchmarks/{db}` (`?lookback_months=9`) |
| GET | `/metas` |
| POST | `/metas/upload` (`multipart/form-data`, field `file`) |
| GET | `/real-por-portfolio/{db}` |
| GET | `/ritmo-dia/{db}` (registered in `ritmo_dia.py`, shares `/dashboard` prefix) — **response shape differs**, see §4.7 |

### `/efetividade` — **not** rate-limited, **not** gated by `ENABLE_VALIDATED_ROUTES`

| Method | Path |
|---|---|
| GET | `/diaria-primeira`, `/diaria-colchao`, `/diaria-colchao-vencimento` |
| GET | `/mensal-primeira`, `/mensal-colchao`, `/mensal-colchao-vencimento` |
| GET | `/mensal-agente-primeira`, `/mensal-agente-colchao`, `/mensal-agente-colchao-vencimento` |
| GET | `/resumo` (`date_from`, `date_to`, `parcela_tipo`, `db`, `id_portfolio`) |
| GET | `/boletos-detalhe` (drill-down) |
| GET | `/curva-quebra` |

### `/admin` — gated additionally by `ENABLE_INDEX_ADMIN`

| Method | Path |
|---|---|
| GET | `/indexes/status/{database_name}` |
| POST | `/indexes/apply/{database_name}` (`dry_run`, `online`, `update_statistics`) |

`database_name` here only accepts `COBwebRCBAUTOS` / `COBwebRCBCONSUMER` — not `todos`.

### `/regressao`

| Method | Path |
|---|---|
| POST | `/agentes` — body `{ pontos: RegressionPoint[] }`, fits sklearn models server-side per request (CPU-bound, hence its own rate-limit bucket) |

### `/agente` — gated by `ENABLE_AGENT_CHAT`

| Method | Path |
|---|---|
| POST | `/chat` — body `{ messages, database, dateFrom, dateTo }`. Calls out to Anthropic or DeepSeek per `AGENT_PROVIDER`; costs money per call, hence its own rate-limit bucket. |

### 4.7 — Envelope exceptions

Not every endpoint returns `{meta, data, errors}`:

| Endpoint | Actual shape |
|---|---|
| `/dashboard/produtividade-agentes` | `{generated_at, cache_age_seconds, agents}` — no `meta`/`data`/`errors` at all (`dominios/produtividade/servico.py`) |
| `/dashboard/ritmo-dia/{db}` | `meta` carries model/operational fields (`em_operacao`, `modelo`, …), `data` is a single object, not an array |
| `/dashboard/metas` | `{meta, metas}` — no `data`/`errors` on the happy path |
| `/dashboard/benchmarks/{db}` | `data` is a single `BenchmarkData` object, not an array |
| `/admin/indexes/*` | Plain response, no envelope |

A `response_model` unifying these was proposed and explicitly rejected — see
ADR-012 in §6.

---

## 5. Business Rules (code-verified)

Cross-checked line-by-line against `config/settings.py` on 2026-08-17. Treat
this section, `data-layer.md`, and `id-rec-status.md` as authoritative — see §7
for two sibling docs that are **stale** and contradict this.

### `ID_REC_STATUS` enum (`REC_MASTER.ID_REC_STATUS`)

| ID | Name | Business meaning |
|---|---|---|
| 1 | ATIVO | Firm agreement, awaiting first payment |
| 2 | QUEBRA | Client didn't pay, agreement cancelled |
| 3 | BAIXA POR PAGAMENTO | Agreement paid off |
| 4 | A ENVIAR | Registered, not yet processed |
| 5 | PENDENTE | Awaiting internal validation — **business calls this "Exceção"** |
| 6 | APROVADO | Passed discount approval workflow |
| 7 | REJEITADO | Supervisor or bank denied the proposal |
| 8 | PROPOSTA | Simulation — never counts toward any KPI |
| 9 | BAIXA MANUAL | Manually confirmed payment |
| 10 | QUEBRA AUTOMÁTICA | System-cancelled on grace-period overrun |
| 11 | EXCEÇÃO | Off-standard negotiation awaiting bank approval — **not** what the dashboard calls "Exceção" (that's ID 5) |
| 12 | BAIXA PAGTO AVULSO | Client paid a different amount than billed |

### Derived constants (`config/settings.py:45-65`)

```python
STATUS_APROVADOS        = (1, 3, 12)
STATUS_EXCECAO          = (5,)                    # PENDENTE — business "Exceção"
STATUS_REJEITADO        = (7,)
STATUS_QUEBRADO         = (2,)
STATUS_QUEBRA_AUTOMATICA = (10,)
STATUS_GERADOS          = (1, 2, 3, 10, 12)        # approved + both break types
STATUS_UNIVERSO_ACORDOS = (1, 2, 3, 5, 10, 12)     # generated + exception
```

`STATUS_GERADOS` is the base for every "generated value" KPI: `valor_acordos`,
first-installment value, `qtd_acordos`, ticket, and boleto conversion/effectiveness.
An agreement generated today counts even if it later breaks (2) or auto-breaks
(10) — breaking is a downstream outcome, not an undo of generation.

### CPC / contact funnel (current as of 2026-08-19 — supersedes older ADRs, see §7)

Two distinct layers, not one:

| UI label | Question | SQL | Field |
|---|---|---|---|
| **Contato** | "Did anyone pick up?" (Alô) | `CTO_COMPLEMENTO.ALO = 1` | `qtd_alo` |
| **CPC** | "Did I reach the right person?" (RPC) | `CTO_COMPLEMENTO.ALO = 1 AND CTO_COMPLEMENTO.CONTATO = 1` | `qtd_contatos` |

Changed 2026-08-19: replaced the curated `COD_COMPLEMENTO` allowlist
(`449,452,453,454,455,459`) with the `CONTATO` bit — business decision, not a
revert of the earlier "too broad" finding for `CONTATO=1` used *without*
`ALO=1` (still fires on WhatsApp auto-dispatch, boleto send, dropped calls).
The `AND ALO=1` guard keeps the funnel monotonic:
`acionamentos ≥ qtd_alo ≥ qtd_contatos ≥ acordos`.

### Other canonical rules

| Rule | Value |
|---|---|
| First installment | `PARCELA = 0` (never normalize to 1) |
| Portfolio | `DIV_AUX.CAMPO010`, resolved via `CROSS APPLY TOP 1` (never a plain `JOIN` — row multiplication) |
| Excluded agents | `COBDESANTOS`, `ANTLIA%`, `INTERNA%`, `suporte%`, `SISTEMA%` — filtered **only** in SQL (`FILTRO_AGENTES_EXCLUIDOS_SQL`), never post-processed in Python |
| Agent key | `USU_MASTER.CHAVE`, not `COD_USUARIO` |
| Cross-database agents | Separate entities per database by default; consolidated only via `CHAVE` match in `/produtividade-agentes` |
| Two grains of `qtd_acordos` | `qtd_acordos` (per-agreement) drives ticket médio and Conversão %; `qtd_acordos_por_contrato` (per-contract) is **only** the Home global KPI card — never use as a denominator |

---

## 6. Architecture Decisions (condensed from `decisoes-tecnicas.md`)

| ADR | Decision | Status |
|---|---|---|
| 001 | Monolithic `main.py` | **Superseded** — codebase is now modular (`api/`, `core/`, `dominios/`, `config/`), confirmed by ADR-012's own audit and by this repo's current layout |
| 002 | Separate CTEs per aggregate, join aggregates — never join raw rows | Permanent. Direct join caused an implicit cartesian product (81s query → 1s) |
| 003 | Fact table without agent dimension in phase 1 | Active. Per-agent cuts deferred to a future `fato_produtividade_agente` |
| 004 | `CROSS APPLY TOP 1` for portfolio resolution | Permanent. Plain `JOIN` against `DIV_AUX` multiplies rows |
| 005 | Agent exclusion filtered in SQL only | Permanent. Python-side filtering was redundant and removed |
| 006 | CPC IDs hardcoded | **Superseded 2026-08-19** — the curated `COD_COMPLEMENTO` allowlist (§5's prior truth) was replaced by `ALO=1 AND CONTATO=1`. ADR-012's "CPC = `CTO_COMPLEMENTO.CONTATO=1`" is now directionally right but incomplete (missing the `ALO=1` guard) |
| 007 | Cross-database agents kept separate by default | Active |
| 008 | Implementation prompts written in English | Active (internal decision docs stay Portuguese) |
| 009 | ADD-ONLY discipline — refactors are separate prompts from additions | Active |
| 010 | Prescriptive rules externalized to YAML | Planned, **not implemented** |
| 011 | `freshness_status`/`last_aggregation_at` in response `meta` | Planned, **not implemented** |
| 012 | Corrected false premises in perf-tuning prompts written against the old monolith (orjson, `response_model`, thread-local pool) | Active. `orjson` was tried and **reverted** — FastAPI 0.136 deprecated `ORJSONResponse` and the dependency mismatch caused a production 500 outage |

**Why §5 overrides ADR-006 here:** `decisoes-tecnicas.md` was last updated
2026-05-29. `data-layer.md` documents CPC events through 2026-07-27 (the
`COD_COMPLEMENTO` code curation) and is the mandatory-read source of truth for
data work. Verified directly against `config/settings.py:82` — the code matches
`data-layer.md`, not the ADR file.

---

## 7. Known Gaps & Inconsistencies

Confirmed by reading the actual code — flagging rather than silently
documenting as if these work, since this doc will inform the Lovable handoff.

### 7.1 — Two frontend calls with no backend route

`agecob-lens/src/services/api.ts` defines and `api-contract.md` documents:

- `fetchRejeitadosTotais(db, …)` → `GET /dashboard/rejeitados-totais/{db}`
- `fetchRejeitadosPorAgente(db, …)` → `GET /dashboard/rejeitados-por-agente/{db}`

Neither path exists in `api/routers/dashboard.py` (confirmed: no
`@router.get("/rejeitados-totais...")`, no `rejeitados_totais`/
`rejeitados_por_agente` function anywhere in the repo). Calling either 404s.
**Currently harmless** — grepped `agecob-lens/src`, no component imports either
function, so this isn't firing in the running app. Worth fixing (add the routes,
or remove the dead frontend helpers) before anyone wires them up expecting them
to work — Lovable's editor won't know the difference between a real and a
dead API helper.

### 7.2 — Stale docs (do not use as source of truth)

- `agecob-lens/docs/regras/regras-de-negocio.md` (2026-04-27, never updated) —
  still states `STATUS_UNIVERSO_ACORDOS = (1, 3, 5, 12)`, which contradicts
  current code. Its CPC via `CTO_COMPLEMENTO.CONTATO=1` claim is now
  directionally correct again as of 2026-08-19 but still stale — missing the
  `ALO=1` guard current code requires. `agecob-lens/docs/regras/id-rec-status.md`
  is the current, code-matching sibling for the status question — use that one
  instead.
- `decisoes-tecnicas.md` ADR-006/012's CPC claim — see §6.

### 7.3 — Backlog gaps (already tracked in `api-contract.md`)

Listed there in full; summarized here for visibility: no per-BU/per-day meta
breakdown (PDF is quarterly/per-portfolio only), no multi-metric `/ritmo-dia`
heatmap (only acordos + valor), no server-side team median (frontend-computed
from `/produtividade-hoje` rows).

---

## 8. Document Map

| Question | Read |
|---|---|
| "What does endpoint X return, exactly?" | `agecob-lens/docs/api-contract.md` |
| "What's the formula/rule for metric Y?" | `agecob-lens/docs/data-layer.md` |
| "Why was this built this way?" | This doc §6, or `agecob-lens/docs/regras/decisoes-tecnicas.md` |
| "How do I deploy / roll back / add a SQL index?" | `README.md` |
| "How is the LAN secured (Caddy, TLS, Basic Auth)?" | `README.md` → "Segurança LAN" + `docs/security-hardening.md` |
| "What did the pentest find?" | `docs/pentest-report.md` |
