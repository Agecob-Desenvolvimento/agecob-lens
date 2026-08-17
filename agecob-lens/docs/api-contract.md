# API Contract — agecob-lens/src/services/api.ts

> Mapa dos endpoints, tipos e filtros consumidos hoje pelo frontend.
> Fonte de verdade: `agecob-lens/src/services/api.ts`. Backend: FastAPI (`main.py` + `api/routers/*`).
> Regras de negócio das métricas: `agecob-lens/docs/data-layer.md` (leitura obrigatória antes de mexer em dado).

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

Variantes (não seguem o padrão):
- `BenchmarkEnvelope` — `data` é objeto único (`BenchmarkData`), não array.
- `EfResumoEnvelope` — meta `{ generated_at, sources, filters }`; `data` é objeto único.
- `RitmoDiaResponse` — meta `{ generated_at, em_operacao, modelo, modelo_valor?, faixa_batimento?, dias_desde_ultimo_batimento? }`; `data` é objeto único.
- `MetasEnvelope` — `{ meta, metas }`, sem `data`/`errors` no caminho feliz.
- `RegressionEnvelope` — `meta` é `ApiMeta & { raw_count? }`; `data` é array de 1 item.
- `IndexesStatusResponse` / `IndexesApplyResponse` — sem envelope (response direto).
- `postAgentChat` recebe `ApiEnvelope<AgentResponse>` e devolve `data[0]`.

### Tipos de DB

```ts
DatabaseOption    = "COBwebRCBAUTOS" | "COBwebRCBCONSUMER" | "todos"
AdminDatabase     = Exclude<DatabaseOption, "todos">   // admin não aceita "todos"
```

`fetchProdutividade`, `fetchAcordosPorBanco` e as rotas admin **não** aceitam `"todos"`.
`fetchBenchmarks` aceita, mas resolve `"todos"` → `COBwebRCBAUTOS`.

### Auth

O bundle **não** carrega credencial. `request()` só envia `X-Run-Id: web-<ts>-<rand>`.
`X-API-Key` e `Authorization: Bearer` são injetados no upstream pelo proxy Caddy
(`infra/Caddyfile`). Em dev o backend roda com `REQUIRE_API_AUTH=false`.

### Base URL

`API_BASE_CANDIDATES` — tenta em ordem até uma responder JSON:
- `VITE_API_BASE_URL` relativo (`/api`) → só ele;
- `VITE_API_BASE_URL` absoluto → ele + origin de runtime;
- sem env, dev → `127.0.0.1:8000`, `localhost:8000`;
- sem env, prod → origin de runtime + os dois acima.

### Dedup

`request()` deduplica GETs concorrentes por chave `"GET <path>"` via `inflight` map. POSTs nunca deduplicados (`skipInflightDedup`).

### Modo demo

Com `isDemoMode()`, GET responde do snapshot em memória (`getDemoSnapshot`) sem rede; toda resposta passa por `demoAnonymize()` antes de virar snapshot.

### Telemetria

Toda chamada chama `trackApiMetric({ endpoint, method, statusCode?, durationMs, ok })`. Candidata que falha vira `logEvent("warn", "api candidate failed", …)`.

---

## 1. Acordos do dia

| Função | Endpoint | Row type |
|---|---|---|
| `fetchAcordosTodos()` | `GET /dashboard/acordos-hoje/todos` | `AcordoRow` |
| `fetchAcordosPorBanco(db)` | `GET /dashboard/acordos-hoje/{db}` | `AcordoRow` |
| `fetchAcordos(db)` | despacha p/ um dos 2 acima | `AcordoRow` |

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

Query params (snake_case): `assessoria` (ignorado se `"Todas"`), `date_from`, `date_to`, `portfolio`.

```ts
ProdutividadeRow = {
  CHAVE: string;
  NOME: string;
  qtd_acionamentos: number;
  qtd_alo: number;                          // "alguém atendeu" (CTO_COMPLEMENTO.ALO=1)
  qtd_contatos: number;                     // CPC / RPC — count, não %
  cpc_percentual: number;                   // qtd_contatos / qtd_alo (0–100, backend)
  qtd_acordos: number;                      // grão do acordo — base de ticket e conversão
  qtd_acordos_por_contrato: number;         // grão do contrato/dívida — só o KPI global da Home
  qtd_boletos_emitidos: number;
  qtd_boletos_pagos: number;
  acordos_percentual: number;               // qtd_acordos / qtd_acionamentos (0–100)
  valor_acordos: number;
  acordo_medio: number;                     // ticket médio
  parcelamento_medio: number;
  desconto_medio_percentual: number;
  valor_p1_recebido: number;                // VR_PAGO da 1ª parcela
  valor_primeira_parcela: number;
  qtd_excecoes: number;                     // ID_REC_STATUS = 5
  valor_excecoes: number;
  valor_primeira_parcela_excecoes: number;
  qtd_rejeitados: number;                   // ID_REC_STATUS = 7
  valor_rejeitados: number;
  valor_primeira_parcela_rejeitados: number;
  idade_media_acordos: number;
  horas_trabalhadas: number;
}
```

> **Atenção dicionário:** `cpc_percentual` e `acordos_percentual` vêm como `0–100`, não `0–1`. `formatDelta()` da SPECS espera fração — converter no transform.
> **Dois grãos de acordo:** `qtd_acordos_por_contrato` nunca é denominador (ticket e Conversão % seguem em `qtd_acordos`). Ver `data-layer.md`.

`fetchPortfolios(db)` → `GET /dashboard/portfolios/{db}` → `PortfolioRow = { id; nome }` (id = `CAMPO010`).

---

## 4. Metas (PDF trimestral → JSON)

| Função | Endpoint | Método |
|---|---|---|
| `fetchMetas()` | `/dashboard/metas` | GET |
| `uploadMetasPDF(file)` | `/dashboard/metas/upload` | POST `multipart/form-data`, campo `file` (sem dedup) |

```ts
MetaMensal = Record<string, number>   // chave = mês do trimestre carregado, ex.: "202607"

MetaRow = {
  escritorio: string | null; portfolio: string; grupo: string | null;
  qtd_negociadores: number | null;
  meta_caixa: MetaMensal; meta_retomadas_qtd: MetaMensal;
  meta_retomadas_valor: MetaMensal; meta_pnt: MetaMensal;
}

MetasEnvelope = {
  meta: { periodo; meses; extraido_em; arquivo_origem; total_registros; validado;
          checksum_pnt_202604; checksum_total_geral_202604 };
  metas: MetaRow[];
}
```

> O upload responde **HTTP 200 mesmo em falha de validação** — `uploadMetasPDF` lança se `errors[]` vier preenchido.

---

## 5. Dashboard v2 — Portfólio / Agente

Query params em **camelCase** (`dateFrom`/`dateTo`) — exceto `fetchProdutividade`, `fetchTabelaPerformancePeriodo`, `fetchEfResumo`, `fetchBoletosDetalhe` e `fetchEfCurvaQuebra`, que usam `date_from`/`date_to`.

| Função | Endpoint | Row | Extra params |
|---|---|---|---|
| `fetchPrimeiraParcelaDia(db, assessoria?, dateFrom?, dateTo?)` | `/dashboard/primeira-parcela-dia/{db}` | `PrimeiraParcelaDiaRow` | `assessoria` |
| `fetchRejeitadosTotais(db, dateFrom?, dateTo?)` | `/dashboard/rejeitados-totais/{db}` | `RejeitadosTotaisRow` | — |
| `fetchExcecoesPorPortfolio(db, …)` | `/dashboard/excecoes-por-portfolio/{db}` | `ExcecoesPorPortfolioRow` | — |
| `fetchExcecoesPorAgente(db, …)` | `/dashboard/excecoes-por-agente/{db}` | `ExcecoesPorAgenteRow` | — |
| `fetchRejeitadosPorAgente(db, …)` | `/dashboard/rejeitados-por-agente/{db}` | `RejeitadosPorAgenteRow` | — |
| `fetchAcordosPorPortfolio(db, …)` | `/dashboard/acordos-por-portfolio/{db}` | `AcordosPorPortfolioRow` | — |
| `fetchRejeitadosPorPortfolio(db, …)` | `/dashboard/rejeitados-por-portfolio/{db}` | `RejeitadosPorPortfolioRow` | — |
| `fetchQuebradosPorPortfolio(db, …)` | `/dashboard/quebrados-por-portfolio/{db}` | `QuebradosPorPortfolioRow` | — |
| `fetchPortfolioRollup(db, …)` | `/dashboard/portfolio-rollup/{db}` | `PortfolioRollupRow` | — |
| `fetchPrimeiraParcelaPorAgente(db, assessoria?, …)` | `/dashboard/primeira-parcela-por-agente/{db}` | `PrimeiraParcelaPorAgenteRow` | `assessoria` |
| `fetchPrimeiraParcelaPorPortfolio(db, …)` | `/dashboard/primeira-parcela-por-portfolio/{db}` | `PrimeiraParcelaPorPortfolioRow` | — |
| `fetchRealPorPortfolio(db, …)` | `/dashboard/real-por-portfolio/{db}` | `RealPorPortfolioRow` | — |
| `fetchExcecoesSemPortfolio(db, …)` | `/dashboard/excecoes-sem-portfolio/{db}` | `ExcecaoSemPortfolioRow` | — |
| `fetchBenchmarks(db, lookbackMonths=9)` | `/dashboard/benchmarks/{db}` | `BenchmarkEnvelope` | `lookback_months` |
| `fetchStatusCarga(db, assessoria?)` | `/dashboard/status-carga/{db}` | `StatusCargaRow` | `assessoria` |
| `fetchAcordosHojeAgente(db, agente?, assessoria?)` | `/dashboard/acordos-hoje-agente/{db}` | `AcordoHojeAgenteRow` | `agente`, `assessoria` |

```ts
PrimeiraParcelaDiaRow         = { total_valor; total_acordos }
RejeitadosTotaisRow           = { valor_total; valor_primeira_parcela; qtd_rejeitados }
ExcecoesPorPortfolioRow       = { portfolio_name; qtd_excecoes; valor_excecoes }
ExcecoesPorAgenteRow          = { agente; qtd_excecoes; valor_excecoes }
RejeitadosPorAgenteRow        = { agente; qtd_rejeitados; valor_rejeitados; valor_primeira_parcela_rejeitados }
AcordosPorPortfolioRow        = { portfolio_name; qtd_acordos; valor_acordos }
RejeitadosPorPortfolioRow     = { portfolio_name; qtd_rejeitados; valor_rejeitados }
QuebradosPorPortfolioRow      = { portfolio_name; qtd_quebrados; valor_quebrados }
PortfolioRollupRow            = { portfolio_name; id_rec_status; qtd; valor }
PrimeiraParcelaPorAgenteRow   = { agente; qtd_acordos_primeira_parcela; valor_primeira_parcela }
PrimeiraParcelaPorPortfolioRow= { portfolio_name; qtd_acordos; valor_primeira_parcela }
RealPorPortfolioRow           = { portfolio_name; qtd_acordos; valor_recebido; valor_primeira_parcela }
StatusCargaRow                = { database; agentes; qtd_acionamentos; qtd_contatos; qtd_acordos; valor_acordos; qtd_excecoes; valor_excecoes }
AcordoHojeAgenteRow           = { agente; cpf_cnpj; nome_devedor; nr_acordo; tipo_acordo;
                                  vencimento_primeira_parcela; valor_primeira_parcela; valor_demais_parcelas;
                                  qtd_parcelas; valor_total_acordo; data_emissao }   // nulláveis, exceto agente/cpf/nome/nr/tipo/valor_total

BenchmarkQuartiles = { q1; median; q3; top10_mean; mean }   // todos number | null
BenchmarkData      = { taxa_contato; taxa_conversao; efetividade_caixa; pct_excecoes;
                       n_agentes; lookback_months }
```

> `PortfolioRollupRow` é a forma consolidada (1 linha por portfólio × `ID_REC_STATUS`): `lib/portfolioRollup.ts` fatia por status e reconstrói as 5 shapes legadas por portfólio.

---

## 6. Detalhe (linha a linha)

Todas devolvem `QuebradoDetalheRow` (alias de `ExcecaoSemPortfolioRow`) e aceitam `dateFrom`/`dateTo`.

| Escopo | Funções | Endpoint |
|---|---|---|
| Por portfólio | `fetchExcecoesDetalhe`, `fetchRejeitadosDetalhe`, `fetchAcordosDetalhe`, `fetchQuebradosDetalhe` | `/dashboard/{tipo}-detalhe/{db}/{portfolio}` |
| Global (todos os portfólios) | `fetchExcecoesDetalheGlobal`, `fetchRejeitadosDetalheGlobal`, `fetchAcordosDetalheGlobal` | `/dashboard/{tipo}-detalhe-todos/{db}` |
| Por agente | `fetchExcecoesDetalheAgente`, `fetchRejeitadosDetalheAgente`, `fetchQuebradosDetalheAgente` | `/dashboard/{tipo}-detalhe-agente/{db}/{agente}` |

`portfolio` e `agente` vão `encodeURIComponent`.

```ts
ExcecaoSemPortfolioRow = {
  NR_RECEBIMENTO: number;
  ID_CARTEIRA: number;
  valor_primeira_parcela: number;
  valor_total: number;
  agente: string;
  matricula: string;
  cpf_mask: string;              // CPF completo — nome mantido por compat
  nome_devedor: string;
  data_acordo: string | null;
  data_vencimento: string | null;
  total_parcelas: number;
  // só os sidebars de KPI de efetividade (/efetividade/boletos-detalhe) preenchem:
  parcelas_pagas?: number | null;
  data_quebra?: string | null;
  portfolio_name?: string | null;
  divida_original?: number | null;
}
```

---

## 7. Tabela performance período

`fetchTabelaPerformancePeriodo(db, agente?, dateFrom?, dateTo?)` → `GET /dashboard/tabela-performance-periodo/{db}`.

Query: `agente` (ignora `"todos"`, case-insensitive), `date_from`, `date_to`.

```ts
TabelaPerformancePeriodoRow = {
  nome_agente: string;
  matricula: string;
  qtd_acionamentos: number;
  qtd_alo: number;
  qtd_contatos: number;
  qtd_acordos: number;
  conversao_pct: number;        // oficial: qtd_acordos / qtd_contatos, já em %
  pagos_por_cpc_pct: number;    // boletos pagos / CPC — métrica distinta (renomeada 2026-08)
  valor_total: number;
  soma_primeira_parcela: number;
  valor_p1_recebido: number;
  qtd_reprovados: number;
  cpc_pct: number;              // já em %
  qtd_excecoes: number;
  valor_excecoes: number;
}
```

---

## 8. Ritmo do dia (KNN backend)

`fetchRitmoDia(db)` → `GET /dashboard/ritmo-dia/{db}`.

```ts
RitmoDiaResponse = {
  meta: {
    generated_at: string;
    em_operacao: boolean;          // false fora de 8h–19h / fim de semana → acumulados são stub
    modelo: string;
    modelo_valor?: string;
    faixa_batimento?: string;
    dias_desde_ultimo_batimento?: number;
  };
  data: {
    hora_atual: number;
    acumulado_atual: number;
    esperado_total?: number;
    projecao_fechamento?: number;
    valor_acumulado_atual?: number;      // mesma série em R$ (valor de acordos)
    valor_esperado_total?: number;
    valor_projecao_fechamento?: number;
    bandas: RitmoDiaBanda[];
  };
  errors: ApiErrorItem[];
}

RitmoDiaBanda = {
  hora: number;
  esperado: number; real: number | null; delta: number | null;
  status: "acima" | "ok" | "abaixo" | "em_andamento" | "futuro";
  acumulado: number | null;
  esperado_valor?: number; real_valor?: number | null; delta_valor?: number | null;
  status_valor?: same union; acumulado_valor?: number | null;
}
```

> `em_operacao: false` devolve acumulado stub (0) — checar antes de exibir ou anunciar (é o que impede a URA do Modo TV falar "0 acordos" de madrugada).

---

## 9. Efetividade de boletos (`/efetividade/*`)

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
| `fetchEfAgenteColchaoVencimento(db?)` | `/efetividade/mensal-agente-colchao-vencimento` | `EfAgenteColchaoVencimentoRow` (tem `Quebrados`) |

Resumo live (com filtro de período):

`fetchEfResumo(dateFrom, dateTo, db?, parcelaTipo, idPortfolio?)` → `GET /efetividade/resumo`

Query: `date_from`, `date_to`, `parcela_tipo` (`"primeira" | "colchao"`, default `"primeira"`), `db` (se ≠ `"todos"`), `id_portfolio`.

```ts
EfResumoData = { kpis: EfResumoKpis; daily: EfResumoDayRow[];
                 best_day: EfResumoDayRow | null; worst_day: EfResumoDayRow | null }

EfResumoKpis = {
  generated; total_acordos; to_mature; em_carencia; overdue_unpaid;
  paid_on_time; broken; conversion_pct;                 // 0–100
  amount_maturing; amount_received; effectiveness_pct;  // 0–100
}

EfResumoDayRow = { dia; generated; paid_on_time; conversion_pct;
                   amount_maturing; amount_received; effectiveness_pct }
```

Drill-down e curva:

| Função | Endpoint | Row |
|---|---|---|
| `fetchBoletosDetalhe(kind, dateFrom, dateTo, db?, parcelaTipo)` | `/efetividade/boletos-detalhe` | `QuebradoDetalheRow` |
| `fetchEfCurvaQuebra(dateFrom, dateTo, db?)` | `/efetividade/curva-quebra` | `EfCurvaQuebraRow = { faixa; total; quebrados; taxa_quebra }` |

`kind`: `"a_vencer" | "em_carencia" | "vencidos_nao_pagos" | "quebrados" | "pagos_prazo"`.

---

## 10. Regressão de agentes

`fetchRegressionModels(pontos)` → `POST /regressao/agentes` (sem dedup). Body: `{ pontos: RegressionPoint[] }`.

```ts
RegressionPoint = { id; nome; eficiencia; valor; acionamentos; contatos; cpc; conversao }

RegressionEnvelope.data[0] = {
  meta: { raw_count; clean_count; removed_nulls; removed_duplicates; removed_outliers };
  modelos: {
    id; label; description; drawable;
    r2_train; r2_test; adj_r2; cv_train_n; cv_test_n;
    intercept; intercept_se;
    coefficients: { name; value; se }[];
  }[];
}
```

---

## 11. Agente de chat — Analista de carteiras

`postAgentChat(messages, db, dateFrom?, dateTo?)` → `POST /agente/chat` (sem dedup), atrás de `ENABLE_AGENT_CHAT` no backend.

Body: `{ messages, database, dateFrom, dateTo }`. Resposta: `ApiEnvelope<AgentResponse>` — o helper devolve `data[0]` e lança se vier vazio.

```ts
AgentChatMessage = { role: "user" | "assistant"; content: string }

AgentResponse = {
  text: string;
  highlights: { type: "anomaly" | "metric" | "portfolio"; label: string; value?: string }[];
  suggested_actions: { label: string; prompt?: string }[];
  data_sources: string[];
  confidence: "high" | "medium" | "low";
  data_referencia?: string;
}
```

---

## 12. Admin — índices (gated)

Habilitado quando backend tem `ENABLE_INDEX_ADMIN=true` + auth.

| Função | Endpoint | Método |
|---|---|---|
| `fetchAdminIndexesStatus(db)` | `/admin/indexes/status/{db}` | GET |
| `applyAdminIndexes(db, opts)` | `/admin/indexes/apply/{db}` | POST (sem dedup) |

`db`: `AdminDatabase` (apenas `COBwebRCBAUTOS` ou `COBwebRCBCONSUMER`).

Apply query: `dry_run` (default `true`), `online` (default `false`), `update_statistics` (default `false`).

Tipos: `IndexDescriptor`, `IndexesStatusResponse`, `IndexApplyStep`, `StatisticsApplyStep`, `IndexesApplyResponse` — ver fim de `api.ts`.

---

## Gaps de dados (backlog backend)

1. **Metas por unidade de negócio / por dia** — o PDF trimestral só tem meta mensal por portfólio. O Modo TV rateia por dias úteis no frontend e deixa `TV_BU.metaValor` nulo.
2. **Heatmap multi-métrica** — `/ritmo-dia` serve acordos e valor; Acionamentos / Contatos / Conversão por hora ainda não existem.
3. **Mediana de equipe** — não é entregue; calculada no frontend a partir das rows de `fetchProdutividade`. Quartis só existem no `/dashboard/benchmarks` (janela de meses, não do período filtrado).
4. **Concentração Top 3** — derivada de `fetchProdutividade` (`sum(top3.valor_acordos) / sum(all.valor_acordos)`). Pure frontend, sem gap real.

---

## Pegadinhas observadas

- **camelCase vs snake_case nos query params**: `dateFrom`/`dateTo` na maioria das rotas v2 vs `date_from`/`date_to` em `fetchProdutividade`, `fetchTabelaPerformancePeriodo`, `fetchEfResumo`, `fetchBoletosDetalhe`, `fetchEfCurvaQuebra`. Não unificar — quebraria backend.
- **`assessoria === "Todas"`** equivale a omitir o param. Replicar em qualquer novo helper.
- **`agente === "todos"`** (case-insensitive) equivale a omitir. Mesma regra.
- **Percentuais**: backend devolve `0–100` em `cpc_percentual`, `acordos_percentual`, `conversao_pct`, `pagos_por_cpc_pct`, `cpc_pct`, `conversion_pct`, `effectiveness_pct`. Helpers SPECS (`formatDelta`) querem fração `0–1`. Centralizar conversão em `transforms/executiveMetrics.ts`.
- **`cpf_mask` não mascara** — devolve o CPF completo desde 2026-08-06; o nome ficou por compatibilidade.
- **Envelope sem `success`** — só `meta` / `data` / `errors`. HTTP 200 com `errors[]` preenchido é falha parcial (um dos bancos caiu), não sucesso.
- **`API_BASE_CANDIDATES`**: tenta `127.0.0.1:8000` → `localhost:8000` em dev. Em prod usa origin runtime. Cuidado ao mockar — interceptar fetch pode pegar 1ª ou 2ª URL.
