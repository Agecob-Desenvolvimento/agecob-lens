# Segurança

[← index](index.md)

## Middlewares (ordem)

### 1. `api_prefix_middleware`
Normaliza paths: `/api/dashboard/...` → `/dashboard/...`

### 2. `security_middleware`
Executa em todas as requisições não-estáticas.

**Auth (`_require_auth`):**
- `REQUIRE_API_AUTH=false` → bypass total
- Verifica `X-API-Key` contra `API_KEY` env
- Verifica `Authorization: Bearer <token>` contra `API_TOKEN` env
- Falha → 401 Unauthorized

**Rate Limit (`_rate_limit_dashboard`):**
- Bucket por `IP:API_KEY`
- Limite: **75 requisições / 60 segundos**
- Excedeu → `429 Too Many Requests` + header `Retry-After`

**Logging:**
- NDJSON por requisição (se `ENABLE_AGENT_TELEMETRY=true`)
- Função: `_agent_ndjson(hypothesis_id, location, message, data, run_id)`
- Worker de limpeza de log em thread background

### 3. CORSMiddleware
- Origins via `CORS_ALLOW_ORIGINS` (CSV)
- Default: `localhost:5173`
- Methods: `*`
- Credentials: configurável via `CORS_ALLOW_CREDENTIALS`

---

## Validação de Input

```python
validate_database(name)            # só aceita ALLOWED_DATABASES
validate_database_or_todos(name)   # aceita ALLOWED_DATABASES + "todos"
```

Qualquer outro valor → `422 Unprocessable Entity`.

---

## Rastreamento de Requisições

```python
_extract_run_id(request) → str
```

- Lê header `X-Run-Id` se presente
- Gera `uuid4()` se ausente
- `run_id` propagado por toda a cadeia de logging

---

## Frontend

- API key / token enviados em headers (não em URL)
- `VITE_API_KEY` e `VITE_API_TOKEN` via variáveis Vite (build-time)
- Sem armazenamento de credenciais em localStorage

---

## Superfície de Ataque

| Vetor | Mitigação |
|-------|-----------|
| SQL Injection | pyodbc parametrizado; nomes de banco validados contra allowlist |
| Acesso não autorizado | Auth middleware + API_KEY/Bearer |
| DoS / scraping | Rate limit 75 req/60s por IP:chave |
| CORS | Origins explícitas via env |
| Path traversal | SPA fallback serve apenas `index.html` |
| Dados sensíveis em URL | Params sensíveis via headers |
