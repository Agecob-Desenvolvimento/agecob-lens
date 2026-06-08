# CLAUDE.md

Contexto persistente do projeto **dash relatorio** (AgDash). Lido automaticamente em cada sessão.

---

## Projeto

Monorepo: dashboard executivo de cobrança para AgeCob. Consome SQL Server (bancos `COBwebRCBAUTOS` e `COBwebRCBCONSUMER`), serve API FastAPI + SPA React buildada.

- **Backend:** Python 3.8+, FastAPI, pyodbc, SQL Server (ODBC Driver 17). Monolito histórico em `main.py` + módulos `api/`, `core/`, `dominios/`, `config/` (ADR-001).
- **Frontend:** `agecob-lens/` — Vite + React 18 + TypeScript + Tailwind + shadcn/ui + Recharts + TanStack Query + React Router.
- **Deploy:** Windows Server via NSSM (`AgecobAPI`), porta 8000, `atualizar.bat` faz pull + build + restart.

## Leitura obrigatória no início da sessão

Antes de qualquer ação, leia nesta ordem:

1. @agecob-lens/docs/CLAUDE.md — redesign executivo: regra "Errado ou Agir", dicionário oficial de métricas, regras de apresentação, anti-padrões, arquitetura de informação, componentes, critérios de aceite.
2. @agecob-lens/docs/TASKS.md — backlog em ondas (A → D). Execute apenas itens **não marcados** com `[x]`. Marque `[x]` **imediatamente** ao concluir, antes do próximo.
3. @README.md — quickstart, endpoints, configuração de `.env`, rollback, índices SQL.

Essas regras prevalecem sobre interpretações alternativas do código.

> **OBRIGATÓRIO ao mexer com dados:** qualquer trabalho que toque fetching, ViewModels, selectors, métricas, adapters ou contrato de dados (frontend ou backend) exige ler **@agecob-lens/docs/data-layer.md POR INTEIRO** antes de qualquer edição. Vale para a sessão principal e para todo subagente. Sem leitura completa, não edite código de dados.

---

## Commands

Frontend (rodar dentro de `agecob-lens/`):

```cmd
npm run dev       # vite dev server
npm run build     # production build → dist/
npm run lint      # eslint
npm run test      # vitest run
npm run test:watch
```

Backend:

```cmd
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Servidor (produção `C:\agecob`): `atualizar.bat` faz git pull + pip + npm build + restart NSSM.

Graph (após mudanças relevantes): `/graphify . --update`

---

## Code Style

- **Python:** PEP 8, 4 espaços, type hints onde já existem, docstrings curtas. `run_query()` para SQL — não criar conexões manuais. Usar `build_response_envelope()` para respostas padronizadas.
- **TypeScript/React:** 2 espaços, named exports, funções de formatação centralizadas (`fmtBRL`, `fmtPct`, `fmtNum`). Componentes de UI vêm de `src/components/ui/` (shadcn) — não duplicar. `cn()` de `lib/utils.ts` para classes condicionais.
- **Estado:** TanStack Query para dados de servidor, contexto global (`GlobalFiltersContext`) para filtros de período/banco. Não bloatar contextos.
- **Imports:** absolutos com alias `@/` no frontend.
- **Sem comentários explicativos do óbvio.** Comentário só para *por quê* não-óbvio (constraint, invariante, workaround). Nunca comentar o *o quê*.

---

## Regras de negócio (críticas — não inferir do código)

| Regra | Valor canônico |
|---|---|
| Primeira parcela | `PARCELA = 0` |
| Acordos aprovados (`ID_REC_STATUS`) | `IN (1, 3, 12)` |
| **Valores gerados** (`STATUS_GERADOS`) | `IN (1, 2, 3, 10, 12)` — aprovados + QUEBRA(2) + QUEBRA AUTOMÁTICA(10). Base de valor_acordos, 1ª parcela, qtd_acordos, ticket e boletos (conversão/efetividade) |
| Exceções (`ID_REC_STATUS`) | `IN (5)` — negócio chama de "Exceção" o status que o enum REC_MASTER nomeia como PENDENTE |
| Boletos quebrados (`ID_REC_STATUS`) | `IN (2)` |
| Pré-filtro CTE | `IN (1, 2, 3, 5, 10, 12)` — gerados + exceção |
| Portfólio | `DIV_AUX.CAMPO010` |
| Filtro de data padrão | `DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha` |
| `NOLOCK` | **Obrigatório** em todas as tabelas de leitura |
| Agentes excluídos | `COBDESANTOS`, `ANTLIA%`, `INTERNA%`, `suporte%`, `SISTEMA%` — aplicar **no SQL** (ADR-005), nunca em pós-processamento |
| Contato (CPC) | `CTO_COMPLEMENTO.CONTATO = 1` — JOIN `CTO_MASTER.ID_COMPLEMENTO = CTO_COMPLEMENTO.ID_COMPLEMENTO` (substituiu a lista hardcoded de IDs) |
| Bancos | `COBwebRCBAUTOS` \| `COBwebRCBCONSUMER` \| `todos` |

Dicionário oficial de métricas (CPC, Conversão, Ticket médio, Exceções) está em `agecob-lens/docs/CLAUDE.md`. **Não criar variações.**

---

## Arquitetura — pontos críticos

- **God nodes** (alta conectividade — cuidado ao mexer): `run_query()`, `config/settings.py`, `cn()`, `request()`, `build_response_envelope()`, `_agent_ndjson()`, `get_efetividade()`.
- **CTEs separadas** para agregados (ADR-002). Não unificar sem justificativa.
- **CROSS APPLY TOP 1** para portfólio em vez de JOIN (ADR-004).
- **Tabela fato sem dimensão de agente** na fase 1 (ADR-003).
- **Cache em memória** com TTL configurável (`DASHBOARD_CACHE_TTL`, default 60s). Reiniciar serviço limpa cache.
- **Pool de conexões** por database por worker (`DB_POOL_SIZE`, default 6).
- **Rotas-chave:** `/dashboard/*` (KPIs), `/efetividade/*` (boletos), `/admin/indexes/*` (DBA, gated por `ENABLE_INDEX_ADMIN`), `/health/db/{db}`, `/ritmo-dia` (KNN).

Frontend páginas → pergunta que respondem:

| Página | Pergunta |
|---|---|
| `Index.tsx` / Dashboard | "Como estamos?" |
| `AnaliseProdutividade.tsx` | "Por quê?" |
| `DetalhamentoAgentes.tsx` | "Quem / como este agente?" |
| `ComparacaoAgentes.tsx` | "Quem priorizar / alocar?" |
| `EfetividadeBoletos.tsx` | "Boletos estão pagando?" |

---

## Context Navigation (redução de tokens)

Protocolo de leitura — siga em ordem, pare quando tiver contexto suficiente:

1. `graphify-out/GRAPH_REPORT.md` — god nodes, communities, surprising connections.
2. `graphify-out/graph.json` — buscar nó por label, achar `source_file` + `source_location`.
3. Ler **apenas** o `file:line` identificado. Sem leituras especulativas de arquivo inteiro.
4. Leitura crua de arquivo só se usuário pedir explicitamente OU graph não tiver o símbolo.

**Nunca** glob/ler diretório inteiro. **Nunca** ler `node_modules`, `.venv`, `graphify-out/cache`, `dist`.

---

## Behavioral guidelines

### 1. Pensar antes de codar
Não assumir. Não esconder confusão. Se houver múltiplas interpretações, apresentar — não escolher silenciosamente. Se mais simples existe, dizer. Se algo não está claro, parar e perguntar.

### 2. Simplicidade primeiro
Código mínimo. Sem features extras, sem abstrações para uso único, sem flexibilidade não pedida, sem tratamento de erros para cenários impossíveis. Se 200 linhas viram 50, reescreva.

### 3. Mudanças cirúrgicas
Mexer apenas no necessário. Não "melhorar" código adjacente. Não refatorar o que não está quebrado. Match no estilo existente. Limpar apenas orphans **criados pelas suas próprias mudanças** — código morto pré-existente: mencionar, não deletar.

### 4. Execução orientada a objetivo
Transformar tarefa em critério verificável. Para multi-step, declarar plano breve com checagem por passo. Critérios fortes permitem loop independente; critérios fracos ("fazer funcionar") geram retrabalho.

---

## Configuração rápida — `.env` (backend)

Variáveis críticas (ver `.env.example` e README para a lista completa):

```
DB_DRIVER / DB_SERVER / DB_USER / DB_PASSWORD   # SQL Server
API_KEY / API_TOKEN                              # Auth
REQUIRE_API_AUTH=false                           # true em prod
DASHBOARD_CACHE_TTL=60                           # 0 desliga
ENABLE_INDEX_ADMIN=false                         # true só para janela DBA
ENABLE_AGENT_TELEMETRY=false
```

Frontend `.env`: `VITE_API_BASE_URL=/api`, `VITE_API_PROXY_TARGET=http://127.0.0.1:8000`.

`.env` **nunca** vai pro git com dados sensíveis.
