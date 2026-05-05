# Frontend — React + TypeScript (agecob-lens)

[← index](index.md)

## Stack

- React 18 + TypeScript 5
- Vite 5 + SWC
- TanStack Query v5 (data fetching)
- React Router v6
- Recharts (gráficos)
- shadcn/ui + Radix UI (componentes)
- Tailwind CSS
- PostHog (analytics opcional)

---

## Entry Points

```
agecob-lens/src/main.tsx   → monta React root, chama initAnalytics()
agecob-lens/src/App.tsx    → Router, Providers, lazy routes
```

**Providers em App.tsx:**
- `QueryClientProvider` (TanStack Query)
- `TooltipProvider`
- `BrowserRouter`
- `Sonner` + `Toaster`

---

## Páginas

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `/` | `pages/Index.tsx` | Dashboard executivo — KPIs, gráficos, insights |
| `/comparacao-agentes` | `pages/ComparacaoAgentes.tsx` | Ranking comparativo entre agentes |
| `/detalhamento-agentes` | `pages/DetalhamentoAgentes.tsx` | Drill-down por agente individual |
| `/analise-produtividade` | `pages/AnaliseProdutividade.tsx` | Análise de produtividade |
| `/analise-profunda` | `pages/AnaliseProfunda.tsx` | Análise avançada |
| `/efetividade-boletos` | `pages/EfetividadeBoletos.tsx` | KPIs + gráfico efetividade diária (effectiveness_pct) + tendência mensal + ranking agentes |
| `*` | `pages/NotFound.tsx` | 404 |

Todas as páginas usam **lazy loading** via `React.lazy()` + prefetch inteligente em `App.tsx`.

---

## Componentes

### Layout
```
components/AppSidebar.tsx          ← Nav lateral com links
components/NavLink.tsx             ← Link com estado ativo
components/FilterBar.tsx           ← Filtros globais (banco, assessoria)
components/DashboardModule.tsx     ← Container de módulo
components/PlaceholderNotice.tsx   ← Aviso de seção não implementada
```

### Dashboard Executivo (`components/executive/`)
```
ExecutiveHeader.tsx         ← Cabeçalho com título + filtros
ExecutiveKpiStrip.tsx       ← Faixa de KPIs (CPC, Conversão, Ticket...)
ExecutiveInsightCard.tsx    ← Card de insight gerado pelo insightEngine
ExecutiveRankingTable.tsx   ← Tabela de ranking de agentes
BuValueChart.tsx            ← Gráfico valor por BU
BuEfficiencyChart.tsx       ← Gráfico eficiência por BU
GroupedVolumeChart.tsx      ← Volume agrupado
HorizontalRankingChart.tsx  ← Ranking horizontal (Recharts)
EffortResultScatter.tsx     ← Scatter plot esforço × resultado
SectionHeader.tsx           ← Cabeçalho de seção
ApiDebugBanner.tsx          ← Banner de debug (dev only)
```

### Gráficos (`components/charts/`)
```
AnaliseChartsPanel.tsx       ← Painel de análise
DashboardV2ChartsPanel.tsx   ← Painel v2
DetalhamentoChartsPanel.tsx  ← Painel de detalhamento
```

### Performance
```
components/performance/LazyVisibleSection.tsx  ← Render on viewport
```

### UI (shadcn/ui — 30+ componentes Radix)
Accordion, Alert, Badge, Button, Card, Dialog, DropdownMenu, Form,
Input, Select, Sheet, Sidebar, Skeleton, Table, Tabs, Toast, Tooltip…

---

## Hooks

| Hook | Arquivo | Retorna |
|------|---------|---------|
| `useProdutividadeData(db, filters?)` | `hooks/useProdutividadeData.ts` | `{ rows, loading, error, warnings, refresh }` |
| `useProdutivityData` | `hooks/useProdutivityData.ts` | variante alternativa |
| `useInViewport(ref)` | `hooks/useInViewport.ts` | `boolean` |
| `useRefreshGuard()` | `hooks/useRefreshGuard.ts` | protege refresh rápido |
| `useMobile()` | `hooks/use-mobile.tsx` | `boolean` |
| `useToast()` | `hooks/use-toast.ts` | toast API |

---

## Serviços

### `services/api.ts`

Função central: `request<T>(path, options)` com:
- Deduplicação de requisições GET inflight
- Fallback de múltiplas base URLs
- Rate limiting inteligente
- Retry automático
- Tracking de métricas via `trackApiMetric()`

**Funções exportadas por domínio:**

```typescript
// Acordos
fetchAcordosTodos()
fetchAcordosPorBanco(db)
fetchAcordos(db)
fetchAcordosHojeAgente(db, agente?, assessoria?)

// Produtividade
fetchProdutividade(db, filters?)
fetchStatusCarga(db, assessoria?)

// Health
fetchHealth(db)

// Gráficos
fetchPrimeiraParcelaDia(db, assessoria?)
fetchExcecoesPorPortfolio(db)
fetchExcecoesPorAgente(db)
fetchAcordosPorPortfolio(db)
fetchPrimeiraParcelaPorAgente(db, assessoria?)

// Admin
fetchAdminIndexesStatus(db)
applyAdminIndexes(db, options?)

// Efetividade de Boletos (10 endpoints)
fetchEfDiariaPrimeira(db?)
fetchEfDiariaColchao(db?)
fetchEfMensalPrimeira(db?)
fetchEfMensalColchao(db?)
fetchEfAgentePrimeira(db?)
fetchEfAgenteColchao(db?)
fetchEfDiariaColchaoVencimento(db?)
fetchEfMensalColchaoVencimento(db?)
fetchEfAgenteColchaoVencimento(db?)
fetchEfResumo(dateFrom, dateTo, db?, parcelaTipo?)  // KPIs + daily chart (live query)
```

### `services/analytics.ts`

```typescript
initAnalytics()           // PostHog se VITE_ENABLE_ANALYTICS=true
trackEvent(name, props)
trackPageView(pathname)
trackApiMetric(params)
```

---

## Lib / Utilitários

### `lib/metrics.ts`

Cálculos de KPI a partir de `ProdutividadeRow[]`:

```typescript
aggregateTotals(rows) → MetricTotals
calcCpc(t)              // qtd_contatos / qtd_acionamentos * 100
calcConversao(t)        // qtd_acordos / qtd_acionamentos * 100
calcTicketMedio(t)      // valor_acordos / qtd_acordos
calcExcecoesPctValor(t)
calcExcecoesPctQtd(t)
calcConcentracao(rows, topN)
calcProdutividadeMediaAgente(rows)
calcHealthScore(t)      // 0-100 weighted (CPC 25%, Conversão 30%, Ticket 20%, Exceções 25%)

// Formatadores
fmtBRL(value)
fmtNum(value, decimals)
fmtPct(value)
shortAgentName(name)
buFromSource(source)    // "COBwebRCBAUTOS" → "AUTOS"
```

### `lib/insightEngine.ts`

```typescript
generateDailyReadout(rows: ProdutividadeRow[]) → InsightEngineOutput
```

Avalia CPC, conversão, exceções, concentração. Gera até 2 insights + 1 ação recomendada com severidade (`critical | warning | positive`).

### `lib/loadQueue.ts` / `lib/routeHeatManager.ts`

Gerenciam prioridade de carregamento de módulos baseado em navegação anterior (heatmap de rotas).

---

## Config

### `config/api.ts`
```typescript
const MODULES: ModuleConfig[] = [
  { id: "acordos-hoje", title: "Acordos fechados hoje" }
]
```

### `config/loadPriorities.ts`
Define prioridades de prefetch por rota.
