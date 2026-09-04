# Handoff — 2026-09-03 — metric divergences + Sentry review

Read this file first, then `docs/audits/sentry-integration-review-2026-09-03.md`.
Everything below was verified against the repo, not inferred. Where something is
**unverified**, it says so.

- Branch: `docs/fix-cte-prefilter-status-set` (4 commits ahead of `main`, **not pushed**, no PR)
- Worktree: clean except untracked `docs/audits/`
- Test suite: **255 passed** as of commit `e6248ee`

---

## 1. What is DONE (committed)

```
e6248ee  fix(agente): stop conversao.py labelling itself as official Conversao
f72340f  docs(entrega-api): note upstream fix for conversao_pct divergence
d969761  fix(acordos): pin conversao_pct to acordos/CPC in single-db branch
59c6db7  docs(data-layer): fix stale CTE pre-filter set
```

### 59c6db7 — stale CTE pre-filter
`agecob-lens/docs/data-layer.md` stated the CTE pre-filter twice, contradicting itself:
`(1,3,5,12)` under its own heading vs `(1,2,3,5,10,12)` 27 lines earlier. Canonical is
`(1,2,3,5,10,12)`, derived in `config/settings.py:59` as `STATUS_GERADOS + STATUS_EXCECAO`
and asserted in `tests/test_metric_registry.py:37`. **No code was ever wrong** — the literal
appears in zero `.py`/`.ts`/`.tsx` files. Also removed an obsolete stale-doc note in
`docs/documentação_API.md` §7.2 and corrected `regras-de-negocio.md` frontmatter to 2026-08-19.

### d969761 — conversao_pct branch divergence (the real bug)
`build_tabela_performance_periodo_query()` in `dominios/acordos/queries.py` emitted a
**different metric under the same name depending on the database**:
- `todos` branch (line ~359): `SUM(qtd_acordos)/SUM(qtd_contatos)` — correct
- single-db branch (line ~401): `qtd_boletos_pagos/qtd_contatos` — wrong, and it omitted
  `pagos_por_cpc_pct` entirely

The 2026-08-03 rename in `data-layer.md` reached the `todos` branch and missed this one.
Fixed; both branches now return the same shape. New test `tests/test_conversao_pct_shape.py`
(9 cases). **Verified the test catches the bug**: with the fix stashed, 6 of 9 fail — exactly
the two single-db values × 3 assertions — while the 3 `todos` cases pass.

Serves `GET /dashboard/tabela-performance-periodo/{db}`. No frontend component consumes
`TabelaPerformancePeriodo`, so it was dormant internally but is part of the delivered API.

### f72340f — entrega-api note
`entrega-api/` carries the identical defect but is a **frozen delivery snapshot** (last commit
2026-08-18) and `entrega-api/ENDPOINTS.md:255` documents the wrong behaviour as a contract.
User chose "option 2": leave the code, add a note that upstream diverged. Do **not** fix
entrega-api code without asking.

### e6248ee — conversao.py self-mislabel
`dominios/agente/conversao.py` returned `pagos/gerados` under key `conversao_pct` with a
`_CRITERIO` string asserting "Conversão oficial". Renamed to `efetividade_boleto_pct`
(the name `data-layer.md` already assigns to pagos/emitidos). Formulas unchanged — labels only.
Contained: `kpi_historico` passes the payload through; the `conversao_pct` in agent entries
and `evals/fixtures/gs*.json` is the **other, correct** agent-grain metric — leave it alone.

---

## 2. OPEN — Sentry review (highest priority)

Full report: `docs/audits/sentry-integration-review-2026-09-03.md` (24 findings, 39 confirmed /
1 refuted). **Untracked — not committed yet.**

Scope caveat: this reviewed the *integration code only*. No live Sentry events were read —
no Sentry connector was available. What *did* leak is still unknown.

### Hand-verified facts (re-check if you doubt them, they are cheap)
- `core/telemetry/agent_logger.py:20` — `sentry_sdk.init` passes exactly four options:
  `dsn`, `environment`, `traces_sample_rate`, `enable_logs`. Repo-wide grep for
  `include_local_variables` / `before_send` / `EventScrubber` / `max_request_body_size` /
  `send_default_pii` → **zero matches**.
- Installed `sentry-sdk` **2.66.1**: `include_local_variables` defaults **True**,
  `event_scrubber` None, `before_send` None, `max_request_body_size` `'medium'`.
- `core/database/pool_manager.py:46` binds the ODBC string including `PWD={password}` to a
  local, then `pyodbc.connect(conn_str)` inside a `try` that raises `HTTPException(500)`.
- `.env`: `APP_ENV=production`, `SENTRY_DSN` set non-empty, `SENTRY_TRACES_SAMPLE_RATE=1.0`,
  `ENABLE_AGENT_CHAT=true`, `REQUIRE_API_AUTH=false`. `SENTRY_ENABLE_LOGS` unset → defaults
  true (`config/settings.py:277`).

### Consequence
Frame locals ship unscrubbed on every captured exception → **production DB password** and
debtor `CPF_CNPJ`/`NOME_RAZAO` are one `pyodbc.connect` failure from Sentry (Starlette
integration auto-captures 500s — no unhandled exception needed). Separately, rank 2 needs
**no error at all**: `enable_logs` + default `LoggingIntegration` at INFO forwards every
`uvicorn.access` line, and `*-detalhe-agente/{db}/{agente}` puts an employee's real name in
the path. This is live in production now.

### The user asked for "fixes" and then interrupted before anything was applied.
**No Sentry fix has been made. Confirm intent before editing.** The user was offered:
(a) apply the mechanical one-liners, or (b) blank `SENTRY_DSN` first as a kill switch.
They did not answer. Ask.

Mechanical, no behaviour decision needed — ranks 1, 5, 6:
```python
# core/telemetry/agent_logger.py:20 — add to sentry_sdk.init(...)
include_local_variables=False,
max_request_body_size="never",
# and wrap the whole init in try/except so a malformed DSN cannot stop boot (rank 6)
```
Needs a human decision (changes what is observable): ranks 2, 4, 11, 13, 20.

Do **not** print the DSN, `DB_PASSWORD`, `API_TOKEN` or `DEEPSEEK_API_KEY` into chat or any
file. When inspecting `.env`, mask values.

### A wrong turn already ruled out — do not redo it
I suspected `sentry_sdk.logger` did not exist in 2.66.1, which would mean every `_sentry_log`
raises. **False.** It is a submodule that `init()` binds; the real call path works. Verified.

---

## 3. OPEN — metric-divergence sweep (never produced results)

Goal: sweep the whole repo for every metric/label/contract divergence of the class found in
`d969761` — same name carrying two formulas, field names that misdescribe content, docs
contradicting code, UI labels over the wrong metric.

- Workflow script:
  `.claude/projects/.../workflows/scripts/metric-divergence-sweep-wf_5e7c7e93-9b9.js`
- Run id: `wf_5e7c7e93-9b9`
- Status: **all 7 finder agents died on a session limit. Zero agents completed, so nothing is
  cached.** A resume re-runs everything from scratch.

Resume with:
```
Workflow({scriptPath: "<path above>", resumeFromRunId: "wf_5e7c7e93-9b9"})
```
Requires explicit user opt-in — it is multi-agent. The user opted in once via an
AskUserQuestion choice ("Full graph sweep for every divergence"); re-confirm, since that was
several turns ago.

The script already excludes today's fixes, `entrega-api/`, `docs/archive/`, `graphify-out/`,
so it will not re-report known items.

---

## 4. OPEN — stale records describing already-fixed problems

Never actioned; user was offered and did not choose:
- `agecob-lens/docs/plans/agente-tools-handoff-pt5-live-testing.md` lists the conversao.py
  mislabel under "Residual risk found but not fixed" — now fixed by `e6248ee`.
- `agent-reliability-ledger.html` carries it as an open landmine — same.
- `docs/agente-chat-rag.md:133` still defines official conversion as paid/issued, contradicting
  system-prompt Rule 7.

## 5. Known-but-unfixed, deliberately
- `agecob-lens/src/transforms/executiveMetrics.ts:24` `calcCPC()` returns
  `qtdContatos/qtdAcionamentos` — a ratio named for a count, and not even the canonical ratio
  (`qtd_alo/qtd_acionamentos`). Referenced only by its own test. Dead but a name-trap.
- `agecob-lens/docs/regras/regras-de-negocio.md:91-92` — KPI table gives
  `Taxa de contato % = qtd_contatos/qtd_acionamentos` (canonical uses `qtd_alo`) and
  `Taxa de conversão = qtd_acordos/qtd_acionamentos` (canonical denominator is `qtd_contatos`).
  Shipped code is correct; the doc table is wrong in two adjacent rows.
- `cpf_mask` returns the **full unmasked CPF** — deliberate decision 2026-08-06. Not a bug;
  it is why Sentry egress matters more here.

---

## 6. Graph state
`graphify --update` was run and completed: **6,019 nodes / 10,085 edges / 929 communities**.
It does **not** include today's code or doc changes — re-run `--update` to pick up the four
commits plus the audit doc.

Two graph caveats:
- HTML viz is skipped above 5,000 nodes; the Obsidian vault + `graph.canvas` are the
  navigation surface.
- 2,339 stale vault notes were moved (not deleted) to the session scratchpad
  `.../scratchpad/stale-vault-notes`. That directory is **temporary** — if the user wants
  them, move somewhere durable; otherwise they can be discarded.
- graphify's detector reports `aa.txt`, `document_pdf.pdf`, `.claude/settings.json` as deleted
  every run. **They exist on disk** — it just skips them. Do not prune graph nodes for them.

---

## 7. Operating notes that cost time today
- **Never run two workflows concurrently.** Doing so burned ~516k subagent tokens for zero
  output — both hit the session limit with 0/7 and 0/6 agents done. Run one, let it finish.
- Workflow resume caches completed agents by `(prompt, opts)`. The Sentry review took three
  passes and each was strictly cheaper than the last. Trust the resume.
- Repo-root recursive `grep` times out (node_modules + ~5k vault notes). Use the Grep tool
  with a scoped path, or exclude `graphify-out/`.
- PowerShell 5.1 mangles UTF-8; do file edits via `python` with explicit encoding, and
  **preserve existing line endings** — `dominios/acordos/queries.py` and
  `regras-de-negocio.md` are CRLF, `docs/documentação_API.md` is LF.
- Project rule: read `agecob-lens/docs/data-layer.md` **in full** before touching any
  data/metric code. It is 464 lines. Not optional.

## 8. Suggested next action
1. Ask the user: apply Sentry mechanical fixes, or blank `SENTRY_DSN` first?
2. Commit `docs/audits/` (currently untracked).
3. Then either the metric sweep (needs opt-in) or the stale-record cleanup.
4. Branch is unpushed with no PR — ask before pushing.
