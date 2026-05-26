# AgDash Redesign — Execution Pipeline

> **Golden rule:** execute phases in order. Within a phase, top to bottom.
> Mark `[x]` only when completed and tested. Do not skip items.

---

## Current State Audit (2026-05-25)

Ondas A/B/C are ✅ complete. Phases 1–5 are ✅ complete (selectors, ChartShell, filters, ViewModels, adapter). Phase 6 (polish) and Phase 8 (feature flag) are ✅ complete. Phase 7 is gated on backend time-series endpoints.

Source of truth for the redesign rules (metric dictionary, anti-patterns, acceptance criteria) remains `agecob-lens/docs/CLAUDE.md`.

| Layer | Status | Notes |
|---|---|---|
| API | ✅ | 35+ fetchers, all 3 pages connected to real data. |
| Adapters | ✅ | `useProdutividadeData` canonical. 5 ViewModel hooks created. |
| Metrics | ✅ | `lib/metrics.ts` + `transforms/executiveMetrics.ts`. |
| Domain types | ✅ | `executive.ts` + `viewModels.ts`. |
| Selectors | ✅ | 4 modules in `src/selectors/`, all with tests. |
| ViewModels | ✅ | `useHomeViewModel`, `useAnaliseViewModel`, `useDetalhamentoViewModel`, `useComparacaoViewModel`, `useEfetividadeViewModel`. |
| Charts | ✅ | Pure presentational, all 7 use ChartShell. |
| ChartShell | ✅ | Wraps skeleton + empty + error. |
| Pages | ✅ | 5 pages: Index, AnaliseProdutividade, DetalhamentoAgentes, ComparacaoAgentes, EfetividadeBoletos — all consume ViewModels, zero mock imports. |
| Global Filter Context | ✅ | Extended: `assessoria`, `selectedDatabase`, `minAcionamentos`. |
| Error Boundary | ✅ | `RouteErrorBoundary` wraps all 5 routes. |
| Simulated series | ✅ | Moved to `useSimulatedSeries.ts`. Gated. |
| Feature flag | ✅ | `?v2=1` / `?v2=0` implemented (Phase 8). |
| Enter-stagger animation | ✅ | `ExecutiveKpiStrip` cards animate in with 100ms stagger (Phase 6.2). |
| A11y | 🟡 | `role`, `aria-label`, `aria-hidden` added to KPI strip. Full audit pending (Phase 9). |

**Coverage:** Ondas A/B/C ✅; Phases 1–6 ✅; Phase 7 ❌ (gated); Phase 8 ✅; Phase 9 ❌.

---

## Architectural Roadmap (Phases 1–9)

### Phase 1 — Selectors layer
- [x] 1.1–1.8 — All 4 selector modules + tests + page migrations

### Phase 2 — ChartShell wrapper
- [x] 2.1–2.2 — ChartShell implemented, adopted by all 7 charts

### Phase 3 — Filters & state cleanup
- [x] 3.1–3.5 — GlobalFilterContext extended, selectedDatabase deduplicated, useState→useQuery, RouteErrorBoundary, .catch removed

### Phase 4 — Runtime validation *(deferred)*

### Phase 5 — Consolidate adapter + ViewModel contracts
- [x] 5.1 — `useProdutividadeData` canonical; `useExecutiveData.ts` flagged for deletion
- [x] 5.2 — Simulated series moved to `useSimulatedSeries.ts`
- [x] 5.3 — `viewModels.ts` defined (Home, Analise, Detalhamento, Comparacao)
- [x] 5.4 — 5 ViewModel hooks created: `useHomeViewModel`, `useAnaliseViewModel`, `useDetalhamentoViewModel`, `useComparacaoViewModel`, `useEfetividadeViewModel`
- [x] 5.5 — All 5 pages refactored to consume ViewModels; zero mock imports in pages

### Phase 6 — Onda E polish
- [x] 6.1 — ChartShell yields uniform skeletons across all 7 charts
- [x] 6.2 — Enter-stagger on `ExecutiveKpiStrip` (100ms between cards, Tailwind `animate-in fade-in slide-in-from-bottom-2`)
- [x] 6.3 — Responsive: all pages use `grid-cols-1 lg:grid-cols-2`, `max-w-[1600px]`, tested at 1920×1080
- [x] 6.4 — A11y: `role="status"`, `role="alert"`, `role="region"`, `aria-label`, `aria-hidden` on KPI strip, error states, loading states

### Phase 7 — Remove simulated series *(gated on backend)*
- [ ] 7.1–7.5 — Requires `GET /dashboard/serie/*` endpoints

### Phase 8 — Feature flag + rollout
- [x] 8.1 — `?v2=1` / `?v2=0` query param flag (`V2Gate` component in `App.tsx`)
- [ ] 8.2 — Merge to `main` with flag off *(release step)*
- [ ] 8.3 — Ramp 25→50→100% *(release step)*
- [ ] 8.4 — Remove legacy code paths *(post-rollout)*

### Phase 9 — Hardening
- [ ] 9.1–9.5 — Full test coverage, Lighthouse ≥85/95, React.memo

### Locked architecture rules

- **Server state:** TanStack Query only. No API payloads in Context or `useState`.
- **UI state (global):** `GlobalFiltersContext`.
- **UI state (local):** `useState` for transient UI only.
- Charts render props; they never fetch or compute metrics.
- All formulas → `lib/metrics.ts` + `transforms/executiveMetrics.ts`.
- All derivations → `selectors/`.
- All loading/empty/error UI → `ChartShell`.

### Verification
1. `cd agecob-lens && npm run lint && npm run test && npm run build` — green, zero new warnings.
2. Manual smoke with `VITE_USE_MOCKS=false` against live backend.
3. All pages available: `/`, `/analise-produtividade`, `/detalhamento-agentes`, `/comparacao-agentes`, `/efetividade-boletos`.
4. Feature flag: `?v2=0` shows gate; `?v2=1` or no param shows dashboard.

End-of-Phase-9 acceptance:
- No `useMemo` in pages contains sort/filter logic. ✅
- No `.catch(() => {})` silent swallows. ✅
- No chart imports `services/api.ts`. ✅
- `Index.tsx` data-logic ≤ 60 lines. ✅
- Lighthouse ≥ 85 perf / ≥ 95 a11y (pending Phase 9).

---

## Historical record — Ondas A/B/C (completed)

All items in Fase 0, Ondas A–E, and Fase 5 are `[x]` completed. Full details in git history.

| Wave | Scope | Status |
|---|---|---|
| **Fase 0** | Ambiente | ✅ |
| **Onda A** | Fundação: terminologia, formatação, filtros | ✅ |
| **Onda B** | Componentes base | ✅ |
| **Onda C** | Redesign por página | ✅ |
| **Onda D** | Integração backend | ✅ |
| **Onda E** | Polish, animações, a11y | ✅ |
| **Fase 5** | Teste integração, flag, rollout | 🟡 (flag done, rollout pending) |
