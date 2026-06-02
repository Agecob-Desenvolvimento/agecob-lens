First of all, you only can answer and ask, type, only in english language

MANDATORY DATA-WORK READ: any task touching data — fetching, ViewModels, selectors, metrics, adapters, or the data-layer contract (frontend or backend) — REQUIRES reading docs/data-layer.md IN FULL before editing any code. Applies to the main session and every subagent. Do not edit data code without having read the entire file.

AgDash — Context for Claude Code
Project
Executive redesign of AgDash: transform the interface into an executive decision-making tool with clear visual hierarchy, consistent KPI semantics, and action narrative.
Current Status
Restructuring in progress. Before any action, read TASKS.md and execute only items not marked with [x].
When completing an item, mark it with [x] immediately, before moving on to the next.
Note: TASKS.md was rewritten as an Execution Pipeline (Phase 0 → Wave A–E → Phase 5 → Final Checklist). It replaced the old Waves A–D. The initial reading rule and [x] marking still apply.
When the last item of the Final Delivery Checklist is marked, update this file: replace "Current Status" with "Status: redesign completed" and remove the initial TASKS.md reading obligation (item already listed in the checklist itself).
Inclusion Rule — "Wrong or Act"
Mandatory criterion for any element occupying space in the main viewport:
"Does this element answer, without additional interaction, 'What is wrong right now?' or 'What do I do right now?'"
If yes: it stays, with visual hierarchy proportional to severity.
If no: it is removed or demoted to a secondary layer (drawer, secondary tab, collapsible).
Apply this criterion before creating or keeping any card, chart, or block.
Official Metrics Dictionary
These are the only valid definitions. Do not create variations or alternative labels.
Table
Metric	Formula
CPC	Σ qtd_contatos (count of contacts — same as "Contatos", just another name). Unit: count, NOT %.
Contact rate (Taxa de contato %)	Σ qtd_contatos / Σ qtd_acionamentos — the ratio. MUST be labelled "Taxa de contato", never "CPC".
Conversão (Conversão %)	Σ qtd_boletos_pagos / Σ qtd_boletos_emitidos × 100 — boleto pago no prazo (≤ 5d do vencimento) sobre boleto vencido (DT_VENCIMENTO < hoje, acordo aprovado). Unit: %. Na Home compara vs "média do escritório" (benchmark 3m), não período anterior — no grão diário é ~0% (boleto de hoje não venceu).
Average ticket	Σ valor_acordos / Σ qtd_acordos
Exceptions (% value)	Σ valor_excecoes / Σ valor_acordos
Forbidden to use "Conversion Rate" without specifying the formula.
Forbidden to use competing formulas for the same indicator on the same page.
Every KPI displays: short label (card), formula (tooltip), explicit unit (BRL, %, count).
Presentation Rules
Monetary values
Forbidden to truncate monetary values in primary cards.
Mandatory responsive formatting: R$ 1.61 mi instead of R$ 1.611.168…
KPI Hierarchy
Primary KPI (Agreement Value) occupies 2× the visual area of secondary ones.
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
Anti-truncation for monetary: primary values NEVER use truncate. Format via formatBRLCompact() → "R$ 1.61 mi".
Fixed semantics: rose=critical, emerald=positive, amber=warning, slate=neutral, sky=action.
Decorative shadows forbidden. Hierarchy via typography and size, not shadow.
Neutral state: components that should be OMITTED in neutral NEVER render a visual placeholder.
In the actual agecob-lens code, these tokens enter via HSL CSS vars in src/index.css + tailwind.config.ts (classes bg-success-soft, text-danger-fg, etc). See SPECS.MD §0.6.1–§0.6.3 for the apply-and-replace table.
Baselines
Every primary KPI displays a comparison line below the absolute value.
Fallback priority: period target → MoM/YoD → N-day moving average
Format: ↑ 12% vs target or ↓ 4% vs yesterday
Daily Readout (hero banner)
Critical state: background rose-50, border rose-200, embedded primary CTA.
Positive state: background emerald-50, smaller height, secondary CTA.
Neutral state: omit the entire block. Active blank space.
Never display "No immediate action recommended" as a permanent visual element.
Anti-Patterns — Never Reintroduce
Table
Anti-pattern	Action
"Daily Signals" block outside Home	Keep only on Home. Remove from all other routes.
Rankings with same ordering on different tabs	Consolidate into a single authoritative ranking per dimension.
Contact/no-contact decomposition in both chart and table simultaneously	Keep only in chart. Table collapsed by default.
Permanent neutral-state card	Convert to omitted state.
Filters with no real effect on data	Remove or connect to real filtering.
Truncated monetary values in primary cards	Mandatory responsive formatting.
Information Architecture
3 Layers
Synthesis (30s): 4–6 fixed KPIs + Daily Readout
Explanation: maximum 2–3 charts per section, separating Volume from Value
Action: Top opportunities/risks with deep links and preloaded state
Routes and Responsibilities
Table
File	Question it answers
Dashboard.tsx (Home)	"How are we doing?"
AnaliseProdutividade.tsx	"Why?"
DetalhamentoAgentes.tsx	"Who / how is this agent?"
ComparacaoAgentes.tsx	"Who to prioritize / allocate?"
Sidebar — zoom hierarchy
Level 1 (Synthesis): Executive Dashboard
Level 2 (Analysis): Productivity → sub-items by Office/BU
Level 3 (Detail): Agent Details
Level 4 (Deep Dive): Deep Analysis / Comparison
Components
New (build from scratch)
ExecutiveKpiStrip — KPI strip with asymmetric primary/secondary grid
ExecutiveInsightCard — hero banner with embedded CTA and automatic omission in neutral state
SectionHeader — title + description + unit
ExecutiveRankingTable — ranking with primary column + secondary column + inline actions
RitmoDiaHeatmap — hours × metric heatmap; tooltip with raw numbers
KpiDeltaBadge — direction + color + baseline (target / MoM / moving average)
Existing (refactor, do not rewrite from scratch)
AnaliseChartsPanel
DashboardV2ChartsPanel
DetalhamentoChartsPanel
AgentComparisonDashboard
AppSidebar
Global Acceptance Criteria
Every page answers "result", "efficiency", and "risk" without formula ambiguity.
No redundant card or chart in the same viewport context.
No visible filter without real impact on data.
Every primary KPI displays a baseline.
Daily Readout in neutral state is omitted.
Every executive table/ranking exposes navigable inline action.
Monetary values at primary level do not truncate.
Sidebar communicates zoom hierarchy.