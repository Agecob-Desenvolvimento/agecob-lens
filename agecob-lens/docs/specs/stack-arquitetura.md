---
title: Agecob — Stack e Arquitetura
tags: [agecob, backend, frontend, infra]
created: 2026-04-27
updated: 2026-04-27
---

# Stack e Arquitetura — agecob-lens

## Visão Geral

O agecob-lens é um dashboard de produtividade para a operação de cobrança da Agecob. Lê dados de duas instâncias do sistema COBweb (SQL Server) e entrega KPIs em tempo real para gestão.

```
┌─────────────┐     ┌──────────────┐     ┌───────────────────────┐
│  Browser     │────▸│  Caddy       │────▸│  FastAPI (Uvicorn)     │
│  React/TS    │◂────│  TLS + Basic │◂────│  porta 8000            │
│  (SPA)       │     │  Auth (443)  │     │  main.py: 115 linhas   │
└─────────────┘     └──────────────┘     │  rotas em api/routers/ │
                                          └───────┬───────┬───────┘
                                                  │       │
                                    ┌─────────────┘       └─────────────┐
                                    ▼                                   ▼
                          ┌─────────────────┐                 ┌─────────────────┐
                          │ COBwebRCBCONSUMER│                 │ COBwebRCBAUTOS   │
                          │ (SQL Server)     │                 │ (SQL Server)     │
                          └─────────────────┘                 └─────────────────┘
                                    │
                                    ▼
                          ┌─────────────────┐
                          │ Agecob DB        │  ← futuro: tabelas fato, alertas
                          │ (SQL Server)     │
                          └─────────────────┘
```

## Backend

| Item | Detalhe |
|---|---|
| Framework | FastAPI + Uvicorn |
| Linguagem | Python |
| Banco | SQL Server (pyodbc) |
| Arquivo principal | `main.py` — 115 linhas de bootstrap puro (app, CORS, 2 middlewares, 7 `include_router`, 1 exception handler, 1 startup hook). **Nenhuma rota e nenhuma constante de negócio.** |
| Camadas | `api/` (routers, middleware, static) · `core/` (database, cache, telemetry, utils) · `dominios/` (acordos, produtividade, graficos, efetividade, metas, agente) · `config/settings.py` (constantes) — ver [[decisoes-tecnicas#ADR-014]] |
| Cache | In-memory, TTL 60s, auto-refresh 2min |
| Bypass de cache | `?force_refresh=true` — só em `/dashboard/produtividade-agentes` |
| Concorrência | `ThreadPoolExecutor` para queries paralelas por banco |
| Telemetria | `_agent_ndjson` (logging estruturado) |
| Hints SQL | `NOLOCK` em todas as tabelas, `MAXDOP 0` na query de produtividade |
| Padrão de join | `CROSS APPLY TOP 1` para DIV_AUX (evita multiplicação de linhas) |
| Padrão de agregação | CTEs separadas → join de agregados (nunca join linha × linha) |

## Frontend

| Item | Detalhe |
|---|---|
| Framework | React + TypeScript |
| Build | Vite |
| Estilização | Tailwind CSS |
| Componentes UI | shadcn/ui |
| Gráficos | Recharts |
| Servido por | **O próprio FastAPI** (`api/static.py:31-52`): monta `/assets` a partir de `dist/assets`, registra `GET /` e um catch-all de fallback da SPA. O Caddy só faz proxy de 443 para o uvicorn. |

## Infraestrutura

| Item | Detalhe |
|---|---|
| Servidor | Windows Server (mesmo host do SQL Server) |
| Proxy reverso | **Caddy** (`infra/Caddyfile`) — termina TLS, aplica Basic Auth, limita corpo a 10MB e injeta `X-API-Key` + `Authorization: Bearer` no proxy para a API |
| Processo API | NSSM (roda como Windows Service: `AgecobAPI`) |
| Versionamento | Git + GitHub (repo privado) |
| Deploy | `atualizar.bat` (build + restart do serviço, com UAC auto-elevação) |
| Diretório do projeto | `C:\agecob\agecob-lens` |
| Frontend buildado | `C:\agecob\agecob-lens\dist` |

## Bancos de Dados

### COBwebRCBCONSUMER e COBwebRCBAUTOS

São as bases transacionais do sistema COBweb. Leitura apenas — o agecob-lens nunca escreve nessas bases.

Tabelas principais consumidas:

| Tabela | Uso |
|---|---|
| `CTO_MASTER` | Acionamentos e contatos (esforço operacional) |
| `USU_MASTER` | Agentes (login, nome, CHAVE) |
| `REC_MASTER` | Acordos e parcelas |
| `REC_DIVIDAS` | Vínculo acordo → dívida |
| `DIV_MASTER` | Saldo da dívida (`VR_SALDO`) |
| `DIV_AUX` | Portfólio (`CAMPO010`) |
| `DEV_MASTER` | Devedores |
| `REC_STATUS` | Descrição de status |
| `CART_MASTER` | Nomes de carteira/portfólio (referência, não usado para filtros) |
| `CARGA_LOTE` | Eventos de importação de carteiras |

Índices confirmados relevantes:
- `CTO_MASTER`: `IND_CTO_MASTER_DATA`, `IND_CTO_MASTER_ID_USUARIO`
- `REC_MASTER`: `IND_REC_MASTER_DT_EMISSAO`, `IND_REC_MASTER_NR_RECEBIMENTO`

### Agecob DB

Base auxiliar disponível para armazenamento persistente (tabelas fato, alertas, resultados de análise). Permissão de criação de tabela pendente de confirmação.

## Endpoints em Produção

### Produtividade (dia atual)
- `GET /dashboard/produtividade-hoje/{db}`
- `GET /dashboard/status-carga/{db}`
- `GET /dashboard/produtividade/{db}`
- `GET /dashboard/produtividade-agentes` (consolidado cross-DB)

### Comparação e Detalhamento
- `GET /dashboard/comparacao-agentes/{db}`
- `GET /dashboard/detalhamento-agentes/{db}`

### Acordos
- `GET /dashboard/acordos-hoje/{db}`
- `GET /dashboard/acordos-hoje/todos`
- `GET /dashboard/acordos-hoje-agente/{db}`

### Gráficos e Cards
- `GET /dashboard/primeira-parcela-dia/{db}`
- `GET /dashboard/excecoes-por-portfolio/{db}`
- `GET /dashboard/excecoes-por-agente/{db}`
- `GET /dashboard/acordos-por-portfolio/{db}`
- `GET /dashboard/primeira-parcela-por-agente/{db}`

### Health
- `GET /health/db`
- `GET /health/db/{db}`
- `GET /`

## Páginas do Frontend

| Rota | Arquivo | Função |
|---|---|---|
| Home | `Index.tsx` | Síntese do dia: KPIs + rankings + gráficos |
| Detalhamento | `DetalhamentoAgentes.tsx` | Drill-down por agente individual |
| Carteiras | `Carteiras.tsx` | Meta vs real por carteira (rota `/carteiras`) |
| Efetividade | `EfetividadeBoletos.tsx` | Efetividade de boletos (rota `/efetividade-boletos`) |
| Modo TV | `ModoTV.tsx` | Painel de parede, escopo do dia (rota `/modo-tv`) |
| 404 | `NotFound.tsx` | Catch-all |

> **Correção 2026-09-16.** Três páginas listadas aqui foram removidas do código e não
> têm rota nem import: `AnaliseProdutividade.tsx` e `ComparacaoAgentes.tsx` (deletadas
> em `586609c`, 2026-06-02) e `AnaliseProfunda.tsx` (deletada em `a68965d`,
> 2026-05-26). A página `AnaliseOperacional` que o placeholder prometia nunca foi
> criada. O inventário acima é o de `agecob-lens/src/App.tsx:127-132`.

## Referências

- [[agecob-regras-de-negocio]] — Regras de negócio completas
- [[mapa-kpis-dashboard]] — Mapa KPI → fórmula → endpoint
- [[agecob-moc]] — Índice geral
