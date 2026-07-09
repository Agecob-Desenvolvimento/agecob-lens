# AgDash — Changelog (desde 2026-04-27)

> **Janela:** 2026-04-27 → 2026-06-03 · **Branch:** `T` · **Commits no período:** 58 (`6483b51` … `eff743f`)
> **Nota de escopo:** o commit inicial do repositório é `6483b51` (2026-04-28). Não existe história anterior a 2026-04-27, portanto esta janela cobre **todo o projeto desde o início**.
> **Fonte:** `git log` + inventário de rotas em `api/routers/`. Datas e hashes são verificáveis; o mapeamento endpoint→marco é inferido das mensagens de commit.

---

## Resumo executivo

O projeto nasceu como dashboard de cobrança (FastAPI + React) e, ao longo da janela, passou por quatro movimentos grandes:

1. **Modularização do backend** (2026-05-05) — `main.py` deixou de hospedar rotas; tudo migrou para `api/routers/`.
2. **Redesign executivo do frontend** (2026-05-22) — tokens semânticos, camada de *selectors*, `GlobalFiltersContext`.
3. **Drill-down rico de risco** (2026-05-26 → 05-29) — detalhe por portfólio e por agente, benchmarks internos.
4. **Correção semântica de métricas** (2026-06-01 → 06-02) — separação do funil Contato (Alô) vs CPC e redefinição de Conversão.

---

## main.py

`main.py` mudou de papel no período. Marcos:

| Data | Commit | Mudança |
|---|---|---|
| 2026-04-28 | `6483b51` | Commit inicial — backend FastAPI monolítico com rotas inline. |
| 2026-04-28 | `1585a5b` | Filtro de 1ª parcela por assessoria. |
| 2026-04-29 | `2e68726` | Branding AgDash, filtro de banco na Efetividade, logo. |
| 2026-04-29 | `a9c162d` | Guardrails do review do PR #8 (comments, sentinels, required params). |
| **2026-05-05** | **`6a27502`** | **Backend modular** — rotas extraídas para `api/routers/`. A partir daqui `main.py` é só bootstrap (app, middleware, `include_router`, lifespan). |
| 2026-05-12 | `53084d1` | Ritmo do Dia (KNN Fase 2) — endpoint + card. |
| 2026-05-29 | `d87880e` | Benchmarks internos + drill-down rico de risco + correções de detalhe. |

**Estado atual:** `main.py` não contém nenhum decorator de rota (`@app.get/post/...`). Toda a superfície HTTP está em `api/routers/`.

---

## Páginas frontend (`agecob-lens/src/pages/`)

Páginas existentes hoje: `Index.tsx` (Home/Dashboard), `DetalhamentoAgentes.tsx`, `EfetividadeBoletos.tsx`, `NotFound.tsx`.

| Data | Commit | Mudança |
|---|---|---|
| 2026-04-28 | `6483b51` | Dashboard inicial agecob-lens. |
| 2026-04-28 | `e2715cd` / `de650c8` | Efetividade de Boletos — ETL, endpoints e dashboard. |
| 2026-04-29 | `2e68726` | Filtro de banco na Efetividade. |
| 2026-05-05 | `6a27502` | Correção do gráfico de efetividade. |
| 2026-05-06 | `669deb7` / `df92ff8` | Filtro de período (`dateFrom`/`dateTo`) ponta-a-ponta + tabela performance-período em DetalhamentoAgentes. |
| 2026-05-07 | `7fe06a7` | CPC% + exceções na tabela performance-período. |
| 2026-05-12 | `53084d1` | Card Ritmo do Dia. |
| 2026-05-13 | `9908322` | Notificação de navegador + projeção mensal de 1ª parcela. |
| 2026-05-13 | `a8ac969` | **`GlobalFiltersContext`** — estado de filtro compartilhado entre páginas. |
| 2026-05-14 | `7c4e1b4` | Locale do SQL Server + data UTC + remoção de "assessoria" dos filtros. |
| 2026-05-18 | `6de8896` | Propagação de período para gráficos de portfólio/agente. |
| **2026-05-22** | **`a41ef33`** | **Redesign executivo** — tokens semânticos, onda D de infra. |
| 2026-05-22 | `d5cbb4b` `c96c2fe` `6d57281` `f15fda5` | **Camada de selectors** — derivações extraídas de Home, Análise, Detalhamento e Comparação (Fases 1.1–1.8). |
| 2026-05-26 | `7db0fc5` | Drill-down de detalhe por portfólio + empty-state de boletos quebrados. |
| 2026-05-29 | `d87880e` | Drill-down rico de risco + correções de detalhe. |
| **2026-06-01** | **`2634bd9`** | **Separação do funil Contato (Alô) vs CPC (pessoa certa)** + novos KPIs. |
| **2026-06-02** | **`617982e`** | **Conversão redefinida** como boletos pagos/vencidos + filtro de portfólio no Detalhamento. |
| 2026-06-02 | `eff743f` | Filtro de portfólio passa a dirigir os KPIs; desativa auto-tradução do browser. |
| 2026-06-02 | `9a508ad` | Remoção de módulos de dashboard órfãos. |

---

## Endpoints — inventário atual (`api/routers/`)

Toda a superfície HTTP foi construída dentro desta janela. Agrupada por router:

### `dashboard.py` — KPIs e acordos
- `GET /dashboard/acordos-hoje` · `/acordos-hoje/todos` · `/acordos-hoje/{database_name}`
- `GET /dashboard/acordos-hoje-agente/{db}`
- `GET /dashboard/tabela-performance-periodo/{db}`
- `GET /dashboard/portfolios/{database_name}`
- `GET /dashboard/produtividade-hoje/{database_name}`
- `GET /dashboard/status-carga/{db}`
- `GET /dashboard/comparacao-agentes/{db}` (também `/{database_name}`)
- `GET /dashboard/detalhamento-agentes/{database_name}`
- `GET /dashboard/produtividade/{database_name}` · `/produtividade-agentes`
- `GET /dashboard/primeira-parcela-dia/{db}` · `/primeira-parcela-por-portfolio/{db}` · `/primeira-parcela-por-agente/{db}`
- `GET /dashboard/excecoes-por-portfolio/{db}` · `/excecoes-por-agente/{db}` · `/excecoes-sem-portfolio/{db}`
- `GET /dashboard/acordos-por-portfolio/{db}`
- `GET /dashboard/rejeitados-por-portfolio/{db}`
- `GET /dashboard/quebrados-por-portfolio/{db}`
- **Drill-down de detalhe** (introduzidos em `7db0fc5`/`d87880e`):
  - `GET /dashboard/excecoes-detalhe/{db}/{portfolio}` · `/acordos-detalhe/...` · `/rejeitados-detalhe/...` · `/quebrados-detalhe/...`
  - `GET /dashboard/excecoes-detalhe-agente/{db}/{agente}` · `/rejeitados-detalhe-agente/...` · `/quebrados-detalhe-agente/...`
- `GET /dashboard/benchmarks/{db}` (benchmarks internos, `d87880e`)

### `efetividade.py` — boletos (introduzido em `e2715cd`/`de650c8`, 2026-04-28)
- `GET /efetividade/diaria-primeira` · `/mensal-primeira`
- `GET /efetividade/diaria-colchao` · `/mensal-colchao`
- `GET /efetividade/diaria-colchao-vencimento` · `/mensal-colchao-vencimento`
- `GET /efetividade/mensal-agente-primeira` · `/mensal-agente-colchao` · `/mensal-agente-colchao-vencimento`
- `GET /efetividade/resumo`
- `GET /efetividade/curva-quebra`

### `ritmo_dia.py` — KNN (introduzido em `53084d1`, 2026-05-12)
- `GET /ritmo-dia/{db}`

### `regressao.py`
- `POST /agentes`

### Infra
- `health.py`: `GET /db` · `GET /db/{database_name}`
- `admin.py`: `GET /indexes/status/{database_name}` · `POST /indexes/apply/{database_name}` (gated por `ENABLE_INDEX_ADMIN`)
- `static.py`: `GET /` · `GET /{full_path:path}` (serve a SPA buildada)

---

## Mudanças semânticas críticas (atenção)

Estas alteram o significado de números exibidos — não tratar como cosmético:

- **Conversão redefinida** (`617982e`, 2026-06-02): de `qtd_acordos / qtd_contatos` para `qtd_boletos_pagos / qtd_boletos_emitidos × 100` (pago em ≤5d do vencimento sobre boleto **vencido**, `DT_VENCIMENTO < hoje`). Fonte única em `lib/metrics.ts → calcConversao()`.
- **Funil Contato (Alô) ≠ CPC** (`2634bd9`, 2026-06-01): "Contato" = `ALO = 1` (atende); "CPC" = `CTO_MASTER.ID_COMPLEMENTO IN CPC_COMPLEMENTO_IDS` (pessoa certa). `CPC` é contagem, não %.
- **`STATUS_EXCECAO` revertido para `(5,)`** (`5bc213d`, 2026-05-20): o enum nomeia 5 como PENDENTE, mas o negócio chama de "Exceção". Não usar `(11,)`.

---

_Gerado a partir do histórico git em 2026-06-03._
