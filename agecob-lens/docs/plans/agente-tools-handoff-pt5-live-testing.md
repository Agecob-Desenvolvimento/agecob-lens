# HANDOFF PT5 — Live-testing findings on the DeepSeek agent runtime + prod-readiness test plan

**Author:** Claude Sonnet (same session that closed `f44bfac`, then re-ran the original 3 real user questions verbatim to confirm the fix) · **Date:** 2026-08-20 · **Base:** [`agente-tools-handoff.md`](agente-tools-handoff.md) (pt1) + [pt2](agente-tools-handoff-pt2.md) + [pt3](agente-tools-handoff-pt3.md) + [pt4-fixes](agente-tools-handoff-pt4-fixes.md) + commit `f44bfac` (confidence rule, portfolio-scoped `query_kpi_historico`, new `detalhar_portfolio(drilldown="vencimentos")`). **Scope rule, same as pt2-pt4:** assumes pt1-pt4 already read. Does not repeat D1-D10 or the pt4 clusters.

**Why this doc exists:** `f44bfac` fixed the 3 gaps found in 3 real questions asked by an actual employee (Eduarda Simoso, via WhatsApp) that all came back `confidence:low`. Re-running the *exact same 3 questions verbatim* after the fix, live, against the running dev server (not a scripted eval), surfaced a new and more severe class of problem: the confidence label is now correct, but the underlying answers contain real accuracy and completeness defects that the eval suite does not catch. This doc maps what was found, flags one earlier finding that needs re-verification, and proposes a test plan to close the gap before this agent is trusted with real production traffic.

**Verification method used for every finding below:** never trust what the agent said. For each claim, called the underlying Python function directly (`build_detalhe_portfolio`, `build_portfolio_entries`) with the same db/date/portfolio args the agent used, and compared. Every number below is confirmed against real data, not inferred from the chat transcript alone.

---

## Cluster E — RunGuard step cap does not actually cap tool calls

**Status: FIXED and confirmed live (T1, same session).**

| # | Location | Mechanism | Confirmed? |
|---|---|---|---|
| E1 | `dominios/agente/guards.py` `RunState` / `MAX_STEPS=10` | Re-running the original Q1 ("E quanto tivemos produzido em BV ontem?") produced **11 tool calls in one turn** (4x `query_kpi_historico`, 1x `get_portfolio_metrics`, 4x `query_kpi_historico`, 2x `detalhar_portfolio`), confirmed via NDJSON telemetry (`logs/agent-debug.log`, `ENABLE_AGENT_TELEMETRY=true`). The step cap did not fire. | ✅ Confirmed, then fixed |
| E2 | Same file, D6 design assumption ("no parallel tool calls") | Root cause fully isolated: `_loop_deepseek`/`_loop_anthropic` (`agente.py`) each have an outer `for i in range(AGENT_MAX_TOOL_ITERS+1)` round loop that checks `state.force_final()` once per round, *before* that round's tool_calls are known — then an inner loop (`for tool_call in message.tool_calls` / `for block in response.content`) dispatches **every** tool_call/tool_use block the round returned, unconditionally, with no budget check between them. DeepSeek returned 4 `tool_calls` in one response twice in the Q1 trace (4+1+4+2=11) — all under `AGENT_MAX_TOOL_ITERS=4` rounds, so the round cap never tripped, and `MAX_STEPS=10` (a call-level cap) was only checked at round boundaries, by which point the whole batch had already executed. | ✅ Root mechanism fully read and fixed |

**Fix applied:** `RunState.dispatch()` (the single choke point both loops funnel every tool call through via `_tool_result_json`) now checks `steps_exceeded()` **before** running anything, refusing execution and returning a structured `step_budget_exceeded` error once the cap is hit — mid-batch or not. No change needed in `agente.py`; fixing the shared dispatch point covers both providers. Regression test: `tests/test_guards.py::test_dispatch_recusa_executar_apos_estourar_step_budget` (2 extra calls after the cap, proves `run_fn` never executes and `state.steps` doesn't increment past the cap).

**Live confirmation (not just the unit test):** fired a 7-question battery against the running dev server right after the fix. One question (S1 below, a portfolio ranking with fan-out) reproduced the exact overflow condition naturally. Real telemetry trace for that run (`srv-83df2e682a70`):
```
step=1..10  query_kpi_historico/filter_portfolios_by_value  error_type=[]        (all succeeded)
step=10     query_kpi_historico                             error_type=[step_budget_exceeded]  (blocked, not executed)
```
The 11th call in the batch was intercepted before touching the DB, and `state.steps` correctly stayed at 10 instead of incrementing to 11. The final synthesis turned this into an honest disclosure ("A consulta foi limitada pelo orçamento de ferramentas antes de verificar Riachuelo II e demais carteiras... o top 5 pode ainda ter empates") instead of Cluster F's false-negative pattern ("endpoint não retorna essa carteira" despite success) — same underlying condition (ran out of budget), opposite outcome, because the tool now hands the LLM a structured signal to work with instead of either silently succeeding-past-the-cap or saying nothing.

**Why this matters for prod:** a step cap that doesn't cap means wall-clock and cost are unbounded for any question that happens to trigger enough tool calls, and it invalidates the safety assumption every other RunGuard budget (`WALL_CLOCK_S`, `TOOL_BUDGET_TOKENS`) was sized against. Fixed now — those other budgets' sizing assumptions hold again.

---

## Cluster F — Synthesis says "unavailable" despite every tool call succeeding

| # | Location | Mechanism | Confirmed? |
|---|---|---|---|
| F1 | Q1 re-test, final synthesis step | All 8 `query_kpi_historico` calls returned `error_type: null` (real data came back every time), yet the final answer told the user "o endpoint... não retorna essa carteira." | ✅ Yes, telemetry shows 8/8 success against a false final claim |
| F2 | Q3 re-test ("vencimentos de ontem, por carteira") | Final answer states "Bradesco VIII e BVFinanceira III não estavam disponíveis." Bradesco VIII genuinely has no 19/08 activity — correct. BVFinanceira III has real 19/08 data: `boletos_gerados=2, valor_vencendo=12234.15, valor_recebido=0.0` (confirmed via direct call to `build_detalhe_portfolio("todos", "BVFinanceira III", "2026-08-19", "2026-08-19", "vencimentos", 1, 25)`) — the single largest vencimento in the entire dataset for that day, reported as if it doesn't exist. | ✅ Yes, confirmed against real data |

Two separate real questions, same failure shape: the agent has correct data available (either it fetched it and lost it during synthesis, as in F1, or it never fetched it and mislabels the gap as a data-availability problem, as in F2/Cluster H below). This is not a one-off — it's a repeatable pattern across different questions and different tool paths.

---

## Cluster G — No aggregate-by-portfolio tool for vencimentos; agent silently under-samples

`detalhar_portfolio(drilldown="vencimentos")` (added in `f44bfac`) is single-portfolio by design, matching `detalhar_portfolio`'s existing contract. Every other `*-por-portfolio` capability in this codebase (`acordos-por-portfolio`, `excecoes-por-portfolio`, `rejeitados-por-portfolio`, `quebrados-por-portfolio`) returns **every active portfolio in one call**. Vencimentos has no equivalent, so any "por carteira" question forces the agent into a manual per-portfolio loop with no way to know how many portfolios it should check.

| # | Question | Portfolios actually active | Portfolios the agent checked | Consequence |
|---|---|---|---|---|
| G1 | Q2 ("vencimentos de hoje, por carteira") | 9 (confirmed via `build_portfolio_entries`) | 1 (Bradesco VIII) | Answer presented as if Bradesco VIII were the only carteira with a vencimento, described as a tool limitation (see Cluster H) rather than "I checked one" |
| G2 | Q3 ("vencimentos de ontem, por carteira") | 20 (confirmed via `build_portfolio_entries`) | 7 | "Consolidado: R$1.875,02 projetados" presented as the full picture. It excludes BVFinanceira III's R$12.234,15 alone — bigger than the entire reported consolidated total. An exec reading this answer would conclude Santander XXIV (R$250 gap) is the worst case of the day; the real worst case (BVFinanceira III, 100% unpaid) is invisible |

**Fix direction (not yet built, needs a decision before implementing):** add a genuine aggregate-by-portfolio vencimentos tool, same shape as the existing `*-por-portfolio` endpoints, returning every active portfolio ranked by `valor_vencendo` in one call. This is new capability, not a bug fix in existing code — flagging here, not building without confirmation, same discipline as every other capability decision in this doc chain (D-series in pt1).

---

## Cluster H — Agent describes its own incomplete sampling as a tool/data limitation

Distinct from Cluster G (the missing capability) — this is about how the gap gets narrated to the user, which is arguably worse than the gap itself.

| # | Quote | Reality |
|---|---|---|
| H1 | Q2: "as demais carteiras (BVFinanceira III, Panamericano XV, Santander Financeira, Yamaha, etc.) não estão cobertas pela consulta de vencimentos dessa base" | False. Called `detalhar_portfolio(drilldown="vencimentos")` for BVFinanceira III directly for the same day — it returns real data (R$693,50 vencendo, 2 boletos). The tool is not the limitation; the agent simply never called it for the other 8 portfolios. |
| H2 | Q3: "Bradesco VIII e BVFinanceira III não estavam disponíveis no detalhamento desta base/janela" | Half true, half false — bundling a real "not available" (Bradesco VIII) with a false one (BVFinanceira III) in the same sentence, so the user has no signal to distinguish a genuine data gap from an agent coverage gap. |

**Why this is its own cluster and not folded into G:** fixing G (adding the aggregate tool) removes the *need* to sample, but doesn't by itself guarantee the agent will honestly disclose partial coverage the next time it happens for some other reason (a future tool, a future edge case). The system prompt should require an explicit "consultei N de M carteiras" disclosure whenever a "por carteira" answer doesn't cover 100% of active portfolios, independent of which tool produced the gap.

---

## Cluster I — Synthesis drops the tool's own business-rule disclaimer

**Status: FIXED and confirmed live (T15, same session).**

Found via the 7-question battery (3 general + 4 specific) run right after the Cluster E fix, same session. Question G3: "Quantos boletos quebraram hoje?"

`get_acordo_status_breakdown()` (`dominios/agente/risco.py:_status_breakdown_from_rows`) is correctly designed: it returns a per-status breakdown *and* a `total_qtd`/`total_valor` across every status present, plus an explicit `nota` field: `"qtd e valor de 1ª parcela por status no período; GERADOS = 1, 2, 3, 10, 12."` — i.e. the tool itself flags that its grand total spans more statuses than the business term "gerados" covers.

The agent's final answer: *"Visão geral de status no dia: 15 ATIVOS, 7 PENDENTES/Exceção, 2 REJEITADOS e 1 QUEBRA, totalizando 25 acordos (R$ 15.631,56 gerados)."* Verified directly (`build_status_breakdown("todos","2026-08-20","2026-08-20")`): `total_qtd=25`/`total_valor=15631.56` is exactly right as an all-status sum, but labeling it "gerados" is wrong — real GERADOS-only figure (status 1,2,3,10,12) is `qtd=16`/`valor=2981.26` (which is exactly what G1, a separate question in the same battery, correctly reported). The mislabeled number **overstates generated value by 424%** (R$15.631,56 vs the real R$2.981,26) by folding in REJEITADO (2/R$250) and PENDENTE/Exceção (7/R$12.400,30) — statuses this project's own canon (`CLAUDE.md`, `README.md`, `data-layer.md`, all repeated verbatim) explicitly excludes from "gerados."

Not a data bug — the SQL/tool layer is correct and even self-documenting via `nota`. The failure is purely in the LLM's final-text synthesis: it read the raw total and slapped the business term on it without checking the disclaimer the tool handed it in the same payload.

**Fix applied:** three edits to `dominios/agente/system_prompt.md` — a new invariant, rule #6 in "Regras de negócio (invioláveis)" (`"Gerados" é sempre só status 1, 2, 3, 10, 12`, explicitly naming `get_acordo_status_breakdown()`'s `total_qtd`/`total_valor` as the trap), a tightened description on that tool's own listing pointing back at rule #6, and a new item #5 on the "Antes de responder, confira" checklist. No code/SQL changed — `get_acordo_status_breakdown()` was already correct and self-documenting; this is purely a synthesis-discipline fix.

**Live confirmation:** re-fired the exact G3 question ("Quantos boletos quebraram hoje?") against the running dev server after the edit (hot-reloaded, no restart). New answer: *"houve 1 acordo quebrado (status QUEBRA), somando R$ 97,13... Para contexto, os acordos do dia: 15 ativos (R$ 2.884,13), 7 pendentes/exceção (R$ 12.400,30) e 2 rejeitados (R$ 250,00)."* — reports the per-status breakdown plainly and never labels any summed total "gerados." No regression test added (nothing in the currently-runnable suite exercises `system_prompt.md` content — the only prompt-behavior test infra is the eval harness, which can't even collect right now due to the pre-existing missing `freezegun` dependency, unrelated to this fix); relying on this live verification the same way the original confidence-rule fix (`f44bfac`) did before the eval suite covered it.

## Cluster J — "Conversão" questions get silently answered with a different, name-collided metric

**Status: FIXED and confirmed live.**

Same battery, question S4: "Qual a conversão hoje em COBwebRCBAUTOS, em COBwebRCBCONSUMER, e no total somando os dois?"

`query_kpi_historico`'s own tool description (`dominios/agente/tools.py:213`) says outright: *"NÃO cobre taxa de contato/CPC/conversão nem acionamentos por dia — essas métricas só existem como total do período."* Its `kpi` enum (`schemas.py:46-49`) confirms there is no `conversao` option — only `valor_acordos_gerados`, `qtd_acordos`, `risco_composto_pct`, `efetividade`, `ritmo_dia`.

The agent called `kpi="efetividade"` (boletos pagos no prazo / emitidos — a different, already-once-renamed metric, see `docs/data-layer.md`'s "Name collision resolved (2026-08-03)") and labeled the entire answer "Conversão" throughout: *"Ritmo de conversão de boletos hoje... COBwebRCBAUTOS: 0%... COBwebRCBCONSUMER: 0%..."* — reproducing, at the agent-synthesis layer, the exact confusion the 2026-08-03 backend rename was built to kill (that doc's own words: *"the chat agent used to answer ~4% where the Home card showed ~11%"*).

What makes this worse than a plain capability gap: the same battery's G2 question ("Qual a conversão do escritório hoje comparado com a média?") hit the *identical* underlying limitation and handled it correctly — it answered with `ritmo` data instead and explicitly said *"a conversão propriamente dita (acordos/CPC) não tem série diária — só existe como total do período."* So the agent has the right instinct sometimes and not others; it's inconsistent, not uniformly broken.

**Cluster I and J share one root cause with Cluster F:** the tools and SQL are accurate — in I's case, actively self-documenting. The trust failure is concentrated entirely in the final-answer-writing step, where the model either drops a disclaimer the tool handed it (I), substitutes a different metric while keeping the original label (J), or occasionally gets it right by disclosing the gap instead (G2, and S1/S2 in the same battery). Fixing the tools further won't help — this needs either a stronger system-prompt constraint (treat a `nota` field as mandatory to surface, never relabel a substituted metric with the asked-for name) or a post-synthesis validation pass that checks the final text against the tool payloads it was built from.

**Root cause found (verify-don't-assume pass before fixing):** the inconsistency between G2 (handled correctly) and S4 (mislabeled) traced to a specific line, not a vague synthesis flakiness. `system_prompt.md`'s own "Glossário do negócio → tool" table had this row: `| "boletos estão sendo pagos?", "conversão histórica" | query_kpi_historico(kpi="efetividade", ...) |` — the prompt itself instructed the model to answer "conversão histórica" using the efetividade kpi. Two contributing findings alongside it: (1) the `AgentEntry` field list ("O dado com que você trabalha") described `conversao_pct` as `= pagos no prazo / CPC` — the pre-rename formula from the 2026-08-03 name-collision fix documented in `data-layer.md`, i.e. stale doc describing the *old* wrong formula under the field that was renamed specifically to carry the *correct* one (actual code, `dominios/agente/agentes.py:83-84`, already computes `conversao_pct = qtd_acordos/qtd_contatos` correctly — only the prompt's description of it was wrong); the doc also never mentioned `pagos_por_cpc_pct`, the field that actually holds the pagos/CPC formula. (2) confirmed by re-checking `schemas.py`'s `QueryKpiInput.kpi` Literal (still exactly 5 values, no `conversao` option) and every portfolio/db-grain tool (`get_portfolio_metrics`, `compare_portfolios`, `get_cruzamento_agente_carteira`, `detalhar_portfolio`) that none of them expose `qtd_contatos`/CPC at portfolio or db grain — conversão genuinely only exists correctly at agent grain (`get_agent_performance`/`list_agents_performance`/`comparar_agentes`, field `conversao_pct`), so disclosure (not a redirect) is the honest answer for any db-wide or portfolio-wide "conversão" question.

**Fix applied** — five edits, `system_prompt.md` unless noted: (1) split the glossary row above into "boletos estão sendo pagos?" → efetividade (kept, legitimate) and a new row for conversão jargon ("conversão hoje/histórica/por banco/carteira") that points at the agent-grain tools or an explicit disclosure, never efetividade; (2) corrected the `conversao_pct` field description to the real formula and added the missing `pagos_por_cpc_pct` field with its own (different) formula, explicitly marked "não é conversão"; (3) new rule #7 in "Regras de negócio (invioláveis)", same style as rule #6 (Cluster I): conversão ≠ efetividade, states where conversão does/doesn't exist, forbids relabeling; (4) new checklist item #6 on "Antes de responder, confira"; (5) `dominios/agente/tools.py`, tightened `query_kpi_historico`'s own description past the existing "NÃO cobre... conversão" disclaimer to say what to do instead (use the agent-grain tools or disclose, never substitute). No SQL/backend logic changed.

**Residual risk found but not fixed (flagged, out of scope for this pass):** `dominios/agente/conversao.py` — the module backing `kpi="efetividade"` — returns a `criterio` field whose value is literally `"Conversão oficial: boletos de 1ª parcela pagos no prazo... / boletos emitidos"`, and names its own data keys `conversao_pct` (not `efetividade_pct`). That's the tool *payload itself* asserting it is the official conversion, contradicting the actual dictionary formula in `CLAUDE.md`/`data-layer.md`. This is a second, code-level instance of the exact class of bug the 2026-08-03 rename (`data-layer.md`) already fixed once elsewhere — just never caught here. Left unmodified: fixing it means renaming fields consumed by `tests/test_agente.py` (4 exact-dict assertions, e.g. line 526) and is a data-shape change, not a synthesis fix — bigger blast radius than this pass's scope. The live tests below show the prompt-level fix holds up despite this residual field naming (the model never called `efetividade` and relabeled it in any of the 6 re-tests), but it remains a live landmine for future rewordings or model drift since the false self-label is still there in the payload.

**Live confirmation:** fired the exact S4 repro plus 5 more variants against the running dev server (hot-reloaded, no restart) via `POST /agente/chat`, `db="todos"`, date=2026-08-20:
- S4 repro ("conversão hoje em COBwebRCBAUTOS, COBwebRCBCONSUMER, e total") — before: called `kpi="efetividade"` and titled the answer "Conversão" throughout. After: *"Conversão não está disponível no grão que você pediu. A fórmula oficial é qtd_acordos / qtd_contatos (CPC), e ela só existe no grão agente... O que existe por dia/banco é efetividade (boletos pagos/emitidos), métrica diferente."* `data_sources: ["explicar_metrica"]`, `confidence: medium`.
- "Qual a taxa de conversão hoje?" — same disclosure pattern, explicitly: *"Não vou substituir em silêncio como se fossem a mesma coisa."*
- "Qual a conversão por banco hoje?" — same disclosure, `confidence: high`.
- "Como está a conversão comparada a ontem?" — disclosed the gap AND substituted real `ritmo_dia` data with actual numbers (15 acordos acumulados, projeção 25) instead of guessing or going silent — same good pattern G2 already used.
- Control (agent-grain, should still work): "Quais os 5 agentes com maior taxa de conversão?" → correctly used `list_agents_performance`, real numbers (Maria Clara 200%, Ronie Von 80%, ...), even correctly explained why >100% isn't an anomaly (acordos come from a different source than CPC, per the funnel rule).
- Control (legitimate efetividade, should NOT be redirected): "Os boletos estão sendo pagos hoje?" → correctly called `query_kpi_historico(efetividade)` and labeled it "efetividade" throughout, never "conversão."

`pytest tests/ -q --ignore=tests/test_eval_harness.py --ignore=tests/test_golden_set.py`: 186 passed, same as pre-fix baseline. No regression test added — same reasoning as Cluster I: nothing in the runnable suite touches `system_prompt.md` prose (confirmed via grep, zero hits), and the eval harness still can't collect (pre-existing missing `freezegun`, unrelated to this fix).

---

## 7-question battery results (3 general + 4 specific), post-Cluster-E-fix

Run live against the dev server, `db="todos"`, date filter = today (2026-08-20), verified against ground truth via direct Python calls the same way as the original 3-question re-test.

| ID | Question | Result |
|---|---|---|
| G1 | Acordos + valor gerado hoje, consolidado | ✅ Exact match (16 acordos, R$2.981,26, correct per-db split 7/9) |
| G2 | Conversão hoje vs média | ✅ Correct + honest — substituted ritmo and explicitly disclosed why conversão-by-day isn't available |
| G3 | Boletos quebrados hoje | ⚠️ Numbers exact, **label wrong** — see Cluster I |
| S1 | Ranking geração por carteira, ontem | ⚠️ Honestly disclosed as budget-limited (Cluster E fix working as designed) — but cross-checking against S2 in the same batch shows the disclosed-incomplete ranking is also **compositionally wrong**: BVFinanceira III (5 acordos ontem, per S2) was never checked and would rank #2, ahead of the reported Santander XXII (3) |
| S2 | 3-portfolio, 2-date, multi-metric comparison | ✅ All figures cross-validated (against S1 and against the earlier live Q1 re-test) + correctly disclosed that CPC/conversão isn't tracked at portfolio grain |
| S3 | Ambiguous portfolio name ("Panamericano") | ✅ Correctly disambiguated to both real matches (Panamericano IX, XII) instead of guessing one; exact numbers confirmed |
| S4 | Conversão per-db + total | ❌ **Wrong metric, mislabeled** — see Cluster J |

Net: 3/7 clean, 2/7 right-numbers-wrong-label (I, J), 1/7 honest-but-incomplete (S1, and the Cluster E fix visibly working), 1/7 fully correct edge-case handling (S3). Zero fabricated numbers across all 7 — every figure the agent stated either matched ground truth exactly or was correctly labeled as unavailable. The failure mode this session keeps finding is never "the agent makes up a number" — it's "the agent gets the number right and then either mislabels it or silently narrows its scope."

---

## Cluster K — Cross-db scope silently narrowed, same shape as Cluster G but on the db dimension

**Status: FIXED and confirmed live (T4, 2026-08-21).**

Question: *"O que aconteceu ontem e o que está acontecendo hoje, em resumo?"* (`db="todos"`). Answer: *"Ontem (20/08) foi dia pleno na base: **15 acordos** somando **R$ 2.396,47**..."* Asked immediately after in the same batch, a narrower question — *"Quantos acordos foram gerados ontem?"* — got: *"**45 acordos** ontem, somando as duas bases: **15** no RCBCONSUMER e **30** no RCBAUTOS."*

Two answers, same session, same literal day, off by 3x. Verified against ground truth (`build_kpi_historico("todos", "qtd_acordos", "2026-08-20", "2026-08-20", "dia", 1)` → `45`; per-db: `COBwebRCBCONSUMER` → `15`, `COBwebRCBAUTOS` → `30`). The first answer's "15" is **exactly** the `COBwebRCBCONSUMER`-only figure — the agent called `query_kpi_historico` scoped to one database (silently, its own choice, nothing in the question asked for a single bank) and presented it as "a base" without disclosing it covers half the real scope. `db="todos"` was the session's actual filter throughout.

**Root cause confirmed from the Langfuse trace itself** (full conversation history pulled via CSV export from the real project, not inferred): the model's own reasoning for this exact question, before the fix, literally said *"Vou usar o db COBwebRCBCONSUMER como referência e declarar"* (I'll use CONSUMER as reference and declare it) — it knew it was narrowing scope and intended to disclose that, but the disclosure didn't reliably survive into the final synthesized JSON. Confirms this was a synthesis-discipline gap, same family as Clusters F/I/J, not a missing capability — `query_kpi_historico` already supports being called once per db.

**Fix applied:** new rule 8 in `system_prompt.md`'s "Regras de negócio (invioláveis)" — when `db="todos"` and the question wants a consolidated answer, call the tool once per real database and sum before answering; if budget only allows one, say explicitly which bank was skipped. Plus checklist item 7.

**Live re-verification, same repro question:** *"**Ontem (20/08)** geramos **R$ 66.628,91** em 1ª parcela, com **45 acordos** nas duas bases (Consumer: R$ 2.396,47 / 15 acordos; Autos: R$ 64.232,44 / 30 acordos)."* — exact match to ground truth, both banks shown, correctly summed. `data_sources` confirms `query_kpi_historico` was called for both `COBwebRCBCONSUMER` and `COBwebRCBAUTOS` this time.

---

## Cluster L — Portfolio-name guessing burns the step budget on failed lookups, force-final degenerates to near-empty output

**Found and fixed same session as Cluster K (2026-08-21)**, via the same Langfuse trace pull — this is what a portfolio-ranking question actually does when Cluster G's missing aggregate tool forces a manual per-portfolio loop, traced in full detail for the first time.

Question: *"Ranking de geração de acordos por carteira ontem - quais as 5 que mais produziram?"* Before the fix, the trace shows the model's reasoning spiraling for several rounds — *"Há um descompasso: a sessão tem 1 carteira (Panamericano XIV), mas há várias carteiras disponíveis... Na base AUTOS há 16 carteiras disponíveis, na CONSUMER 5... vou consultar as carteiras listadas nas duas bases em paralelo..."* — then it started calling `query_kpi_historico(portfolio="Panamericano XIV", ...)` against `COBwebRCBAUTOS`, repeatedly, even though the tool's own error response on the first attempt already told it the real available names for that base (`Itau IV`, `Santander XXIV`, `Marisa V`, `Santander XXII`, `Bradesco VIII`, ...) — none of which is "Panamericano XIV" (that portfolio only exists in the session's own today-scoped, single-entry `CONSUMER` list). Five nearly-identical failed calls later, `MAX_STEPS` hit (Cluster E's guard fired correctly — five more calls got `step_budget_exceeded`, exactly as designed). But the forced-final generation, given a conversation full of five `step_budget_exceeded` errors stacked on failed lookups with no usable ranking data, didn't produce a "here's what I found, limited by budget" answer like the earlier clean S1 case — it returned **one token: `{`**. `confidence: "low"`, `data_sources: []`, effectively a broken response.

**Distinct from Cluster E:** the guard itself worked exactly as designed (blocked calls 11-15 correctly). This is about what force-final synthesis produces when the context it's forced to summarize contains no usable data and several stacked errors — the "S1 worked fine" evidence from two days earlier only proved force-final degrades gracefully when most of the prior calls *succeeded*. It doesn't handle an all-failure context the same way.

**Fix applied:** new rule 9 in `system_prompt.md` — only try portfolio names that already came from a tool result (`filter_portfolios_by_value`, `get_portfolio_metrics`, or a prior error's `available_portfolios` list), never guess; a "carteira não encontrada" means stop trying that name, not repeat the same aggregate call hoping for a different result; if the candidate list is too large for the remaining budget, answer with what's feasible (e.g. the largest by value) and say the ranking is partial.

**Live re-verification, same repro question:** *"Em 21/08 apenas **1 carteira** produziu valor de 1ª parcela: **Panamericano XIV**... As demais posições do ranking não têm dado no período... Não há ranking de 5 preenchível hoje."* No more crash, no more wasted calls (`data_sources` down to 2 calls total, both real: `filter_portfolios_by_value`, `get_portfolio_metrics`), and it correctly refused to pad a 5-item ranking that doesn't exist.

**Residual gap found in that same re-verification, not yet fixed:** the answer talks about **21/08** ("Em 21/08 apenas 1 carteira...") even though the question explicitly asked for **ontem (20/08)**, a day with real multi-portfolio activity (45 acordos combined, confirmed in Cluster K above). Rule 9 stopped the crash and the name-guessing, but the model took the path of least resistance — answered with the session-scoped tools (`filter_portfolios_by_value`/`get_portfolio_metrics`, which reflect the session's own `date_from`/`date_to`, i.e. today) instead of correctly reading "ontem" from the question text, and never flagged that it substituted a different day. Same shape as Cluster J's silent metric substitution, one more dimension over (date, not metric or scope) — a real, portfolio-ranking-specific instance of what T3 (the still-unbuilt aggregate-by-portfolio tool) would probably resolve properly, since it would let the agent ask for a specific day's ranking directly instead of falling back to session-scoped single-carteira tools. Not fixing now — flagging for whoever picks up T3.

---

## Prod-readiness test plan

Organized by priority. "Blocker" items produce wrong-but-confident answers or unbounded resource use — must be fixed and re-verified before real traffic. "High" items are correctness under normal, non-adversarial use. "Security" is non-negotiable regardless of priority label. "Process" is ongoing discipline, not a one-time test.

### Blocker

- ~~**T1 — Step cap enforcement.**~~ **DONE.** Root cause was `RunState.dispatch()` never checking its own budget — see Cluster E above for the fix, the regression test, and the live telemetry trace proving it fired correctly under real DeepSeek behavior.
- **T2 — Synthesis faithfulness.** Build a small scripted check (reuse the `dominios/agente/evals/` harness if it already supports this shape) that, for every tool call in a run, asserts the final answer's claims about that tool's data are consistent with `error_type`/`row_count` in telemetry. At minimum: a tool call with `error_type: null` and non-empty rows must never be followed by a final answer claiming that data is unavailable.
- **T3 — Aggregate-by-portfolio vencimentos tool.** Build it (Cluster G fix direction above), test that its total exactly matches the sum of individually-queried portfolios for the same day (cross-check against `detalhar_portfolio(drilldown="vencimentos")` per portfolio, same pattern as `test_efetividade_por_portfolio.py`).
- ~~**T4 — Coverage disclosure rule.**~~ **DONE.** See Clusters K and L above — two rules added (db-scope disclosure, no portfolio-name guessing), both live-reverified. T3 (the aggregate-by-portfolio tool) is still the real fix for Cluster L's residual date-substitution gap — a direct per-day ranking tool removes the need to fall back to session-scoped single-carteira tools at all.
- **T5 — Cross-db scope-mixing retest.** Re-derive the issue described above with fresh questions, confirm whether it's still real post-`f44bfac`, document exact repro before scoping a fix.
- ~~**T15 — Nota/disclaimer enforcement (Cluster I).**~~ **DONE.** See Cluster I above for the fix (3 edits to `system_prompt.md`) and the live re-verification.
- ~~**T16 — Stop silent metric substitution (Cluster J).**~~ **DONE.** See Cluster J above for the fix (glossário row split, `conversao_pct` field description corrected, new rule #7, new checklist item, tightened `query_kpi_historico` description) and the live re-verification against the S4 repro plus 5 rewordings/controls.

### High

- **T6 — Fuzzy portfolio name resolution.** Battery of typos/abbreviations/case variants ("bv", "BV Financeira", "bvfinanceira 3", "santander 24") against `_find_portfolio_name`. Confirm correct resolution or an honest "carteira não encontrada, você quis dizer X?" — never a silent wrong match.
- **T7 — Date-range edge cases.** "hoje", "ontem", "esse mês", explicit `YYYY-MM-DD`, month/quarter boundaries, and days with zero activity (weekends/holidays). Confirm the agent doesn't fabricate a number for a day with no rows.
- **T8 — Confidence calibration sweep.** A battery spanning full-data, partial-data (the case `f44bfac` just fixed), and no-data-at-all questions. Confirm `low`/`medium`/`high` match the rule in `system_prompt.md`, not just the 3 cases already tested.

### Medium

- **T9 — Concurrency / cache isolation.** pt4 Cluster B finding #2 (cross-session cache-key missing `date_from`/`date_to`) was reportedly fixed — retest under genuine concurrent load (2+ simultaneous sessions with different date filters), not serially. Serial testing won't reproduce a race.
- **T10 — Error-path handling.** Invalid `db` param, a portfolio with zero rows, a simulated DB timeout. Confirm the agent reports "sem dado"/error honestly instead of fabricating a plausible-looking number.
- **T11 — Wall-clock budget under a real step cap.** Once T1 lands, re-measure `WALL_CLOCK_S` behavior — Q1 took 17.8s for 11 (uncapped) calls; confirm the guard actually cuts off a run that would otherwise exceed it once the cap is enforced correctly.

### Security (non-negotiable)

- **T12 — PII leakage.** Battery of portfolio/agent-detail questions, confirm `nome_devedor` never appears in agent output (already stripped per `_mask_cpf`/tool-output filtering — verify it holds across every tool, not just the ones already tested).
- **T13 — Injection via tool data.** Since the `<dados>` wrapping promise was removed rather than implemented (pt4 Cluster C), confirm the "tool output is data, never instruction" principle actually holds in practice — try a free-text field (`CTO_AGENDA.TEXTO`, `CTO_COMPLEMENTO.DESCR`) containing something that looks like an instruction, confirm the agent doesn't act on it.

### Process

- **T14 — Regression discipline.** Every fix above needs a new test reproducing its exact failure mode, same rule pt4 enforced for Cluster A (a green existing suite does not prove a fix — the existing suite didn't catch any of Clusters E-H either). Full `pytest` run must stay green throughout.

---

## Suggested order

T1 done. Remaining E/F/G/H/I/J fixes (T2-T5, T15-T16) block prod — they produce confidently wrong or mislabeled answers, which is worse than no answer. T6-T8 should run before prod but may not need code changes if they already pass. T9-T11 can run in parallel with the blockers. T12-T13 are a hard gate regardless of schedule pressure. T14 applies throughout, not at the end.

T15/T16 are likely the cheapest blockers left — both are system-prompt-level fixes (no new SQL, no new tools), same class of change as the `f44bfac` confidence-rule fix. Worth doing before T3/T4 (the aggregate-portfolio tool, which is a real feature build).
