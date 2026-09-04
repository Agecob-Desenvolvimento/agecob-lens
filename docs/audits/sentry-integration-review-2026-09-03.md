# Sentry Integration Review — 2026-09-03
Scope: the Sentry **integration in this repository** — what the code sends and how it is
configured. No live Sentry events were read (no Sentry connector available in that session).

Method: 6 independent review angles, each adversarially verified by a separate agent instructed
to refute rather than confirm, then merged and ranked. **39 findings confirmed, 1 refuted.**

The load-bearing claims of ranks 1, 2, 5, 6, 13 and 23 were then re-verified by hand against
the installed `sentry-sdk` 2.66.1 and the live `.env` before this report was written.

## Posture

Not safe to run against production data today — and it is running. `.env` has a live DSN (`o4511660118900736.ingest.us.sentry.io`), `SENTRY_TRACES_SAMPLE_RATE=1.0`, `APP_ENV=production`, `ENABLE_AGENT_CHAT=true`, and the frontend `.env` points the SPA at the same project at 1.0. Two things are wrong at once. (a) `sentry_sdk.init` (core/telemetry/agent_logger.py:20-25) passes four options and nothing else — no `include_local_variables=False`, no `before_send`, no `EventScrubber`, no `max_request_body_size`. Repo-wide grep for those names returns zero matches. The installed SDK therefore ships every traceback frame's locals, and reviewers reproduced, against this code, the full ODBC connection string with `PWD=<DB_PASSWORD>` and lists of debtor rows carrying `CPF_CNPJ`/`NOME_RAZAO` inside `frames[*].vars`. The DB-password path does not even need an unhandled exception: `pyodbc.connect` failing raises `HTTPException(500)`, which StarletteIntegration auto-captures via its 500-599 `failed_request_status_codes`. One SQL Server restart or network blip is enough. (b) Even with zero errors, the integration exfiltrates on the happy path: `enable_logs=true` plus the default `LoggingIntegration(sentry_logs_level=INFO)` turns every `uvicorn.access` line into a Sentry log — one per HTTP request, carrying client IP and the full path, and the `*-detalhe-agente/{db}/{agente}` routes put a collections agent's real `USU_MASTER.NOME` in that path. The browser side ships the same names in `http.client` spans and fetch breadcrumbs at 100% sampling. So: employee personal data is leaving the LAN continuously right now, and debtor CPF/name plus the production SQL Server password are one ordinary error away. What is genuinely not proven: no reviewer found a path that sends debtor PII on the non-error path, and `send_default_pii` is correctly off. The mitigating facts are thin — `REQUIRE_API_AUTH=false` merely makes a few credential findings latent rather than live. Recommended posture: blank `SENTRY_DSN` (and `VITE_SENTRY_DSN`) until ranks 1-5 are fixed; that is a one-line change and it is a complete kill switch for everything except the metrics stream (rank 12), which needs the DSN too. If Sentry must stay on, ranks 1 and 2 are the minimum and both are one-line init changes. Ranks 6-24 are engineering quality, not incidents.

---

## Findings

### 1. [CRITICAL] sentry_sdk.init ships every stack frame's locals with no scrubber — production DB password, debtor CPF+name, and the LLM API key all ride out on captured exceptions

**What reaches Sentry:** The serialized local variables of every frame in the traceback: the full ODBC string `DRIVER=...;UID=...;PWD=<DB_PASSWORD>;` (reproduced verbatim by a reviewer against this pool_manager), the Anthropic/DeepSeek key bound as `active_key`, the server's own `expected_auth` = `Bearer <API_TOKEN>`, and up to ~10 debtor rows per event with unmasked `cpf_mask`/`cpf_cnpj` and `nome_devedor`/`nome_razao` — none of these names are in the default EventScrubber denylist, and the scrubber is non-recursive so dict rows are untouched.

**Trigger:** Two tiers. Tier 1 (no unhandled exception needed): any `pyodbc.connect` failure — SQL Server restart, network blip, expired login — raises HTTPException(500), which StarletteIntegration auto-captures because its default `failed_request_status_codes` is 500-599; the provider-502 path in dominios/agente/agente.py:562/:665 does the same for `active_key`. Tier 2: any non-HTTPException escaping a route reaches api/middleware.py:108 while a row list is a live local (run_query normalizes DB errors to HTTPException, so this is the narrower window). Live today: DSN set, ENABLE_AGENT_CHAT=true.

**Fix:** One line closes every variant: pass `include_local_variables=False` to `sentry_sdk.init` at core/telemetry/agent_logger.py:20. Belt-and-braces, in order of value: add a `before_send` that deletes `event['exception'][*]['stacktrace']['frames'][*]['vars']` outright (a name denylist is not enough — the PII sits inside nested dicts the default scrubber never descends into); at pool_manager.py:46 inline the connection string into the `pyodbc.connect` call instead of binding it to a name; at agente.py:55 test `getattr(settings, key_name)` instead of binding the key; at dependencias.py:29 build `expected_auth` inline. Do NOT rely on `send_default_pii=False` — it is already the default and does not gate frame locals.

**Locations:**

- `core/telemetry/agent_logger.py:20-25 (the init: no include_local_variables, no before_send, no event_scrubber)`
- `core/database/pool_manager.py:46-53 (conn_str with PWD=...)`
- `core/database/pool_manager.py:59 (pyodbc.connect)`
- `core/database/pool_manager.py:68 (raise HTTPException from exc)`
- `api/routers/agente.py:55-56 (active_key)`
- `api/dependencias.py:29 (expected_auth)`
- `api/routers/dashboard.py:226-228 (raw/rows from QUERY_ACORDOS_HOJE)`
- `api/routers/dashboard.py:93 (rows in _run_dashboard_chart)`
- `dominios/acordos/queries.py:55-56 (DEV.CPF_CNPJ AS cpf_cnpj, DEV.NOME_RAZAO AS nome_razao)`
- `dominios/graficos/queries.py:238-239`
- `dominios/graficos/queries.py:433-434`
- `dominios/graficos/queries.py:489-490`
- `dominios/graficos/queries.py:540-541 (D.CPF_CNPJ AS cpf_mask, D.NOME_RAZAO AS nome_devedor)`
- `core/utils/index_helpers.py:69`
- `core/utils/index_helpers.py:106`
- `api/middleware.py:107-109 (_capture_exception on every request)`
- `core/telemetry/agent_logger.py:52-55 (capture_exception)`

### 2. [HIGH] enable_logs plus the default LoggingIntegration forwards every uvicorn.access line to Sentry — one unsampled log per HTTP request, with client IP, full path and employee full names

**What reaches Sentry:** One structured log per HTTP request whose body is the uvicorn access line and whose attributes include the client IP and the full URL path — reproduced live as `192.168.0.5 - "GET /dashboard/excecoes-detalhe-agente/todos/JOAO%20DA%20SILVA HTTP/1.1" 200`, i.e. a collections agent's real USU_MASTER.NOME leaving the LAN. No debtor identifier appears in any route path (all parameterized routes were enumerated), so this is employee personal data under LGPD, not debtor PII.

**Trigger:** Every request, no error required. LoggingIntegration is in _DEFAULT_INTEGRATIONS, patches logging.Logger.callHandlers at class level (so uvicorn's propagate=False does not exclude it), and its sentry_logs_level default is INFO. Logs are not subject to traces_sample_rate — nothing samples or throttles this. Live today.

**Fix:** Pass an explicit integration in the init: `integrations=[LoggingIntegration(level=logging.WARNING, event_level=None, sentry_logs_level=logging.WARNING)]`, which leaves the ~45 deliberate `_sentry_log` sites as the log source and also closes rank 8 (double events). To silence uvicorn.access specifically, the call in this SDK version is `ignore_logger_for_sentry_logs("uvicorn.access")` — plain `ignore_logger` does NOT suppress Sentry Logs.

> Needs a human decision — changes what is observable in production.

**Locations:**

- `core/telemetry/agent_logger.py:20-25 (no integrations= / disabled_integrations=)`
- `core/telemetry/agent_logger.py:24 (enable_logs=settings.SENTRY_ENABLE_LOGS)`
- `config/settings.py:277 (SENTRY_ENABLE_LOGS defaults true)`
- `main.py:33 (basicConfig level=INFO)`
- `api/routers/dashboard.py:952 (/excecoes-detalhe-agente/{db}/{agente})`
- `api/routers/dashboard.py:805 (/excecoes-detalhe/{db}/{portfolio})`

### 3. [HIGH] One non-ASCII byte in the x-api-key header crashes the auth path out of the middleware and exports the server's real API_TOKEN — unauthenticated, on demand

**What reaches Sentry:** An error event whose require_auth frame vars read `{'api_key': '[Filtered]', 'expected_auth': "'Bearer <real API_TOKEN>'"}` — the neighbouring `api_key` is denylisted, `expected_auth` is not; reproduced end to end by a reviewer.

**Trigger:** `GET /dashboard/anything` with header `X-API-Key: \xe9` while REQUIRE_API_AUTH=true. Starlette decodes headers latin-1, so the byte survives; `hmac.compare_digest` raises TypeError on non-ASCII str, which is not an HTTPException and escapes security_middleware entirely. Caller needs no valid credential. LATENT in the current deployment (.env has REQUIRE_API_AUTH=false) — it goes live on the documented production/Caddy cutover.

**Fix:** Two independent fixes, both cheap: rank 1's `include_local_variables=False` stops the egress; and remove the crash by comparing bytes — `hmac.compare_digest(api_key.encode("utf-8", "ignore"), settings.API_KEY.encode())`, likewise for auth_header — since compare_digest on bytes never raises on non-ASCII. A caller-supplied header must not be able to raise a TypeError out of the auth path.

**Locations:**

- `api/dependencias.py:29-32 (expected_auth bound, then hmac.compare_digest)`
- `api/middleware.py:56-58 (try/except HTTPException only — TypeError is not caught)`
- `core/telemetry/agent_logger.py:20 (frame locals enabled)`

### 4. [MEDIUM] Browser SDK sends employee names in detail-endpoint URLs to Sentry through three unfiltered surfaces: http.client spans, fetch breadcrumbs, and a hand-written logEvent

**What reaches Sentry:** The URL `/dashboard/excecoes-detalhe-agente/<db>/<URL-encoded USU_MASTER.NOME>` — as the `http.client` span name/`http.url` inside a sampled transaction, as a `fetch` breadcrumb attached to any later error event, and (on a fetch failure) as a `path` attribute in Sentry Logs. Employee personal data, no debtor PII.

**Trigger:** Spans/breadcrumbs: every time an operator opens an agent detail panel, no error required (verified in the shipped bundle: traceFetch on, breadcrumb data carries the url). The logEvent half needs a transient fetch failure — LAN blip, proxy or Caddy restart — while that panel is open. Live today: VITE_SENTRY_DSN is set and enableLogs resolves true because VITE_SENTRY_ENABLE_LOGS is absent from agecob-lens/.env.

**Fix:** Add `beforeSendTransaction` and `beforeBreadcrumb` to Sentry.init in analytics.ts that rewrite `*-detalhe-agente/<db>/<name>` to `:agente` on `span.description` / `span.data['http.url']` and `breadcrumb.data.url`; at api.ts:176/186/190 log a parameterized route (`path.replace(/(detalhe-agente|detalhe)\/[^/?]+/, '$1/:id')`) or the endpoint group the way trackApiMetric already does at api.ts:78-79. Structural alternative: move the agent name out of the path into a POST body.

> Needs a human decision — changes what is observable in production.

**Locations:**

- `agecob-lens/src/services/api.ts:734`
- `agecob-lens/src/services/api.ts:749`
- `agecob-lens/src/services/api.ts:764`
- `agecob-lens/src/services/api.ts:636`
- `agecob-lens/src/services/api.ts:651`
- `agecob-lens/src/services/api.ts:702`
- `agecob-lens/src/services/api.ts:717`
- `agecob-lens/src/services/api.ts:176`
- `agecob-lens/src/services/api.ts:186`
- `agecob-lens/src/services/api.ts:190 (logEvent with raw path)`
- `agecob-lens/src/services/analytics.ts:32-48 (no beforeSend / beforeSendTransaction / beforeBreadcrumb)`
- `agecob-lens/src/services/analytics.ts:59 (Sentry.logger[level])`
- `agecob-lens/src/hooks/useAgenteDetalheViewModel.ts:62`

### 5. [MEDIUM] The /agente/chat JSON request body is attached to every error event — send_default_pii does not gate request bodies

**What reaches Sentry:** The parsed chat JSON — up to 20 operator messages of 4000 chars each, i.e. whatever an analyst typed plus prior assistant turns, which may include a pasted CPF or debtor name — attached as `request.data`, bounded only by the default `max_request_body_size="medium"` (10 KB).

**Trigger:** A non-HTTPException escaping run_agent during POST /agente/chat. Confirmed mechanism: StarletteRequestExtractor gates only cookies on should_send_default_pii and then attaches `request_info['data'] = json` unconditionally, installed as an isolation-scope processor before the handler runs; FastAPI routes even a sync endpoint through the async wrapper, so the body branch applies. Live today: ENABLE_AGENT_CHAT=true in .env. (The metas/upload multipart route is NOT exposed — UploadFile values are stripped and a PDF exceeds the 10 KB bound.)

**Fix:** Add `max_request_body_size="never"` to sentry_sdk.init at core/telemetry/agent_logger.py:20. Nothing in this app needs request bodies in Sentry — run_id already correlates an event with the server-side NDJSON log.

**Locations:**

- `core/telemetry/agent_logger.py:20 (no max_request_body_size)`
- `core/telemetry/agent_logger.py:55 (capture_exception)`
- `api/routers/agente.py:46 (POST /chat)`
- `api/routers/agente.py:27-28 (messages: List[AgentChatMessage])`
- `api/routers/agente.py:81-88`
- `api/middleware.py:108`

### 6. [MEDIUM] A malformed SENTRY_DSN raises BadDsn at import time and the API never starts — telemetry config can take down the thing it observes

**What reaches Sentry:** Nothing — this is the inverse defect: the Sentry setup path aborts the process. Reproduced on the installed SDK: `dsn='o1.ingest.sentry.io/2'` raises BadDsn("Unsupported scheme ''"), `dsn='https://abc@o1.ingest.sentry.io'` raises BadDsn("Invalid project in DSN").

**Trigger:** Process start, every worker, whenever SENTRY_DSN is non-empty and malformed — a truncated paste, a DSN missing the trailing project id or the scheme. The traceback escapes `import main`, uvicorn never builds the app, and NSSM restart-loops AgecobAPI with /health/* included. Quote-stripping at settings.py:275 is not a mitigation.

**Fix:** Wrap the init in try/except Exception at core/telemetry/agent_logger.py:20-25, log the failure through the stdlib logger, and leave `_SENTRY_INITIALIZED` False so every _sentry_log/_sentry_metric/_capture_exception short-circuits on its existing guard. Detected within seconds by the README's post-deploy `curl /health/db` smoke test, which is why this is medium and not high.

**Locations:**

- `main.py:37 (_init_sentry() at module scope, no try/except)`
- `core/telemetry/agent_logger.py:14-16 (guard covers only the empty-DSN case)`
- `core/telemetry/agent_logger.py:20-25`
- `config/settings.py:275 (strip only, no DSN validation)`

### 7. [MEDIUM] Deprecated push_scope and start_span(description=) under an unpinned sentry-sdk that every deploy reinstalls — a v3 release 500s three dashboard routes even with Sentry switched off

**What reaches Sentry:** Nothing today — both calls work and emit DeprecationWarnings (verified verbatim under -W error). After a major bump, `push_scope` becomes an AttributeError raised inside the middleware's except block (replacing the original 500), and `description=` becomes a TypeError on the normal path of /dashboard/produtividade, /comparacao-agentes and /detalhamento-agentes.

**Trigger:** The first clean rebuild or new machine provisioned after sentry-sdk 3.0 ships. An existing server will not drift (`pip install` runs without -U). Note start_span sits on the normal path with no init guard, so those three routes would 500 even with SENTRY_DSN empty.

**Fix:** Cap the dependency now — `sentry-sdk[fastapi]>=2.44.0,<3` in requirements.txt:14 — and migrate both sites: `with sentry_sdk.new_scope() as scope:` at agent_logger.py:52, and `name=` instead of `description=` at dashboard.py:148/156/183/188.

**Locations:**

- `core/telemetry/agent_logger.py:52 (sentry_sdk.push_scope)`
- `api/routers/dashboard.py:148`
- `api/routers/dashboard.py:156`
- `api/routers/dashboard.py:183`
- `api/routers/dashboard.py:188 (start_span(description=...))`
- `api/routers/dashboard.py:9 (sentry_sdk imported unconditionally, no _SENTRY_INITIALIZED guard on start_span)`
- `requirements.txt:14 (sentry-sdk[fastapi]>=2.44.0, no ceiling)`
- `atualizar.bat:13 (pip install -r requirements.txt on every deploy)`

### 8. [MEDIUM] Every unhandled exception produces two uncorrelated Sentry error events, only one carrying run_id

**What reaches Sentry:** Two error events for one incident: the middleware's `capture_exception` (grouped by exception stack, tagged run_id), plus a second event the default LoggingIntegration manufactures from `logger.exception` at event_level=ERROR (grouped by the log message template, no run_id) — reproduced with this repo's exact init options.

**Trigger:** Any exception escaping the route layer. The re-raise reaches ServerErrorMiddleware, which sits outside the user middlewares, so both handlers always run.

**Fix:** Set `event_level=None` on an explicitly-passed LoggingIntegration (same edit as rank 2), leaving `_capture_exception` as the single source of exception events. Alternative: drop the middleware capture and re-add run_id as scope data in the handler.

**Locations:**

- `api/middleware.py:107-109 (_capture_exception then re-raise)`
- `core/telemetry/agent_logger.py:55`
- `main.py:71 (@app.exception_handler(Exception))`
- `main.py:81 (logger.exception)`

### 9. [MEDIUM] A validation failure that returns HTTP 500 is reported only as a Sentry warning and never becomes an error event

**What reaches Sentry:** Exactly one warning-level structured log (`"Campos faltando na resposta de produtividade."` with missing_fields) and zero error events, for a hard 500 that breaks the productivity page.

**Trigger:** A field in settings.PRODUCTIVITY_REQUIRED_FIELDS goes missing — schema drift, or a query change dropping a column. The HTTPException is converted to a response by Starlette's ExceptionMiddleware (inside security_middleware), so api/middleware.py:107 never sees it, and `sentry_sdk.logger.warning` produces no event regardless of LoggingIntegration.

**Fix:** Change the level to "error" at validation.py:62, or call `_capture_exception` on the HTTPException before raising so the 500 produces a real error event.

**Locations:**

- `core/utils/validation.py:62-63`
- `main.py:71 (only @app.exception_handler(Exception) is registered — no HTTPException handler)`

### 10. [LOW] Raw request path is a Sentry log attribute on every auth and rate-limit rejection — unbounded cardinality, attacker-controlled text, employee names under load

**What reaches Sentry:** One warning log per rejected request whose `path` attribute is the raw, untemplated path — an agent name or portfolio string on the detail routes, or arbitrary caller-supplied text from a scanner, with no dedup, sampling or throttle on the very path that exists to shed load.

**Trigger:** Line 84 fires on every 429 and is live now (rate_limit_dashboard is not gated on REQUIRE_API_AUTH). Line 70 fires on every 401/403/503 from require_auth or ensure_validated_execution and is latent while REQUIRE_API_AUTH=false. Low because rank 2 already emits one log per *successful* request, which strictly dominates this volume, and traces at 1.0 already ship the full URL anyway.

**Fix:** Log a bounded value — the matched route template, or the first two path segments (`/dashboard/excecoes-detalhe-agente`) — at both lines, and move the per-request count into a counter metric rather than a log.

**Locations:**

- `api/middleware.py:70 ("Auth rejeitada.", path=path, status=...)`
- `api/middleware.py:84 ("Rate limit atingido.", path=path)`
- `api/middleware.py:24-25 (raw_path from request.scope)`
- `api/dependencias.py:108-113 (normalize_api_path only strips /api)`
- `config/settings.py:267-268 (75 req / 60 s)`

### 11. [LOW] Production bundle was built with tracesSampleRate 1.0, ten times the documented default — the multiplier under rank 4

**What reaches Sentry:** 100% of pageload and navigation transactions, each carrying every http.client span and its full URL — no user data of its own, but it is what turns rank 4 from an occasional sample into continuous egress. Backend SENTRY_TRACES_SAMPLE_RATE=1.0 in .env has the same effect server-side.

**Trigger:** Every page load and in-app navigation. Vite inlines VITE_ vars at build time, so this is baked into the artifact, not a runtime toggle. .env and dist/ are both gitignored, so the working tree proves a local build at 1.0, not necessarily what C:\agecob shipped — check production's copy separately.

**Fix:** Set VITE_SENTRY_TRACES_SAMPLE_RATE=0.1 (and SENTRY_TRACES_SAMPLE_RATE=0.1 in the backend .env) on the build machine and on C:\agecob, then rebuild via atualizar.bat. Do NOT blank the var — see rank 23.

> Needs a human decision — changes what is observable in production.

**Locations:**

- `agecob-lens/.env:3 (VITE_SENTRY_TRACES_SAMPLE_RATE=1.0)`
- `agecob-lens/src/services/analytics.ts:12`
- `agecob-lens/src/services/analytics.ts:45`
- `agecob-lens/dist/assets/index-Bs8kRAd5.js (Ht=+"1.0" feeding tracesSampleRate:Ht)`

### 12. [LOW] DB error logs send the raw ODBC prose (which names the SQL login) but drop the sqlstate/timeout classification the code already computed

**What reaches Sentry:** The full pyodbc message as an unscrubbed structured-log attribute named `error` — verified to contain the ODBC driver build and SQLSTATE, and for SQLSTATE 28000 the text `Login failed for user '<DB_USER>'`. Verified separately that structured-log attributes bypass the EventScrubber entirely. It does NOT contain the connection string or password. Meanwhile a slow-query 504 and a broken-query 500 arrive as the same message with the same attributes, because `sqlstate` and `timed_out` — computed two lines above and used to pick the status code — are never passed.

**Trigger:** Any pyodbc.Error. Independent of frame locals, so rank 1's fix does not close it.

**Fix:** At pool_manager.py:67 send the classification instead of the prose: `sqlstate=str(exc.args[0]) if exc.args else ""`. At query_executor.py:85 add the values that already exist: `sqlstate=sqlstate, timed_out=timed_out`. The full text stays in the local _agent_ndjson file, which never leaves the LAN.

**Locations:**

- `core/database/pool_manager.py:67 (error=str(exc))`
- `core/database/query_executor.py:85 (error=str(exc), sqlstate and timed_out computed at :71-72 and not passed)`
- `core/database/query_executor.py:104`
- `api/routers/admin.py:40`
- `api/routers/admin.py:92`

### 13. [LOW] The metric stream is neither gated by SENTRY_ENABLE_LOGS nor sampled — _sentry_metric fires on every query, connection and cache lookup at 100%

**What reaches Sentry:** Duration distributions and cache counters with internal attributes only (query context labels, database names, cache key prefixes) — no PII — but at 100%, since `has_metrics_enabled` is `options.get("enable_metrics", True)` and there is no sampling check anywhere in the metric path. Reproduced: with enable_logs=False, metric envelopes still shipped.

**Trigger:** Every request. Consequence: an operator who sets SENTRY_ENABLE_LOGS=false believing telemetry is off still ships metrics; only blanking SENTRY_DSN is a complete kill switch.

**Fix:** Pass `enable_metrics=settings.SENTRY_ENABLE_LOGS` in the init, or add the same flag check to _sentry_metric at agent_logger.py:40. Volume itself (tens of metrics/minute on this LAN) is acceptable — decide and document it rather than sampling.

> Needs a human decision — changes what is observable in production.

**Locations:**

- `core/telemetry/agent_logger.py:38-44 (guards only on _SENTRY_INITIALIZED; init never passes enable_metrics)`
- `core/database/query_executor.py:57 (db.query_duration_ms per query)`
- `core/database/pool_manager.py:109-116 (db.pool_acquire_ms per get_connection)`
- `core/cache/cache_manager.py:61`
- `core/cache/cache_manager.py:67`
- `core/cache/cache_manager.py:78`
- `core/cache/cache_manager.py:93 (cache.hit/miss per lookup)`
- `api/routers/dashboard.py:212`

### 14. [LOW] The three Sentry helpers have no exception isolation, so a telemetry fault can replace the real error or permanently kill the ETL worker

**What reaches Sentry:** Nothing — this is the reverse channel. If a helper raises: in the middleware it replaces the caller's exception so api.log records the telemetry failure instead of the real 500; in the ETL it escapes run() and loop(), ending the unsupervised daemon thread so the efetividade store freezes at stale values for the process lifetime; in pool_manager it drops a live SQL Server session with no release.

**Trigger:** Not reachable today — reviewers could not make sentry_sdk.logger, metrics or capture_exception raise on 2.66.1, and all three short-circuit when _SENTRY_INITIALIZED is False. It becomes live under rank 7's v3 scenario. Report as hardening, not as a present failure.

**Fix:** One shared guard fixes all ~45 call sites: wrap the bodies of _sentry_log, _sentry_metric and the push_scope block in try/except Exception. Independently (and worth doing regardless): make the ETL worker survive its own body — `while True: try: self.run() except Exception: log; time.sleep(TTL)` — and move the pool_manager metric inside the existing `try:` at :119 so the finally always releases the connection.

**Locations:**

- `core/telemetry/agent_logger.py:29-35 (_sentry_log, bare)`
- `core/telemetry/agent_logger.py:38-44 (_sentry_metric, bare)`
- `core/telemetry/agent_logger.py:52-55 (push_scope block, bare — while _agent_ndjson at :82-87 IS guarded)`
- `api/middleware.py:105-109 (raise on 109 only reached if _capture_exception returns)`
- `dominios/efetividade/etl.py:42 (_sentry_log inside the ETL's own except)`
- `dominios/efetividade/etl.py:63-67 (loop() calls self.run() with no try/except)`
- `core/database/pool_manager.py:109-116 (metric sits between acquire and the try/finally that releases the connection)`

### 15. [LOW] Every DB failure is logged to Sentry twice — once by run_query and again by its caller — with a 27x fan-out in the efetividade ETL

**What reaches Sentry:** Two error logs describing one failure. With the database down, one ETL cycle emits 27 caller logs plus 27 from query_executor = 54 error logs per hour, indefinitely, with no backoff or suppression; the health variant is bounded by SPA poll rate (120 s per tab, 20 s in TV mode).

**Trigger:** Any DB failure. Distorts error-rate charts and double-counts incidents; the volume itself is negligible next to rank 2.

**Fix:** Drop the caller-side `_sentry_log` where run_query already logged (etl.py:42, health.py:98), or add a suppress flag to run_query for callers that intend to log with more context.

**Locations:**

- `core/database/query_executor.py:85 (run_query logs at error before raising)`
- `dominios/efetividade/etl.py:42`
- `dominios/efetividade/queries.py:149-159 (_EF_BUILDER_MAP, 9 entries)`
- `dominios/efetividade/queries.py:15 (_EF_DB_VARIANTS, 3)`
- `api/routers/health.py:98`
- `config/settings.py:323 (EFETIVIDADE_ETL_TTL_SECONDS=3600)`

### 16. [LOW] Coalesced cache followers are counted as cache.hit before they wait, inflating the hit ratio exactly during a stall

**What reaches Sentry:** A rising `cache.hit` count for requests that did not hit the cache — and that stay counted when the wait times out and the request 504s. The 504 itself emits no log and no metric, and as an HTTPException it never reaches the middleware's capture.

**Trigger:** Any request arriving while another computes the same key. Note the +5 s margin at settings.py:315-316 is deliberate so the leader's own run_query times out first and logs at error — so the common stalled-leader case is not actually silent; a truly silent 504 needs a leader stalled by something other than the query.

**Fix:** Emit a distinct `cache.coalesced` counter instead of cache.hit, move it after a successful wait, and add `_sentry_log("error", ...)` on the timeout at :83 and the re-raise at :91.

**Locations:**

- `core/cache/cache_manager.py:77-78 (cache.hit on the not-is_leader branch)`
- `core/cache/cache_manager.py:82-86 (504 on wait timeout, no log, no metric)`
- `core/cache/cache_manager.py:91 (re-raised leader error, unlogged)`
- `config/settings.py:317 (CACHE_LEADER_WAIT_TIMEOUT = DB_QUERY_TIMEOUT_SECONDS + 5 = 65 s)`

### 17. [LOW] run_id is set as a Sentry tag — one unique, partly client-controlled value per captured exception

**What reaches Sentry:** A tag whose value never repeats and can be supplied by the caller via header — the textbook unbounded-tag-cardinality anti-pattern, which bloats the tag index and makes tag-based search and grouping useless.

**Trigger:** Only on exceptions that escape the route layer, so index growth scales with unhandled-error count. The regex blocks injection, so this is a cardinality issue, not a security one.

**Fix:** Replace `scope.set_tag("run_id", run_id)` with `scope.set_context("request", {"run_id": run_id})`. Reserve set_tag for low-cardinality dimensions.

**Locations:**

- `core/telemetry/agent_logger.py:54 (scope.set_tag("run_id", run_id))`
- `api/dependencias.py:94 (_RUN_ID_RE, up to 64 chars)`
- `api/dependencias.py:97-106 (accepts x-run-id / x-debug-run-id / x-request-id)`
- `api/middleware.py:108`

### 18. [LOW] Span description embeds the user-chosen date range, giving one span name per date pair

**What reaches Sentry:** A span named `produtividade|unificado|<db>|<dateFrom>|<dateTo>`, so span aggregation fragments into one bucket per date range. The three sibling spans at :148/:156/:188 do it correctly with the low-cardinality `context`.

**Trigger:** Every request to the productivity endpoints; sampled at traces_sample_rate, which is 1.0 in this deployment. Real-world cardinality is limited by the SPA's bounded period presets.

**Fix:** Use `description=context` like the neighbouring spans and move the full key to `span.set_data("cache_key", cache_key)`.

**Locations:**

- `api/routers/dashboard.py:181-183 (start_span(op="cache.get_or_compute", description=cache_key))`
- `api/routers/dashboard.py:105-132 (_parse_period validates format, not range)`

### 19. [LOW] cache_key_prefix collapses ~20 chart endpoints into one bucket and six agent query families into another

**What reaches Sentry:** cache.hit/cache.miss counters whose only attribute is the literal `chart` or `agente` — the discriminating `context` sits in segment 2 of the key and is thrown away by the split, so the metric cannot answer which endpoint is thrashing the cache, the one question it exists to answer.

**Trigger:** Every cache lookup.

**Fix:** Take two segments: `"|".join(key.split("|", 3)[:2])`, which keeps `chart|dashboard/excecoes-por-portfolio` distinguishable while staying bounded by endpoint count.

**Locations:**

- `core/cache/cache_manager.py:58 (prefix = key.split("|", 1)[0])`
- `api/routers/dashboard.py:92 (chart|{context}|...)`
- `dominios/agente/agentes.py:122`
- `dominios/agente/cruzamento.py:155`
- `dominios/agente/cruzamento.py:216`
- `dominios/agente/fases.py:171`
- `dominios/agente/kpi_historico.py:119`
- `dominios/agente/risco.py:134`

### 20. [LOW] The health routes report a total database outage at warning while the same condition is error everywhere else

**What reaches Sentry:** One condition at two severities depending on which code path noticed it — the authoritative one (the health endpoint) being the lower. Cosmetic in practice: _sonda() calls run_query, which already emits its error-level log during the same poll, so error-keyed alerting does still fire.

**Trigger:** Each poll of /health/db, /health/ready or /health/db/{name} while a database is unreachable.

**Fix:** Raise the three health sites to "error", or downgrade pool_manager.py:67 — but pick one level for the condition.

> Needs a human decision — changes what is observable in production.

**Locations:**

- `api/routers/health.py:53 ("Readiness degradado.", 503)`
- `api/routers/health.py:75 ("Falha no healthcheck do banco.", 503)`
- `api/routers/health.py:98`
- `core/database/pool_manager.py:67 (error)`
- `core/database/query_executor.py:85 (error)`

### 21. [LOW] A misconfiguration that breaks every authenticated request is reported as a warning called "Auth rejeitada."

**What reaches Sentry:** A burst of ordinary-looking auth warnings, distinguishable from genuine 401s only by reading the `status` attribute (500 vs 401) — no error event, no alert, for a total outage of every /dashboard/*, /efetividade/*, /health/*, /admin/* and /agente/* request.

**Trigger:** Every request to a protected prefix while REQUIRE_API_AUTH=true and API_KEY/API_TOKEN are unset. No PII involved; operators would notice the dead dashboard within seconds regardless.

**Fix:** Branch on exc.status_code at api/middleware.py:60-71: log 5xx from require_auth/ensure_validated_execution at level "error" with a message that names the misconfiguration, keeping "warning"/"Auth rejeitada." for 401/403.

**Locations:**

- `api/dependencias.py:24-26 (HTTPException 500 for REQUIRE_API_AUTH=true with empty API_KEY/API_TOKEN)`
- `api/middleware.py:60-71 (one branch for 401 and 500 alike)`

### 22. [LOW] No release is tagged on any event, and APP_ENV is undocumented in the README config table

**What reaches Sentry:** Every event and transaction with no release attribution, so Sentry cannot tie an error to the commit that produced it or mark a regression fixed in a release. The environment half is fine in THIS deployment — .env line 1 is APP_ENV=production — but a prod .env built from .env.example per the documented procedure would tag everything `local`.

**Trigger:** Every event; purely an observability and documentation gap, nothing leaks or breaks.

**Fix:** Pass `release=` in the init (short git SHA captured by atualizar.bat and exported as SENTRY_RELEASE), and add an APP_ENV row to the README config table next to the SENTRY_* rows.

**Locations:**

- `core/telemetry/agent_logger.py:22 (environment=settings.APP_ENV; no release= anywhere)`
- `config/settings.py:29 (APP_ENV defaults to "local")`
- `.env.example:7 (APP_ENV=local)`
- `README.md:134-136 (SENTRY_* rows, no APP_ENV row)`
- `atualizar.bat (git pull, commit known at deploy time, never sent)`

### 23. [LOW] SENTRY_TRACES_SAMPLE_RATE is parsed with a bare float() — no try/except, no clamp — so a decimal comma stops the API from booting

**What reaches Sentry:** Nothing. `float("0,1")` — plausible on this pt-BR system with a hand-edited .env — raises ValueError while importing config.settings and the service does not start, the same blast radius as rank 6 from a different knob. No clamp either: `100`, read as a percentage, is accepted and traces everything.

**Trigger:** Startup, only when the variable is set to something float() cannot parse. Fails loudly at deploy.

**Fix:** Parse defensively and clamp, matching the neighbours: try/except ValueError falling back to 0.1 (optionally `.replace(",", ".")` first), then `min(max(rate, 0.0), 1.0)`.

**Locations:**

- `config/settings.py:276`
- `main.py:5 (imports config.settings before anything else exists)`
- `config/settings.py:271-277 (every neighbouring flag uses a non-raising string comparison)`

### 24. [LOW] Frontend sample-rate default is unreachable for a blank env var — Number("") is 0, which silently disables tracing

**What reaches Sentry:** Nothing, silently — `??` substitutes only for null/undefined, and Vite exposes a declared-but-blank var as "", which is exactly this repo's convention for "off" (.env.example ships `VITE_SENTRY_DSN=` / `VITE_POSTHOG_KEY=` with 'vazio desliga'). A typo yields NaN, which the SDK also rejects. Nobody notices tracing is dead until they go looking for a transaction.

**Trigger:** Startup only, and latent today (the live .env sets 1.0). It is precisely the trap awaiting whoever fixes rank 11 by blanking the variable instead of setting 0.1.

**Fix:** `const raw = (import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? "").trim(); const parsed = Number(raw); const SENTRY_TRACES_SAMPLE_RATE = raw !== "" && Number.isFinite(parsed) ? parsed : 0.1;`

**Locations:**

- `agecob-lens/src/services/analytics.ts:12`
- `agecob-lens/src/services/analytics.ts:45`
- `agecob-lens/src/main.tsx:6`
- `agecob-lens/src/services/analytics.ts:8`
- `agecob-lens/src/services/analytics.ts:13 (siblings that DO normalize defensively)`

### 25. [LOW] Counters are sent with the literal string unit "none" instead of no unit

**What reaches Sentry:** The four dimensionless cache counters carrying a unit literally named "none" — the SDK's sentinel for no unit is `None`, and _capture_metric stores the string straight into the payload with no normalization, so cache.hit renders with a bogus unit instead of as a plain count.

**Trigger:** Every cache lookup. Cosmetic.

**Fix:** Change the helper default to `unit: Optional[str] = None`. The three explicit `unit="millisecond"` callers are unaffected.

**Locations:**

- `core/telemetry/agent_logger.py:38 (unit: str = "none")`
- `core/telemetry/agent_logger.py:44`
- `core/cache/cache_manager.py:61`
- `core/cache/cache_manager.py:67`
- `core/cache/cache_manager.py:78`
- `core/cache/cache_manager.py:93`
