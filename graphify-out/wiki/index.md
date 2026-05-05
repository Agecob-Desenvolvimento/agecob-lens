# dash-relatorio — Knowledge Graph

> Gerado em 2026-04-30. Atualizado em 2026-05-05 (docs/ adicionado). Entry point para navegação do projeto.

## Visão Geral

Aplicação fullstack de dashboard de cobrança. Backend FastAPI (Python) + Frontend React/TypeScript. Conecta a SQL Server via pyodbc, expõe ~20 endpoints REST, serve SPA estático em produção.

```
SQL Server (COBwebRCBAUTOS / COBwebRCBCONSUMER)
    ↓ pyodbc
FastAPI (main.py)
    ↓ REST JSON
React SPA (agecob-lens/src/)
    ↓ Browser
```

---

## Páginas deste Wiki

| Página | Conteúdo |
|--------|----------|
| [backend.md](backend.md) | Rotas FastAPI, funções, middlewares, queries SQL |
| [frontend.md](frontend.md) | Páginas React, componentes, hooks, serviços |
| [types.md](types.md) | Tipos TypeScript e contratos de API |
| [dependencies.md](dependencies.md) | requirements.txt, package.json |
| [config.md](config.md) | Variáveis de ambiente, vite.config, tailwind |
| [flows.md](flows.md) | Fluxos de dados end-to-end |
| [security.md](security.md) | Auth, rate limit, CORS, middlewares |
| [dia-26-maio.md](dia-26-maio.md) | Sessão 26/05: regras canônicas de efetividade, auditoria de métricas, refatoração por domínios |
| [docs.md](docs.md) | Toda a documentação em `agecob-lens/docs/`: regras de negócio, ADRs, KPIs, padrões SQL, changelog, diários |

---

## Estrutura de Arquivos

```
dash relatorio/
├── main.py                        ← Backend principal FastAPI
├── requirements.txt               ← Python deps
├── run_local.bat                  ← Inicia env local (APP_ENV=local, Python38)
├── run_dev.bat                    ← Inicia env dev   (APP_ENV=dev,   Python38)
├── .env                           ← Fallback geral (não commitado)
├── .env.local                     ← Env local: DB 192.168.0.20, host 127.0.0.1
├── .env.dev                       ← Env staging (não commitado)
├── .env.production                ← Env produção (não commitado)
├── .env.example                   ← Template commitado (sem segredos)
├── config/
│   └── settings.py                ← Carrega .env.{APP_ENV} + fallback .env
├── api/
│   ├── routers/                   ← dashboard.py, efetividade.py, health.py, admin.py
│   ├── static.py                  ← monta /assets e SPA fallback
│   ├── dependencias.py
│   └── middleware.py
├── core/
│   ├── database/                  ← pool_manager.py, query_executor.py
│   ├── cache/                     ← cache_manager.py
│   ├── telemetry/                 ← agent_logger.py
│   └── utils/                     ← sql_helpers, pagination, validation, response_envelope
├── dominios/
│   ├── acordos/                   ← queries.py
│   ├── produtividade/             ← queries.py, servico.py
│   ├── efetividade/               ← queries.py, etl.py, servico.py
│   └── graficos/                  ← queries.py
├── scripts/
│   └── calcular_volume_dados_dia.py
└── agecob-lens/                   ← Frontend React
    ├── package.json               ← scripts: dev, dev:local, dev:staging, build
    ├── vite.config.ts
    ├── .env.local                 ← VITE_API_BASE_URL=http://127.0.0.1:8000
    ├── .env.dev                   ← VITE_API_BASE_URL=https://dev-api...
    ├── .env.production            ← VITE_API_BASE_URL=https://api...
    ├── .env.example               ← Template commitado
    ├── src/
    │   ├── main.tsx               ← Entry point React
    │   ├── App.tsx                ← Router + Providers
    │   ├── pages/                 ← 7 páginas
    │   ├── components/            ← UI + charts + executive
    │   ├── services/              ← api.ts, analytics.ts
    │   ├── hooks/                 ← useProdutividadeData, etc.
    │   ├── lib/                   ← metrics.ts, insightEngine.ts
    │   ├── config/                ← api.ts, loadPriorities.ts
    │   └── types/                 ← executive.ts
    └── dist/                      ← Build output (servido pelo FastAPI em prod)
```

---

## Bancos de Dados

| Constante | Banco SQL Server |
|-----------|-----------------|
| `COBwebRCBAUTOS` | Carteira AUTOS |
| `COBwebRCBCONSUMER` | Carteira CONSUMER |

Ambos aceitam o parâmetro `db=todos` em vários endpoints, que agrega os dois via `UNION ALL`.

---

## Rotas Resumidas

```
GET /health/db/{database_name}
GET /dashboard/acordos-hoje
GET /dashboard/acordos-hoje/todos
GET /dashboard/acordos-hoje/{database_name}
GET /dashboard/acordos-hoje-agente/{db}
GET /dashboard/produtividade-hoje/{database_name}
GET /dashboard/status-carga/{db}
GET /dashboard/comparacao-agentes/{db}
GET /dashboard/detalhamento-agentes/{database_name}
GET /dashboard/produtividade/{database_name}
GET /dashboard/primeira-parcela-dia/{db}
GET /dashboard/excecoes-por-portfolio/{db}
GET /dashboard/excecoes-por-agente/{db}
GET /dashboard/acordos-por-portfolio/{db}
GET /dashboard/primeira-parcela-por-agente/{db}
GET /efetividade/{tipo}/{db}       ← ETL: diaria/mensal/agente × primeira/colchao
GET /efetividade/resumo            ← KPIs + série diária (live query, filtra por DT_VENCIMENTO)
GET /{full_path}                   ← SPA fallback
```

---

## Páginas React

| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/` | `Index.tsx` | Dashboard executivo principal |
| `/comparacao-agentes` | `ComparacaoAgentes.tsx` | Ranking comparativo |
| `/detalhamento-agentes` | `DetalhamentoAgentes.tsx` | Drill-down por agente |
| `/analise-produtividade` | `AnaliseProdutividade.tsx` | Análise de produtividade |
| `/analise-profunda` | `AnaliseProfunda.tsx` | Análise avançada |
| `/efetividade-boletos` | `EfetividadeBoletos.tsx` | KPIs + gráfico efetividade diária (effectiveness_pct) + tendência mensal + ranking agentes |
| `*` | `NotFound.tsx` | 404 |
