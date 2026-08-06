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

## Generated Agreements (STATUS_GERADOS) — base de valor

```sql
ID_REC_STATUS IN (1, 2, 3, 10, 12)
```

Aprovados (1,3,12) + QUEBRA (2) + QUEBRA AUTOMÁTICA (10). **Base dos KPIs de valor gerado**: `valor_acordos`, `valor_primeira_parcela`, `qtd_acordos`, ticket, boletos de conversão/efetividade. Acordo gerado hoje conta no valor gerado mesmo que depois quebre — quebrar é desfecho posterior. Conversão = qtd_acordos / CPC (Σ qtd_contatos), nunca / emitidos. Pré-filtro das CTEs (`STATUS_UNIVERSO_ACORDOS`) = gerados + exceção = `(1, 2, 3, 5, 10, 12)`.

## Exception Status

```sql
ID_REC_STATUS = 5
```

Note: REC_MASTER enum names status `5` as PENDENTE. Business calls it "Exceção" (Exception). Same value — don't confuse with separate "exception" status.

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

`CTO_COMPLEMENTO.CONTATO` (bit) é **largo demais** para RPC: marca disparo de WhatsApp, envio de boleto, ligação interrompida como "contato". Catálogo auditado no banco (2026-06). Por isso funil tem **duas camadas distintas**:

Vocabulário da UI (importante — não inverter):

| Rótulo UI | Pergunta | Definição SQL | Coluna |
|---|---|---|---|
| **Contato** | "Alguém atende?" (Alô) | `CTO_COMPLEMENTO.ALO = 1` | `qtd_alo` |
| **CPC** | "Falei com a pessoa certa?" (RPC) | `CTO_COMPLEMENTO.COD_COMPLEMENTO IN CPC_COMPLEMENTO_CODS` | `qtd_contatos` |

`CPC_COMPLEMENTO_CODS` (curado, `config/settings.py`) = `("449", "452", "453",
"454", "455", "459")` — apenas desfechos de voz com o titular ("572" removido
2026-07-27). Chave por
`COD_COMPLEMENTO` (varchar, código de negócio), não por `ID_COMPLEMENTO`
(surrogate key): o catálogo `CTO_COMPLEMENTO` foi resseedado em 2026-07-10
(ver `BKP_CTO_COMPLEMENTO_20260710`), renumerando os IDs e zerando
`qtd_contatos` em produção com a lista antiga baseada em ID. `COD_COMPLEMENTO`
é estável entre reloads do catálogo; `ID_COMPLEMENTO` não é. JOIN:
`CTO_MASTER.ID_COMPLEMENTO = CTO_COMPLEMENTO.ID_COMPLEMENTO`.

Funil canônico: **Acionamento → Contato (atende) → CPC (pessoa certa) → Acordo →
1ª Parcela**. Monotônico: `acionamentos ≥ qtd_alo ≥ qtd_contatos ≥ acordos`.

`CPC` = Σ `qtd_contatos` (count = RPC, NOT %). "Taxa de contato" = Σ `qtd_alo` /
Σ `qtd_acionamentos`. "Taxa de CPC" = Σ `qtd_contatos` / Σ `qtd_alo`. Conversão =
Σ `qtd_acordos` / Σ `qtd_contatos` (acordos gerados sobre **CPC**, NÃO
boletos pagos).

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

`meta.pagination` added only when pagination applies. Don't invent fields (no `success`, no top-level status). Match `build_response_envelope` in `core/utils/response_envelope.py`.

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
| `cpf_mask` | DEV_MASTER.CPF_CNPJ (full, unmasked — name kept for compat) | Debtor CPF |
| `nome_devedor` | DEV_MASTER.NOME_RAZAO | Debtor name |
| `data_acordo` | REC_MASTER.DT_EMISSAO | Agreement date |
| `data_vencimento` | REC_MASTER.DT_VENCIMENTO | Due date |
| `total_parcelas` | COUNT of REC_MASTER rows for same NR/ID_CARTEIRA | Total installment count |

Implemented via `_build_detalhe_por_portfolio()` in `dominios/graficos/queries.py`.

## Agent-level detail

Endpoint pattern: `GET /dashboard/{type}-detalhe-agente/{db}/{agente}`

Same columns as portfolio-level, filtered by `U.NOME = ?` instead of portfolio. Implemented via `_build_detalhe_por_agente()`.

Frontend lazy-loads via `AgenteDetalheSection` (in DetalhamentoAgentes page, inside Suspense). Queries have `staleTime: 120_000` (2 min cache).

---

## Updated Metric Definitions (2026-05-29)

| Metric | Old Formula | New Formula |
|---|---|---|
| **Conversão %** | `qtd_acordos / qtd_contatos` → `qtd_boletos_pagos / qtd_boletos_emitidos × 100` → `qtd_boletos_pagos / qtd_contatos × 100` (2026-06-23) | `qtd_acordos / qtd_contatos × 100` — acordos gerados sobre **CPC** (2026-07-15; benchmark backend e health score recalibrados junto) |
| **Composição de Entrada** | `valor_1ª_parcela / valor_acordos × 100` (era chamada "Efetividade de Caixa" até 2026-07-10) | mesma fórmula — quanto do acordo é a entrada |
| **Efetividade de Caixa** | — (nome reaproveitado 2026-07-10; fórmula antiga virou "Composição de Entrada" acima) | `valor_p1_recebido / valor_primeira_parcela × 100` — quanto da entrada combinada de fato entrou (recebido / emitido) |
| **% Exc. s/ 1ª Parcela** | — (new) | `valor_exceções / valor_1ª_parcela × 100` |
| **% Exc. s/ Valor Acordos** | `valor_exceções / valor_acordos × 100` (unchanged, renamed) | same |

All defined in `lib/metrics.ts` → `calcConversao()`, `calcComposicaoEntrada()`, `calcEfetividadeCaixa()` (single source of truth, cascades to all charts/pages).

## Name collision resolved (2026-08-03)

Three backend producers emitted a **different** metric under the Conversão name. They were not competing formulas
for one metric — they were a separate metric with the wrong label. Renamed, formulas unchanged:

| Producer | Was | Now |
|---|---|---|
| `dominios/produtividade/queries.py` | `taxa_conversao` = pagos / emitidos | `efetividade_boleto_pct` (same formula) |
| `dominios/acordos/queries.py` | `conversao_pct` = pagos / contatos | `pagos_por_cpc_pct` (same formula) |
| `dominios/agente/agentes.py` | `conversao_pct` = pagos / contatos | `pagos_por_cpc_pct` (same formula) |

The freed name now carries the official definition everywhere it appears: `conversao_pct` =
`qtd_acordos / qtd_contatos × 100`, matching the benchmark query and the frontend's `calcConversao()`.

Practical effect: the chat agent used to answer ~4% where the Home card showed ~11% for the same agent and
period — and ranked agents by a metric that ordered differently from the one the benchmark scored them against.
Both metrics remain available to the agent; `order_by` accepts either name.

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
