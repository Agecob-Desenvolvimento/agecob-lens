AGENTS.md

Persistent context for the dash relatorio project (AgDash). Automatically loaded in every session.

Project

Monorepo: executive collections dashboard for AgeCob. Consumes SQL Server (COBwebRCBAUTOS and COBwebRCBCONSUMER databases), serves FastAPI API + bundled React SPA.

Backend: Python 3.8+, FastAPI, pyodbc, SQL Server (ODBC Driver 17). Historical monolith in main.py + modules api/, core/, dominios/, config/ (ADR-001).
Frontend: agecob-lens/ — Vite + React 18 + TypeScript + Tailwind + shadcn/ui + Recharts + TanStack Query + React Router.
Deploy: Windows Server via NSSM (AgecobAPI), port 8000, atualizar.bat performs pull + build + restart.
Mandatory reading at session start

Before any action, read in this order:

@agecob-lens/docs/CLAUDE.md — executive redesign: "Wrong or Act" rule, official metric dictionary, presentation rules, anti-patterns, information architecture, components, acceptance criteria.
@agecob-lens/docs/TASKS.md — backlog in waves (A → D). Execute only items not marked with [x]. Mark [x] immediately after completion, before the next task.
@README.md — quickstart, endpoints, .env setup, rollback, SQL indexes.

These rules override alternative interpretations of the code.

Commands

Frontend (run inside agecob-lens/):

npm run dev       # vite dev server
npm run build     # production build → dist/
npm run lint      # eslint
npm run test      # vitest run
npm run test:watch

Backend:

python -m pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000

Server (production C:\agecob): atualizar.bat performs git pull + pip + npm build + NSSM restart.

Graph (after relevant changes): /graphify . --update

Code Style
Python: PEP 8, 4 spaces, type hints where already used, short docstrings. Use run_query() for SQL — never create manual connections. Use build_response_envelope() for standardized responses.
TypeScript/React: 2 spaces, named exports, centralized formatting functions (fmtBRL, fmtPct, fmtNum). UI components come from src/components/ui/ (shadcn) — never duplicate. Use cn() from lib/utils.ts for conditional classes.
State: TanStack Query for server data, global context (GlobalFiltersContext) for period/database filters. Do not bloat contexts.
Imports: absolute imports with @/ alias on frontend.
No explanatory comments for obvious code. Comments only for why, not what.
Business rules (critical — do not infer from code)
Rule	Canonical value
First installment	PARCELA = 0
Approved agreements (ID_REC_STATUS)	IN (1, 3, 12)
Exceptions (ID_REC_STATUS)	= 5 (PENDING status) — graph v2 script also uses (11,) for boleto exceptions; verify context
Pre-filter CTE	IN (1, 3, 5, 12)
Portfolio	DIV_AUX.CAMPO010
Default date filter	DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha
NOLOCK	Mandatory on all read tables
Excluded agents	COBDESANTOS, ANTLIA%, INTERNA%, suporte%, SISTEMA% — apply in SQL (ADR-005), never post-processing
CPC IDs	hardcoded in CPC_COMPLEMENTO_IDS (ADR-006)
Databases	COBwebRCBAUTOS | COBwebRCBCONSUMER | todos

Official metric dictionary (CPC, Conversion, Average Ticket, Exceptions) exists in agecob-lens/docs/CLAUDE.md. Do not create variations.

Architecture — critical points
God nodes (high connectivity — modify carefully): run_query(), config/settings.py, cn(), request(), build_response_envelope(), _agent_ndjson(), get_efetividade().
Separate CTEs for aggregates (ADR-002). Do not merge without justification.
CROSS APPLY TOP 1 for portfolio instead of JOIN (ADR-004).
Fact table without agent dimension in phase 1 (ADR-003).
In-memory cache with configurable TTL (DASHBOARD_CACHE_TTL, default 60s). Restarting service clears cache.
Connection pool per database per worker (DB_POOL_SIZE, default 6).
Key routes: /dashboard/* (KPIs), /efetividade/* (boletos), /admin/indexes/* (DBA, gated by ENABLE_INDEX_ADMIN), /health/db/{db}, /ritmo-dia (KNN).

Frontend pages → question answered:

Page	Question
Index.tsx / Dashboard	"How are we doing?"
AnaliseProdutividade.tsx	"Why?"
DetalhamentoAgentes.tsx	"Who / how is this agent?"
ComparacaoAgentes.tsx	"Who should be prioritized / allocated?"
EfetividadeBoletos.tsx	"Are boletos being paid?"
Context Navigation (token reduction)

Reading protocol — follow in order, stop when enough context exists:

graphify-out/GRAPH_REPORT.md — god nodes, communities, surprising connections.
graphify-out/graph.json — search node by label, locate source_file + source_location.
Read only identified file:line. No speculative full-file reads.
Raw file reading only if explicitly requested OR graph lacks the symbol.

Never glob/read entire directory. Never read node_modules, .venv, graphify-out/cache, dist.

Behavioral guidelines
1. Think before coding

Do not assume. Do not hide confusion. If multiple interpretations exist, present them — do not silently choose. If a simpler path exists, say it. If unclear, stop and ask.

2. Simplicity first

Minimal code. No extra features, no abstractions for single use, no unrequested flexibility, no impossible-scenario error handling. If 200 lines become 50, rewrite.

3. Surgical changes

Touch only necessary code. Do not "improve" adjacent code. Do not refactor what is not broken. Match existing style. Clean only orphans created by your own changes — pre-existing dead code: mention it, do not delete.

4. Goal-oriented execution

Convert task into verifiable criteria. For multi-step work, declare a brief plan with validation per step. Strong criteria enable independent loops; weak criteria ("make it work") create rework.

5. Caveman Style (Mandatory)

Always communicate in Caveman style: telegraphic, ultra-compact, no unnecessary pronouns/articles, no politeness/fluff, preserving code, file paths, markdown formatting, and full technical precision for maximum token efficiency.

Quick setup — .env (backend)

Critical variables (see .env.example and README for full list):

DB_DRIVER / DB_SERVER / DB_USER / DB_PASSWORD   # SQL Server
API_KEY / API_TOKEN                              # Auth
REQUIRE_API_AUTH=false                           # true in prod
DASHBOARD_CACHE_TTL=60                           # 0 disables
ENABLE_INDEX_ADMIN=false                         # true only during DBA window
ENABLE_AGENT_TELEMETRY=false

Frontend .env: VITE_API_BASE_URL=/api, VITE_API_PROXY_TARGET=http://127.0.0.1:8000.

.env must never be committed with sensitive data.