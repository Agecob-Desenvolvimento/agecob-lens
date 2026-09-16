First of all, you only can answer/ask/type in english only.

MANDATORY DATA-WORK READ: any task touching data — fetching, ViewModels, selectors, metrics, adapters, data-layer contract (frontend or backend) — REQUIRES reading docs/data-layer.md IN FULL and ../../docs/data-dictionary.md IN FULL before editing code or writing a query. `data-layer.md` = business rules; `data-dictionary.md` = real column names/types + every status/contact-result code value, per portfolio. Applies to main session + every subagent. No full read of both, no data-code edit.

AgDash — Context for Claude Code
Project
Executive redesign of AgDash: make interface executive decision tool. Clear visual hierarchy, consistent KPI semantics, action narrative.
Current Status
Redesign shipped. TASKS.md no longer exists in the repo — do NOT try to read it, and ignore
the old "[x] marking" protocol; it has no file to act on. (Corrected 2026-09-16: the
mandatory-read instruction had been unsatisfiable since TASKS.md was removed.)
The live page/route inventory is the table under "Routes and Responsibilities" below.
Inclusion Rule — "Wrong or Act"
Mandatory criterion for any element occupying main viewport space:
"Does this element answer, without extra interaction, 'What is wrong right now?' or 'What do I do right now?'"
Yes: stays, visual hierarchy proportional to severity.
No: removed or demoted to secondary layer (drawer, secondary tab, collapsible).
Apply before creating/keeping any card, chart, block.
Official Metrics Dictionary
Only valid definitions. No variations or alternative labels.
Table
Metric	Formula
CPC	Σ qtd_contatos (count of contacts — same as "Contatos", another name). Unit: count, NOT %.
Contact rate (Taxa de contato %)	Σ qtd_alo / Σ qtd_acionamentos — the ratio. Numerator is qtd_alo ("someone answered" / Alô), NOT qtd_contatos (that is CPC). MUST be labelled "Taxa de contato", never "CPC".
Conversão (Conversão %)	Σ qtd_acordos / Σ qtd_contatos × 100 — acordos gerados sobre CPC (contatos/RPC do período). Unit: %. Na Home compara vs "média do escritório" (benchmark 3m), não período anterior. Denominador é CPC, NÃO boletos emitidos.
Average ticket	Σ valor_acordos / Σ qtd_acordos
Exceptions (% value)	Σ valor_excecoes / Σ valor_acordos
Forbidden: "Conversion Rate" without specifying formula.
Forbidden: competing formulas for same indicator on same page.
Every KPI displays: short label (card), formula (tooltip), explicit unit (BRL, %, count).
Presentation Rules
Monetary values
Forbidden to truncate monetary values in primary cards.
Mandatory responsive formatting: R$ 1.61 mi not R$ 1.611.168…
KPI Hierarchy
Primary KPI (Agreement Value) occupies 2× visual area of secondary.
Asymmetric grid: 2 wide columns (financial) + 4 narrow (operational).
Typography: text-3xl font-bold for primary, text-xl font-semibold for secondary.
Units always as sub-label text-sm text-muted.
Design Tokens — Executive AgDash
Semantic Palette (Tailwind 3.x)
Critical     → bg rose-50    · border rose-200    · text rose-700    · accent rose-500
Positive     → bg emerald-50 · border emerald-200 · text emerald-700 · accent emerald-500
Warning      → bg amber-50   · border amber-200   · text amber-700   · accent amber-500
Neutral      → bg white      · border slate-200   · text slate-700   · muted slate-500
CTA / Action → bg sky-50     · border sky-200     · text sky-700     · accent sky-600
Typography
Base font-family: font-sans (Inter), numbers with tabular-nums
Primary KPI      → text-4xl font-bold tracking-tight tabular-nums
Secondary KPI    → text-2xl font-semibold tabular-nums
Block title      → text-lg font-semibold text-slate-900
Eyebrow / label  → text-xs uppercase tracking-[0.12em] font-semibold text-slate-500
Body             → text-sm text-slate-600 leading-relaxed
Caption          → text-xs text-slate-500
Unit (sub)       → text-sm font-medium text-slate-400
Spacing
Card padding      → p-5           (20px)
Card gap          → gap-3         (12px)
Section spacing   → space-y-6     (24px)
Page gutters      → px-6 py-8
Radius (cards)    → rounded-lg    (8px)
Radius (chips)    → rounded-full
Default border    → border border-slate-200
Row hover         → hover:bg-slate-50
Shadow (only on clickable element hover) → hover:shadow-sm
Usage Rules
Anti-truncation for monetary: primary values NEVER truncate. Format via formatBRLCompact() → "R$ 1.61 mi".
Fixed semantics: rose=critical, emerald=positive, amber=warning, slate=neutral, sky=action.
Decorative shadows forbidden. Hierarchy via typography + size, not shadow.
Neutral state: components that should be OMITTED in neutral NEVER render visual placeholder.
In actual agecob-lens code, tokens enter via HSL CSS vars in src/index.css + tailwind.config.ts (classes bg-success-soft, text-danger-fg, etc). See SPECS.MD §0.6.1–§0.6.3 for apply-and-replace table.
Dark Theme
Class-based (.dark on <html>), driven by next-themes ThemeProvider in App.tsx (storageKey agdash-theme, defaultTheme system). Inline script in index.html applies the class before first paint. Toggle lives in ExecutiveHeader via ThemeToggle.
Surface hue is navy 224°, inherited from Modo TV (tvShared.ts bg0 #060912 / card #0e1730), so TV panel and desk dashboard read as one product. Elevation by lightness: background (5%) < card (9%) < popover (12%).
Semantic triads keep their meaning and invert their luminance: *-soft becomes a dark tint (11–12% L), *-border a mid stroke (25–28% L), *-fg a bright readable tone (62–74% L).
Chart neutrals are tokens, never hex: --chart-grid, --chart-axis, --chart-label, --chart-label-strong, --chart-ink through --chart-ink-4, --chart-surface. Consumed in SVG/Recharts as hsl(var(--chart-…)) so they follow the theme with no JS. Series hues (green/amber/rose) stay literal — they read on both surfaces.
Rule for hardcoded Tailwind colors: add a dark: variant, never repaint the light value. Light mode must stay byte-identical.
Self-contained dark surfaces (chart tooltips, Modo TV) are exempt — they already work on both themes.
Baselines
Every primary KPI displays comparison line below absolute value.
Fallback priority: period target → MoM/YoD → N-day moving average
Format: ↑ 12% vs target or ↓ 4% vs yesterday
Daily Readout (hero banner)
Critical state: background rose-50, border rose-200, embedded primary CTA.
Positive state: background emerald-50, smaller height, secondary CTA.
Neutral state: omit entire block. Active blank space.
Never display "No immediate action recommended" as permanent visual element.
Anti-Patterns — Never Reintroduce
Table
Anti-pattern	Action
"Daily Signals" block outside Home	Keep only on Home. Remove from all other routes.
Rankings with same ordering on different tabs	Consolidate into single authoritative ranking per dimension.
Contact/no-contact decomposition in both chart and table simultaneously	Keep only in chart. Table collapsed by default.
Permanent neutral-state card	Convert to omitted state.
Filters with no real effect on data	Remove or connect to real filtering.
Truncated monetary values in primary cards	Mandatory responsive formatting.
Information Architecture
3 Layers
Synthesis (30s): 4–6 fixed KPIs + Daily Readout
Explanation: max 2–3 charts per section, separating Volume from Value
Action: Top opportunities/risks with deep links + preloaded state
Routes and Responsibilities
Table
Route	File	Question it answers
/	Index.tsx	"How are we doing?"
/detalhamento-agentes	DetalhamentoAgentes.tsx	"Who / how is this agent?"
/carteiras	Carteiras.tsx	"Goal vs actual per portfolio?"
/efetividade-boletos	EfetividadeBoletos.tsx	"Are issued boletos being paid on time?"
/modo-tv	ModoTV.tsx	Wall panel, scoped to today
*	NotFound.tsx	404
Source: agecob-lens/src/App.tsx:127-132. Corrected 2026-09-16 — there is no Dashboard.tsx
(Home is Index.tsx), and AnaliseProdutividade.tsx / ComparacaoAgentes.tsx were deleted in
586609c (2026-06-02). The 4-level sidebar zoom hierarchy that used to be documented here
described levels 2 and 4 as Productivity / Deep Analysis+Comparison pages; those pages no
longer exist, so the shipped hierarchy is flat over the five routes above.
Components
Live (components/executive/ unless noted)
HomeKpiStrip — KPI strip on Home
ExecutiveInsightCard — hero banner with embedded CTA + automatic omission in neutral state
SectionHeader — title + description + unit
KpiDeltaBadge — direction + color + baseline (target / MoM / moving average)
RitmoDiaCard — Ritmo do Dia (a card, not a heatmap)
HandoffFunnelChart, HandoffPortfolioRentabilidade, HandoffPortfolio1aParcela,
HandoffTopAgentes1aParcela, HandoffEficienciaGroupedBar, HandoffFinanceiroGroupedBar,
HandoffDiagnosticCards, BuEfficiencyChart, BuValueChart, HomeRiscoQualidade,
HomeKpiDetalheSheet, ChartShell, BlockHeader, ExecutiveHeader
AppSidebar (components/AppSidebar.tsx)

Deleted / never built (corrected 2026-09-16 — do not "refactor" these, they are gone):
ExecutiveKpiStrip and ExecutiveRankingTable were built then deleted in 586609c
(2026-06-02); RitmoDiaHeatmap was never created; AnaliseChartsPanel,
DashboardV2ChartsPanel, DetalhamentoChartsPanel and AgentComparisonDashboard were
deleted in the same commit and components/charts/ no longer exists.
Global Acceptance Criteria
Every page answers "result", "efficiency", "risk" without formula ambiguity.
No redundant card or chart in same viewport context.
No visible filter without real impact on data.
Every primary KPI displays baseline.
Daily Readout in neutral state omitted.
Every executive table/ranking exposes navigable inline action.
Monetary values at primary level do not truncate.
Sidebar communicates zoom hierarchy.