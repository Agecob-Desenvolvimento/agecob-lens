# Fluxos de Dados

[← index](index.md)

## 1. Dashboard Executivo (rota `/`)

```
App.tsx
  └─ Index.tsx
       ├─ useProdutividadeData(db, filters)
       │    ├─ fetchProdutividade(db, filters)  [TanStack Query]
       │    │    └─ api.ts: request<ProdutividadeRow[]>("/dashboard/produtividade-hoje/{db}")
       │    │         └─ FastAPI: get_dashboard_produtividade_hoje()
       │    │              └─ run_query(_build_produtividade_query, db)
       │    │                   └─ pyodbc → SQL Server
       │    └─ fetchHealth(db)
       │
       ├─ lib/metrics.ts
       │    └─ aggregateTotals(rows) → MetricTotals
       │         ├─ calcCpc, calcConversao, calcTicketMedio...
       │         └─ calcHealthScore → 0-100
       │
       ├─ lib/insightEngine.ts
       │    └─ generateDailyReadout(rows) → InsightEngineOutput
       │         └─ InsightSlot × 2 + ActionSlot
       │
       └─ Render:
            ├─ ExecutiveKpiStrip (KPIs)
            ├─ ExecutiveInsightCard (insights)
            ├─ BuValueChart / BuEfficiencyChart (Recharts)
            └─ ExecutiveRankingTable
```

---

## 2. Comparação de Agentes (rota `/comparacao-agentes`)

```
ComparacaoAgentes.tsx
  └─ fetchProdutividade(db)  [ou comparacao-agentes endpoint]
       └─ AgentComparisonDashboard.tsx
            └─ DashboardV2ChartsPanel.tsx (Recharts)
```

---

## 3. Efetividade de Boletos (rota `/efetividade-boletos`)

```
EfetividadeBoletos.tsx
  ├─ fetchEfDiariaPrimeira()
  ├─ fetchEfDiariaColchao()
  ├─ fetchEfMensalPrimeira()
  ├─ fetchEfMensalColchao()
  ├─ fetchEfAgentePrimeira()
  ├─ fetchEfAgenteColchao()
  ├─ fetchEfDiariaColchaoVencimento()
  ├─ fetchEfMensalColchaoVencimento()
  └─ fetchEfAgenteColchaoVencimento()
       └─ agecob-lens/main.py (backend secundário)
```

---

## 4. Fluxo de Request no api.ts

```
fetchXxx(db, params)
  └─ request<T>(path, options)
       ├─ Verifica inflight (deduplicação GET)
       ├─ Tenta VITE_API_BASE_URL  ──→ /api/{path}
       │    Fallback: window.location.origin
       ├─ Adiciona headers: X-API-Key, Authorization
       ├─ trackApiMetric() (timing)
       ├─ Em erro 429: aguarda Retry-After
       └─ Em erro 5xx: retry automático
```

---

## 5. Auth no Backend

```
Request HTTP
  └─ api_prefix_middleware  (normaliza /api)
       └─ security_middleware
            ├─ _require_auth()
            │    ├─ REQUIRE_API_AUTH=false → passa
            │    ├─ Verifica X-API-Key header
            │    └─ Verifica Authorization: Bearer
            ├─ _rate_limit_dashboard()
            │    └─ bucket por IP:API_KEY (75 req/60s)
            │         429 + Retry-After se exceder
            └─ Route Handler
                 └─ validate_database()
                      └─ run_query()
                           └─ build_response_envelope()
```

---

## 6. Filtragem por Assessoria

Vários endpoints aceitam `?assessoria=X`:

```
Frontend: FilterBar.tsx → assessoria state
  └─ fetchProdutividade(db, { assessoria })
       └─ /dashboard/produtividade-hoje/{db}?assessoria=X
            └─ main.py: SQL WHERE CAMPO010 = assessoria
```

---

## 7. Modo "todos" (ambos os bancos)

```
db = "todos"
  └─ _wrap_todos_or_single("todos", base_fn, agg_select, order_by)
       ├─ base_fn("COBwebRCBAUTOS") → SQL A
       ├─ base_fn("COBwebRCBCONSUMER") → SQL B
       └─ "SELECT ... FROM (A UNION ALL B) AS combined"
            └─ run_query → resultado agregado
```

---

## 8. Lazy Loading de Rotas

```
App.tsx → AppRoutes
  ├─ routeHeatManager — registra cliques por rota
  ├─ loadQueue — prioriza prefetch baseado em heat
  └─ React.lazy() → import dinâmico por rota
       └─ Suspense com Skeleton fallback
```
