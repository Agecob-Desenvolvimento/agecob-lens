# API Contract — agecob-lens/src/services/api.ts

> Mapa dos endpoints, tipos e filtros consumidos hoje pelo frontend.
> Fonte de verdade: `agecob-lens/src/services/api.ts`. Backend: FastAPI (`main.py` + `api/routers/*`).
> **Regra Onda D:** nenhuma mudança de contrato. Tudo que falta no frontend → transform local.

---

## Convenções globais

### Envelope padrão

```ts
ApiEnvelope<T> = {
  meta: { generated_at: string; total_rows: number; sources: string[]; filters: { date: string } };
  data: T[];
  errors: { source?: string; message: string }[];
}
```

Variantes:
- `EfResumoEnvelope` — meta `{ generated_at, sources, filters }`; `data` é objeto único (não array).
- `RitmoDiaResponse` — meta `{ generated_at, em_operacao, modelo, faixa_batimento?, dias_desde_ultimo_batimento? }`; `data` é objeto único.
- `IndexesStatusResponse` / `IndexesApplyResponse` — sem envelope (response direto).

### Tipos de DB

```ts
DatabaseOption    = "COBwebRCBAUTOS" | "COBwebRCBCONSUMER" | "todos"
AdminDatabase     = Exclude<DatabaseOption, "todos">   // admin não aceita "todos"
```

### Auth

Headers injetados quando `VITE_API_KEY` / `VITE_API_TOKEN` presentes:
- `X-API-Key: <key>`
- `Authorization: Bearer <token>`
- `X-Run-Id: web-<ts>-<rand>` (sempre)

### Dedup

`request()` deduplica GETs concorrentes por chave `"GET <path>"` via `inflight` map. POSTs nunca deduplicados (`skipInflightDedup`).

### Telemetria

Toda chamada chama `trackApiMetric({ endpoint, method, statusCode?, durationMs, ok })`.

---

## 1. Acordos do dia

| Função | Endpoint | Row type |
|---|---|---|
| `fetchAcordosTodos()` | `GET /dashboard/acordos-hoje/todos` | `AcordoRow` |
| `fetchAcordosPorBanco(db)` | `GET /dashboard/acordos-hoje/{db}` | `AcordoRow` |
| `fetchAcordos(db)` | despacha p/ um dos 2 acima | `AcordoRow` |

`db` em `fetchAcordosPorBanco`: `Exclude<DatabaseOption, "todos">`.

```ts
AcordoRow = {
  banco_origem?: string;       // só presente no /todos
  agente: string;
  cpf_cnpj: string;
  nome_razao: string;
  valor_atualizado_divida: number;
  valor_total_acordo: number;
  desconto_concedido: number;
  acordo: number;
  qtd_parcelas: number;
  numero_parcela: number;       // PARCELA — 1ª parcela = 0
  data_emissao: string;
  data_vencimento: string;
  valor_parcela: number;
  status_parcela: string;
  dt_pagamento: string | null;
  situacao_pagamento: string;
}
```

---

## 2. Health check

| Função | Endpoint |
|---|---|
| `fetchHealth("todos")` | `GET /health/db` |
| `fetchHealth(db)` | `GET /health/db/{db}` |

Retorna `Record<string, string>` — formato livre. Espera `"status": "ok"` por banco.

---

## 3. Produtividade (single-DB)

`fetchProdutividade(db, filters?)` → `GET /dashboard/produtividade-hoje/{db}` (db ≠ `"todos"`).

Query params:
- `assessoria` (ignorado se `"Todas"`)
- `date_from`
- `date_to`

```ts
ProdutividadeRow = {
  CHAVE: string;
  NOME: string;
  qtd_acionamentos: number;
  qtd_contatos: number;
  cpc_percentual: number;            // já calculado backend (0–100)
  qtd_acordos: number;
  acordos_percentual: number;        // conversão (0–100)
  valor_acordos: number;
  acordo_medio: number;              // ticket médio
  parcelamento_medio: number;
  desconto_medio_percentual: number;
  valor_primeira_parcela: number;
  qtd_excecoes: number;
  valor_excecoes: number;
  valor_primeira_parcela_excecoes: number;
}
```

> **Atenção dicionário:** `cpc_percentual` e `acordos_percentual` vêm como `0–100`, não `0–1`. `formatDelta()` da SPECS espera fração — converter no transform.

---

## 4. Dashboard v2 — Portfólio / Agente

Todas aceitam `dateFrom` + `dateTo` (e algumas `assessoria`). Query params em **camelCase** (`dateFrom`/`dateTo`) exceto `fetchProdutividade` e `fetchTabelaPerformancePeriodo` que usam `date_from`/`date_to`.

| Função | Endpoint | Row | Extra params |
|---|---|---|---|
| `fetchPrimeiraParcelaDia(db, assessoria?, dateFrom?, dateTo?)` | `/dashboard/primeira-parcela-dia/{db}` | `PrimeiraParcelaDiaRow` | `assessoria` |
| `fetchExcecoesPorPortfolio(db, dateFrom?, dateTo?)` | `/dashboard/excecoes-por-portfolio/{db}` | `ExcecoesPorPortfolioRow` | — |
| `fetchExcecoesPorAgente(db, dateFrom?, dateTo?)` | `/dashboard/excecoes-por-agente/{db}` | `ExcecoesPorAgenteRow` | — |
| `fetchAcordosPorPortfolio(db, dateFrom?, dateTo?)` | `/dashboard/acordos-por-portfolio/{db}` | `AcordosPorPortfolioRow` | — |
| `fetchExcecoesSemPortfolio(db, dateFrom?, dateTo?)` | `/dashboard/excecoes-sem-portfolio/{db}` | `ExcecaoSemPortfolioRow` | — |
| `fetchRejeitadosPorPortfolio(db, dateFrom?, dateTo?)` | `/dashboard/rejeitados-por-portfolio/{db}` | `RejeitadosPorPortfolioRow` | — |
| `fetchPrimeiraParcelaPorAgente(db, assessoria?, dateFrom?, dateTo?)` | `/dashboard/primeira-parcela-por-agente/{db}` | `PrimeiraParcelaPorAgenteRow` | `assessoria` |
| `fetchStatusCarga(db, assessoria?)` | `/dashboard/status-carga/{db}` | `StatusCargaRow` | `assessoria` |
| `fetchAcordosHojeAgente(db, agente?, assessoria?)` | `/dashboard/acordos-hoje-agente/{db}` | `AcordoHojeAgenteRow` | `agente`, `assessoria` |

```ts
PrimeiraParcelaDiaRow         = { total_valor; total_acordos }
ExcecoesPorPortfolioRow       = { portfolio_name; qtd_excecoes; valor_excecoes }
ExcecoesPorAgenteRow          = { agente; qtd_excecoes; valor_excecoes }
AcordosPorPortfolioRow        = { portfolio_name; qtd_acordos; valor_acordos }
RejeitadosPorPortfolioRow     = { portfolio_name; qtd_rejeitados; valor_rejeitados }
ExcecaoSemPortfolioRow        = { NR_RECEBIMENTO; ID_CARTEIRA; VALOR; agente; cpf_mask; nome_devedor }
PrimeiraParcelaPorAgenteRow   = { agente; qtd_acordos_primeira_parcela; valor_primeira_parcela }
StatusCargaRow                = { database; agentes; qtd_acionamentos; qtd_contatos; qtd_acordos; valor_acordos; qtd_excecoes; valor_excecoes }
AcordoHojeAgenteRow           = { agente; cpf_cnpj; nome_devedor; nr_acordo; tipo_acordo; vencimento_primeira_parcela; valor_primeira_parcela; valor_demais_parcelas; qtd_parcelas; valor_total_acordo; data_emissao }
```

---

## 5. Tabela performance período

`fetchTabelaPerformancePeriodo(db, agente?, dateFrom?, dateTo?)` → `GET /dashboard/tabela-performance-periodo/{db}`.

Query: `agente` (ignora `"todos"`), `date_from`, `date_to`.

```ts
TabelaPerformancePeriodoRow = {
  nome_agente: string;
  matricula: string;
  qtd_acionamentos: number;
  qtd_contatos: number;
  qtd_acordos: number;
  conversao_pct: number;       // já em %
  valor_total: number;
  soma_primeira_parcela: number;
  qtd_reprovados: number;
  cpc_pct: number;             // já em %
  qtd_excecoes: number;
  valor_excecoes: number;
}
```

---

## 6. Ritmo do dia (KNN backend)

`fetchRitmoDia(db)` → `GET /dashboard/ritmo-dia/{db}`.

```ts
RitmoDiaResponse = {
  meta: {
    generated_at: string;
    em_operacao: boolean;
    modelo: string;
    faixa_batimento?: string;
    dias_desde_ultimo_batimento?: number;
  };
  data: {
    hora_atual: number;
    acumulado_atual: number;
    esperado_total?: number;
    projecao_fechamento?: number;
    bandas: {
      hora: number;
      esperado: number;
      real: number | null;
      delta: number | null;
      status: "acima" | "ok" | "abaixo" | "em_andamento" | "futuro";
      acumulado: number | null;
    }[];
  };
  errors: ApiErrorItem[];
}
```

> **Match c/ SPECS.md `RitmoDiaHeatmap`:** já entrega `delta`, `status`, `acumulado` por hora — heatmap consome direto. `esperado_total` e `projecao_fechamento` viram header do card. Métricas extras (Acionamentos / Contatos / Conversão por hora) **não estão no contrato** — hoje só serve uma métrica (acordos). Onda C/D: mock multi-métrica ou pedir extensão backend.

---

## 7. Efetividade de boletos (`/efetividade/*`)

Query `db` opcional (omite quando `"todos"`):

| Função | Endpoint | Row |
|---|---|---|
| `fetchEfDiariaPrimeira(db?)` | `/efetividade/diaria-primeira` | `EfDiariaRow` |
| `fetchEfDiariaColchao(db?)` | `/efetividade/diaria-colchao` | `EfDiariaColchaoRow` |
| `fetchEfMensalPrimeira(db?)` | `/efetividade/mensal-primeira` | `EfMensalRow` |
| `fetchEfMensalColchao(db?)` | `/efetividade/mensal-colchao` | `EfMensalColchaoRow` |
| `fetchEfAgentePrimeira(db?)` | `/efetividade/mensal-agente-primeira` | `EfAgenteRow` |
| `fetchEfAgenteColchao(db?)` | `/efetividade/mensal-agente-colchao` | `EfAgenteColchaoRow` |
| `fetchEfDiariaColchaoVencimento(db?)` | `/efetividade/diaria-colchao-vencimento` | `EfDiariaColchaoVencimentoRow` |
| `fetchEfMensalColchaoVencimento(db?)` | `/efetividade/mensal-colchao-vencimento` | `EfMensalColchaoVencimentoRow` |
| `fetchEfAgenteColchaoVencimento(db?)` | `/efetividade/mensal-agente-colchao-vencimento` | `EfAgenteColchaoVencimentoRow` |

Resumo live (com filtro de período):

`fetchEfResumo(dateFrom, dateTo, db?, parcelaTipo, idPortfolio?)` → `GET /efetividade/resumo`

Query: `date_from`, `date_to`, `parcela_tipo` (`"primeira" | "colchao"`, default `"primeira"`), `db` (se ≠ `"todos"`), `id_portfolio`.

```ts
EfResumoData = {
  kpis: EfResumoKpis;
  daily: EfResumoDayRow[];
  best_day: EfResumoDayRow | null;
  worst_day: EfResumoDayRow | null;
}

EfResumoKpis / EfResumoDayRow = {
  generated: number;
  paid_on_time: number;
  conversion_pct: number;        // 0–100
  amount_maturing: number;
  amount_received: number;
  effectiveness_pct: number;     // 0–100
  dia?: string;                  // só em EfResumoDayRow
}
```

---

## 8. Admin — índices (gated)

Habilitado quando backend tem `ENABLE_INDEX_ADMIN=true` + auth.

| Função | Endpoint | Método |
|---|---|---|
| `fetchAdminIndexesStatus(db)` | `/admin/indexes/status/{db}` | GET |
| `applyAdminIndexes(db, opts)` | `/admin/indexes/apply/{db}` | POST (sem dedup) |

`db`: `AdminDatabase` (apenas `COBwebRCBAUTOS` ou `COBwebRCBCONSUMER`).

Apply query: `dry_run` (default `true`), `online` (default `false`), `update_statistics` (default `false`).

Tipos: `IndexDescriptor`, `IndexesStatusResponse`, `IndexApplyStep`, `StatisticsApplyStep`, `IndexesApplyResponse` — ver `api.ts:459-507`.

---

## Mapa contrato → SPECS componentes

| Componente (SPECS) | Endpoint(s) fonte | Transform necessário |
|---|---|---|
| `ExecutiveKpiStrip` — primários (Valor Acordos, 1ª Parcela) | `fetchProdutividade` ou agregação de `fetchAcordosPorPortfolio` + `fetchPrimeiraParcelaDia` | Soma sobre rows, formatar via `formatBRLCompact` |
| `ExecutiveKpiStrip` — primários (CPC, Conversão) | `fetchProdutividade` (`cpc_percentual`, `acordos_percentual`) | Dividir por 100 (vem em %, SPECS quer fração) |
| `ExecutiveKpiStrip` — secundários (Ticket, Exceções, Qtd Acordos, Acionamentos) | `fetchProdutividade` | Ticket: `acordo_medio`. Exceções%: `valor_excecoes / valor_acordos` (calc local) |
| `KpiDeltaBadge` — baseline `meta` | **Não existe no backend** | Mock + `isSimulated: true` + warn |
| `KpiDeltaBadge` — baseline `period` (ontem) | **Não existe** — endpoints só servem hoje ou range explícito | Onda D: refetch com `dateFrom=ontem&dateTo=ontem` e diff frontend |
| `KpiDeltaBadge` — baseline `movavg` (14d) | Idem — calcular via N requests | Frontend: gerar range 14d, agregar |
| `ExecutiveInsightCard` | `lib/insightEngine.ts` (já existe) | Refatorar para `{variant: 'critical' \| 'positive' \| null}` |
| `SectionHeader` | — | Estático |
| `ExecutiveRankingTable` — Top valor | `fetchProdutividade` ordenado por `valor_acordos` desc | Pegar top N, calcular `vs Mediana` no frontend |
| `ExecutiveRankingTable` — Top CPC (Análise) | `fetchProdutividade` ordenado por `cpc_percentual` asc | Filtrar volume mínimo (sugerido: ≥ 50 acionamentos) |
| `RitmoDiaHeatmap` | `fetchRitmoDia(db)` | Hoje só 1 métrica. Multi-métrica → mock ou backend extension |
| `AgentRegressionScatter` (B.7) | `fetchProdutividade` | Regressão linear no frontend; ainda não existe util |

---

## Gaps de dados (para backlog backend)

1. **Baselines** (`meta`, `ontem`, `média 14d`) — nenhum endpoint entrega comparativo. Soluções:
   - Curto prazo: frontend faz N requests adicionais (penaliza Home).
   - Médio prazo: endpoint `/dashboard/produtividade-comparada?baseline=...` que devolve `{atual, baseline, delta}`.
2. **Heatmap multi-métrica** — `RitmoDiaResponse` serve só acordos. SPECS espera Acionamentos / Contatos / Conversão por hora. Soluções:
   - Mock c/ `isSimulated: true` na Onda D.
   - Backend: parametrizar `?metrica=acionamentos|contatos|conversao` em `/ritmo-dia/{db}`.
3. **Mediana de equipe** — não é entregue. Calcular no frontend a partir das rows da `fetchProdutividade`.
4. **Concentração Top 3** (KPI secundário do SPECS) — derivado de `fetchProdutividade`: `sum(top3.valor_acordos) / sum(all.valor_acordos)`. Pure frontend, sem gap real.

---

## Pegadinhas observadas

- **Inconsistência camelCase vs snake_case nos query params**: `dateFrom`/`dateTo` (v2) vs `date_from`/`date_to` (`fetchProdutividade`, `fetchTabelaPerformancePeriodo`, `fetchEfResumo`). Não unificar agora — quebraria backend.
- **`assessoria === "Todas"`** equivale a omitir o param. Replicar em qualquer novo helper.
- **`agente === "todos"`** (case-insensitive) equivale a omitir. Mesma regra.
- **Percentuais**: backend devolve `0–100` em `cpc_percentual`, `acordos_percentual`, `conversao_pct`, `cpc_pct`, `conversion_pct`, `effectiveness_pct`. Helpers SPECS (`formatDelta`) querem fração `0–1`. Centralizar conversão em `transforms/executiveMetrics.ts`.
- **Auth em dev**: se `VITE_API_KEY`/`VITE_API_TOKEN` ausentes, request roda sem headers — backend dev geralmente `REQUIRE_API_AUTH=false`.
- **`API_BASE_CANDIDATES`**: tenta `127.0.0.1:8000` → `localhost:8000` em dev. Em prod usa origin runtime. Cuidado ao mockar — interceptar fetch pode pegar 1ª ou 2ª URL.
