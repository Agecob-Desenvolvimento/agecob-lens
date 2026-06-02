# Data Layer — AgDash

## Purpose

Centralized SQL Server access layer for AgDash.

Responsibilities:

* execute queries
* manage pooled connections
* enforce business rules
* normalize responses
* provide cache
* avoid duplicated DB access logic

---

# Architecture

```text
FastAPI Route
    ↓
Domain Service
    ↓
run_query()
    ↓
Connection Pool
    ↓
SQL Server
```

Databases:

* `COBwebRCBAUTOS`
* `COBwebRCBCONSUMER`
* `todos` → multi-db aggregation

---

# Core Rules

## Query Execution

ALL database access must use:

```python
run_query()
```

Forbidden:

* manual `pyodbc.connect()`
* ad-hoc connection creation
* raw cursor management outside infra layer

Reason:

* centralized pooling
* standardized behavior
* cache integration
* timeout consistency

---

# SQL Standards

## Mandatory NOLOCK

Every read query MUST use:

```sql
WITH (NOLOCK)
```

Reason:

* analytical workload
* avoid lock contention
* responsiveness prioritized over strict consistency

---

# Business Rules

## Approved Agreements

```sql
ID_REC_STATUS IN (1, 3, 12)
```

## Exception Status

```sql
ID_REC_STATUS = 5
```

Note: the REC_MASTER enum names status `5` as PENDENTE. The business calls it "Exceção" (Exception). Same value — do not confuse with a separate "exception" status.

## Rejected Status

```sql
ID_REC_STATUS = 7
```

REJEITADO — supervisor/bank denied.

## Broken Boletos

```sql
ID_REC_STATUS = 2
```

## Pre-filter CTE

```sql
ID_REC_STATUS IN (1, 3, 5, 12)
```

## Funil de contato — Alô vs Contato (RPC) — ADR-006

O `CTO_COMPLEMENTO.CONTATO` (bit) é **largo demais** para RPC: marca disparo de
WhatsApp, envio de boleto e ligação interrompida como "contato". Catálogo
auditado no banco (2026-06). Por isso o funil tem **duas camadas distintas**:

Vocabulário da UI (importante — não inverter):

| Rótulo UI | Pergunta | Definição SQL | Coluna |
|---|---|---|---|
| **Contato** | "Alguém atende?" (Alô) | `CTO_COMPLEMENTO.ALO = 1` | `qtd_alo` |
| **CPC** | "Falei com a pessoa certa?" (RPC) | `CTO_MASTER.ID_COMPLEMENTO IN CPC_COMPLEMENTO_IDS` | `qtd_contatos` |

`CPC_COMPLEMENTO_IDS` (curado, `config/settings.py`) = `(95, 105, 108, 109, 110,
111, 229, 230, 231, 233)` — apenas desfechos de voz com o titular. JOIN:
`CTO_MASTER.ID_COMPLEMENTO = CTO_COMPLEMENTO.ID_COMPLEMENTO`.

Funil canônico: **Acionamento → Contato (atende) → CPC (pessoa certa) → Acordo →
1ª Parcela**. Monotônico: `acionamentos ≥ qtd_alo ≥ qtd_contatos ≥ acordos`.

`CPC` = Σ `qtd_contatos` (count = RPC, NOT %). "Taxa de contato" = Σ `qtd_alo` /
Σ `qtd_acionamentos`. "Taxa de CPC" = Σ `qtd_contatos` / Σ `qtd_alo`. Conversão =
Σ `qtd_boletos_pagos` / Σ `qtd_boletos_emitidos` (boleto pago no prazo /
boleto **vencido**, `DT_VENCIMENTO < hoje`).

## First Installment

```sql
PARCELA = 0
```

## Portfolio

```sql
DIV_AUX.CAMPO010
```

## Default Date Filter

```sql
DT_EMISSAO >= @Hoje
AND DT_EMISSAO < @Amanha
```

---

# Excluded Agents

Must be filtered INSIDE SQL.

Never post-process.

```sql
COBDESANTOS
ANTLIA%
INTERNA%
suporte%
SISTEMA%
```

---

# Query Design

## Separate CTEs

Aggregations should use isolated CTEs.

Preferred:

```sql
WITH acordos AS (...),
boletos AS (...)
SELECT ...
```

Avoid giant coupled aggregation queries.

Defined by ADR-002.

---

# Portfolio Resolution

Use:

```sql
CROSS APPLY TOP 1
```

Avoid traditional JOIN when resolving portfolio.

Reason:

* avoid row multiplication
* preserve cardinality

Defined by ADR-004.

---

# Response Standard

All endpoints must use:

```python
build_response_envelope()
```

Expected structure (exactly — there is NO `success` field):

```json
{
  "meta": {
    "generated_at": "...",
    "total_rows": 0,
    "sources": [],
    "filters": {},
    "run_id": "...",
    "quality": {}
  },
  "data": [],
  "errors": []
}
```

`meta.pagination` is added only when pagination applies. Do not invent fields (no `success`, no top-level status). Match `build_response_envelope` in `core/utils/response_envelope.py`.

---

# Cache

In-memory TTL cache.

Config:

```env
DASHBOARD_CACHE_TTL=60
```

Characteristics:

* process-local
* restart clears cache
* optimized for dashboard reads

Not transactional.

---

# Connection Pool

Config:

```env
DB_POOL_SIZE=6
```

Characteristics:

* pool per database
* reused connections
* lazy initialization

---

# Frontend Consumption

Frontend stack:

* TanStack Query
* centralized request layer
* GlobalFiltersContext

Responsibilities:

* server-state caching
* deduplication
* refetch orchestration
* synchronized filters

---

# Constraints

## Never

* create direct DB connections
* filter excluded agents outside SQL
* bypass response envelope
* duplicate business rules in frontend
* remove NOLOCK
* merge unrelated aggregation CTEs

---

# Detail Queries (Detalhe)

## Portfolio-level detail

Endpoint pattern: `GET /dashboard/{type}-detalhe/{db}/{portfolio}`

Types: `excecoes` (status=5), `rejeitados` (status=7), `quebrados` (status=2), `acordos` (status IN (1,3,12))

Columns returned per agreement row:

| Column | Source | Description |
|---|---|---|
| `NR_RECEBIMENTO` | REC_MASTER | Agreement number |
| `ID_CARTEIRA` | REC_MASTER | Portfolio ID |
| `valor_primeira_parcela` | REC_MASTER.VALOR | First installment value |
| `valor_total` | SUM of REC_MASTER.VALOR for same NR/ID_CARTEIRA | Total agreement value |
| `agente` | USU_MASTER.NOME | Agent name |
| `matricula` | USU_MASTER.MATRICULA | Agent registration code |
| `cpf_mask` | DEV_MASTER.CPF_CNPJ (masked: first 3 + last 2 digits) | Debtor CPF |
| `nome_devedor` | DEV_MASTER.NOME_RAZAO | Debtor name |
| `data_acordo` | REC_MASTER.DT_EMISSAO | Agreement date |
| `data_vencimento` | REC_MASTER.DT_VENCIMENTO | Due date |
| `total_parcelas` | COUNT of REC_MASTER rows for same NR/ID_CARTEIRA | Total installment count |

All implemented via `_build_detalhe_por_portfolio()` in `dominios/graficos/queries.py`.

## Agent-level detail

Endpoint pattern: `GET /dashboard/{type}-detalhe-agente/{db}/{agente}`

Same columns as portfolio-level, filtered by `U.NOME = ?` instead of portfolio. Implemented via `_build_detalhe_por_agente()`.

Frontend lazy-loads via `AgenteDetalheSection` component (in DetalhamentoAgentes page, inside Suspense). Queries have `staleTime: 120_000` (2 min cache).

---

## Updated Metric Definitions (2026-05-29)

| Metric | Old Formula | New Formula |
|---|---|---|
| **Conversão %** | `qtd_acordos / qtd_contatos` | `qtd_boletos_pagos / qtd_boletos_emitidos × 100` (pago em ≤5d do venc. / boleto vencido `DT_VENCIMENTO < hoje`) |
| **Efetividade de Caixa** | — (new) | `valor_1ª_parcela / valor_acordos × 100` |
| **% Exc. s/ 1ª Parcela** | — (new) | `valor_exceções / valor_1ª_parcela × 100` |
| **% Exc. s/ Valor Acordos** | `valor_exceções / valor_acordos × 100` (unchanged, renamed) | same |

All defined in `lib/metrics.ts` → `calcConversao()` (single source of truth, cascades to all charts/pages).

# Important Nodes

High-impact functions:

* `run_query()`
* `build_response_envelope()`
* `config/settings.py`
* `request()`
* `get_efetividade()`

Modify carefully.

---

# Performance Philosophy

Optimized for:

* read-heavy dashboards
* aggregation queries
* low latency
* operational simplicity

Not optimized for:

* OLTP
* strong consistency
* transactional guarantees

---

# Operational Notes

Deploy:

```cmd
atualizar.bat
```

Performs:

1. git pull
2. dependency update
3. frontend build
4. NSSM restart

Restarting service clears cache.
