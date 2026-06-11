# CLAUDE.md

Persistent project context for **dash relatorio** (AgDash). Read automatically at each session.

---

## Project

Monorepo: executive collections dashboard for AgeCob. Consumes SQL Server (databases `COBwebRCBAUTOS` and `COBwebRCBCONSUMER`), serves a FastAPI API + built SPA React.

- **Backend:** Python 3.8+, FastAPI, pyodbc, SQL Server (ODBC Driver 17). Historic monolith in `main.py` + modules `api/`, `core/`, `dominios/`, `config/` (ADR-001).
- **Frontend:** `agecob-lens/` — Vite + React 18 + TypeScript + Tailwind + shadcn/ui + Recharts + TanStack Query + React Router.
- **Deploy:** Windows Server via NSSM (`AgecobAPI`), port 8000, `atualizar.bat` does pull + build + restart.

## Required reading at session start

Before any action, read in this order:

1. @agecob-lens/docs/CLAUDE.md — executive redesign: "Wrong or Act" rule, official metric dictionary, presentation rules, anti-patterns, information architecture, components, acceptance criteria.
2. @agecob-lens/docs/TASKS.md — backlog in waves (A → D). Execute only items **not** marked with `[x]`. Mark `[x]` **immediately** upon completion, before the next.
3. @README.md — quickstart, endpoints, `.env` configuration, rollback, SQL indexes.

These rules take precedence over alternative interpretations from the code.

> **MANDATORY when touching data:** any work that involves fetching, ViewModels, selectors, metrics, adapters, or the data contract (frontend or backend) requires reading **@agecob-lens/docs/data-layer.md IN FULL** before any edit. Applies to the main session and every sub-agent. Without a complete read, do not edit data code.

---

## Commands

Frontend (run inside `agecob-lens/`):

```cmd
npm run dev       # vite dev server
npm run build     # production build → dist/
npm run lint      # eslint
npm run test      # vitest run
npm run test:watch

Backend:
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000

Server (production C:\agecob): atualizar.bat does git pull + pip + npm build + restart NSSM.

Graph (after relevant changes): /graphify . --update

Code Style
Python: PEP 8, 4 spaces, type hints where they already exist, short docstrings. run_query() for SQL — do not create manual connections. Use build_response_envelope() for standardized responses.

TypeScript/React: 2 spaces, named exports, centralized formatting functions (fmtBRL, fmtPct, fmtNum). UI components come from src/components/ui/ (shadcn) — do not duplicate. cn() from lib/utils.ts for conditional classes.

State: TanStack Query for server data, global context (GlobalFiltersContext) for period/database filters. Do not bloat contexts.

Imports: absolute using @/ alias on the frontend.

No explanatory comments for the obvious. Comment only the why that is non-obvious (constraint, invariant, workaround). Never comment the what.

Business rules (critical — do not infer from code)
Rule	Canonical value
First installment	PARCELA = 0
Approved agreements (ID_REC_STATUS)	IN (1, 3, 12)
Generated amounts (STATUS_GERADOS)	IN (1, 2, 3, 10, 12) — approved + QUEBRA(2) + QUEBRA AUTOMÁTICA(10). Basis for valor_acordos, 1ª parcela, qtd_acordos, ticket and boletos (conversion/effectiveness)
Exceptions (ID_REC_STATUS)	IN (5) — the business calls "Exceção" the status that the REC_MASTER enum names as PENDENTE
Broken boletos (ID_REC_STATUS)	IN (2)
CTE pre-filter	IN (1, 2, 3, 5, 10, 12) — generated + exception
Portfolio	DIV_AUX.CAMPO010
Default date filter	DT_EMISSAO >= @Today AND DT_EMISSAO < @Tomorrow
NOLOCK	Mandatory on all read tables
Excluded agents	COBDESANTOS, ANTLIA%, INTERNA%, suporte%, SISTEMA% — apply in SQL (ADR-005), never in post-processing
Contact (CPC)	CTO_COMPLEMENTO.CONTATO = 1 — JOIN CTO_MASTER.ID_COMPLEMENTO = CTO_COMPLEMENTO.ID_COMPLEMENTO (replaced the hardcoded list of IDs)
Databases	COBwebRCBAUTOS | COBwebRCBCONSUMER | todos
Official metric dictionary (CPC, Conversion, Average ticket, Exceptions) is in agecob-lens/docs/CLAUDE.md. Do not create variations.

Architecture — critical points
God nodes (high connectivity — be careful when touching): run_query(), config/settings.py, cn(), request(), build_response_envelope(), _agent_ndjson(), get_efetividade().

Separate CTEs for aggregates (ADR-002). Do not unify without justification.

CROSS APPLY TOP 1 for portfolio instead of JOIN (ADR-004).

Fact table without agent dimension in phase 1 (ADR-003).

In-memory cache with configurable TTL (DASHBOARD_CACHE_TTL, default 60s). Restarting the service clears the cache.

Connection pool per database per worker (DB_POOL_SIZE, default 6).

Key routes: /dashboard/* (KPIs), /efetividade/* (boletos), /admin/indexes/* (DBA, gated by ENABLE_INDEX_ADMIN), /health/db/{db}, /ritmo-dia (KNN).

Frontend pages → question they answer:

Page	Question
Index.tsx / Dashboard	"How are we doing?"
AnaliseProdutividade.tsx	"Why?"
DetalhamentoAgentes.tsx	"Who / how is this agent?"
ComparacaoAgentes.tsx	"Who to prioritize / allocate?"
EfetividadeBoletos.tsx	"Are boletos being paid?"
Context Navigation (token reduction)
Read protocol — follow in order, stop when you have enough context:

graphify-out/GRAPH_REPORT.md — god nodes, communities, surprising connections.

graphify-out/graph.json — search for a node by label, find source_file + source_location.

Read only the identified file:line. No speculative full-file reads.

Raw file reading only if explicitly requested by the user OR the graph doesn't have the symbol.

Never glob/read an entire directory. Never read node_modules, .venv, graphify-out/cache, dist.

Behavioral guidelines
1. Think before coding
Do not assume. Do not hide confusion. If there are multiple interpretations, present them — do not choose silently. If a simpler alternative exists, say so. If something is unclear, stop and ask.

2. Simplicity first
Minimal code. No extra features, no single-use abstractions, no unrequested flexibility, no error handling for impossible scenarios. If 200 lines become 50, rewrite.

3. Surgical changes
Touch only what is necessary. Do not "improve" adjacent code. Do not refactor what is not broken. Match the existing style. Clean up only orphans created by your own changes — dead code that pre-exists: mention, do not delete.

4. Goal-oriented execution
Turn the task into a verifiable criterion. For multi-step, state a short plan with a check per step. Strong criteria enable independent loops; weak criteria ("make it work") generate rework.

Quick setup — .env (backend)
Critical variables (see .env.example and README for full list):

DB_DRIVER / DB_SERVER / DB_USER / DB_PASSWORD   # SQL Server
API_KEY / API_TOKEN                              # Auth
REQUIRE_API_AUTH=false                           # true in prod
DASHBOARD_CACHE_TTL=60                           # 0 disables
ENABLE_INDEX_ADMIN=false                         # true only for DBA window
ENABLE_AGENT_TELEMETRY=false
Frontend .env: VITE_API_BASE_URL=/api, VITE_API_PROXY_TARGET=http://127.0.0.1:8000.

.env never goes to git with sensitive data.

graphify
This project has a graphify knowledge graph at graphify-out/.

Rules:

Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure

If graphify-out/wiki/index.md exists, navigate it instead of reading raw files

For cross-module "how does X relate to Y" questions, prefer graphify query "<question>", graphify path "<A>" "<B>", or graphify explain "<concept>" over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files

After modifying code files in this session, run graphify update . to keep the graph current (AST-only, no API cost)