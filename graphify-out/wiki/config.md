# Configuração

[← index](index.md)

## Ambientes

| APP_ENV | Propósito | Backend | Frontend |
|---------|-----------|---------|----------|
| `local` | Teste pessoal na máquina | `127.0.0.1:8000` | `localhost:5173` |
| `dev` | Staging / time | `0.0.0.0:8000` | `localhost:5173` |
| `production` | Dashboard ao vivo | servidor prod | domínio prod |

### Como funciona o carregamento

`config/settings.py` lê `APP_ENV` do ambiente (default `"local"`), carrega `.env.{APP_ENV}` primeiro, depois `.env` como fallback. Vars já definidas não são sobrescritas.

```python
APP_ENV = os.getenv("APP_ENV", "local")
_load_env_file(f".env.{APP_ENV}")   # específico do env (prioridade)
_load_env_file(".env")              # fallback
```

---

## Arquivos de Ambiente

### Backend (raiz do projeto)

| Arquivo | Rastreado | Uso |
|---------|-----------|-----|
| `.env.example` | ✓ git | Template — sem segredos |
| `.env` | ✗ git | Fallback geral |
| `.env.local` | ✗ git | Env local (127.0.0.1) |
| `.env.dev` | ✗ git | Staging |
| `.env.production` | ✗ git | Produção |

### Frontend (agecob-lens/)

| Arquivo | Rastreado | Uso |
|---------|-----------|-----|
| `.env.example` | ✓ git | Template |
| `.env.local` | ✗ git | Sempre carregado pelo Vite (override local) |
| `.env.dev` | ✗ git | Carregado com `--mode dev` |
| `.env.production` | ✗ git | Carregado com `--mode production` |

> **Nota Vite:** `"local"` é nome de modo reservado pelo Vite. Usar `vite` sem `--mode` para local test (carrega `.env.local` automaticamente).

---

## Variáveis de Ambiente

### Backend

| Variável | Padrão | Obrigatório | Descrição |
|----------|--------|-------------|-----------|
| `APP_ENV` | `local` | não | Qual env carregar |
| `DB_DRIVER` | `ODBC Driver 17 for SQL Server` | não | Driver ODBC |
| `DB_SERVER` | — | **sim** | Host SQL Server |
| `DB_USER` | — | **sim** | Usuário SQL |
| `DB_PASSWORD` | — | **sim** | Senha SQL |
| `BACKEND_HOST` | `0.0.0.0` | não | Host uvicorn (usado nos scripts .bat) |
| `BACKEND_PORT` | `8000` | não | Porta uvicorn |
| `CORS_ALLOW_ORIGINS` | `localhost:5173` | não | CSV de origins |
| `CORS_ALLOW_CREDENTIALS` | `false` | não | |
| `API_KEY` | — | não | Header `X-API-Key` |
| `API_TOKEN` | — | não | Bearer token |
| `REQUIRE_API_AUTH` | `false` | não | Ativa auth |
| `ENABLE_VALIDATED_ROUTES` | `true` | não | Valida campos de produtividade |
| `ENABLE_AGENT_TELEMETRY` | `false` | não | Log NDJSON de telemetria |
| `ENABLE_INDEX_ADMIN` | `false` | não | Ativa endpoints /admin/indexes/* |

### Frontend (Vite)

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `VITE_API_BASE_URL` | origem do browser | Base URL da API |
| `VITE_API_KEY` | — | Header `X-API-Key` |
| `VITE_API_TOKEN` | — | Bearer token |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:8000` | Proxy no dev server (rota `/api`) |
| `VITE_ENABLE_ANALYTICS` | `false` | Ativa PostHog |
| `VITE_POSTHOG_KEY` | — | API key PostHog |
| `VITE_POSTHOG_HOST` | — | Host PostHog |

---

## Scripts de Inicialização

### Windows (.bat)

```
run_local.bat   → APP_ENV=local, backend 127.0.0.1:8000, frontend dev:local
run_dev.bat     → APP_ENV=dev,   backend 0.0.0.0:8000,   frontend dev:staging
```

Ambos usam `Python38` explicitamente (`Python36` no PATH não tem uvicorn).

### npm (agecob-lens/package.json)

| Script | Comando | Env carregado |
|--------|---------|---------------|
| `npm run dev` | `vite` | `.env` + `.env.local` |
| `npm run dev:local` | `vite` | `.env` + `.env.local` |
| `npm run dev:staging` | `vite --mode dev` | `.env` + `.env.local` + `.env.dev` |
| `npm run build` | `vite build --mode production` | `.env.production` |
| `npm run build:dev` | `vite build --mode dev` | `.env.dev` |

---

## vite.config.ts

```typescript
server: {
  host: "0.0.0.0",
  port: 5173,
  proxy: {
    "/api": VITE_API_PROXY_TARGET  // default: http://127.0.0.1:8000
  }
}
```

> O proxy cobre apenas rotas `/api/*`. A `api.ts` chama `/dashboard/*`, `/health/*`, `/efetividade/*` diretamente — o proxy **não** é usado pelo dashboard.

---

## tailwind.config.ts

- Dark mode: `class`
- Cores via CSS variables: `--border`, `--primary`, `--sidebar-*`, etc.
- Keyframes: `accordion-up`, `accordion-down`
- Plugins: `tailwindcss-animate`, `@tailwindcss/typography`

---

## tsconfig.json

```json
{
  "target": "ES2020",
  "module": "ESNext",
  "lib": ["ES2020", "DOM", "DOM.Iterable"],
  "moduleResolution": "bundler",
  "paths": { "@/*": ["./src/*"] }
}
```
