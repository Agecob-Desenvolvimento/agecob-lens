# AgDash API — Referência de Endpoints

Referência completa dos **57 endpoints**. Conceitos, autenticação, contrato de
resposta e erros estão no **[README.md](README.md)** — leia primeiro.

**Convenções desta página**

- `{db}` / `{database_name}` = `COBwebRCBAUTOS` | `COBwebRCBCONSUMER` | `todos`
  (exceto onde indicado).
- Datas em `YYYY-MM-DD`. `dateFrom`/`dateTo` (ou `date_from`/`date_to`) andam
  **em par**; mandar um só é **400**. Ausentes = **hoje**, salvo indicação.
- Todas as respostas usam o [envelope padrão](README.md#6-contrato-de-resposta),
  exceto onde marcado **⚠ fora do envelope**.
- 🔓 = devolve **PII** (CPF completo + nome do devedor).

**Atenção ao nome dos parâmetros de data — não é uniforme:**

| Grupo | Nomes |
|---|---|
| Gráficos/cards e `*-detalhe*` | `dateFrom` / `dateTo` |
| Agentes (`comparacao`, `detalhamento`, `produtividade*`) e `tabela-performance` | `date_from` / `date_to` |
| `/efetividade/*` | `date_from` / `date_to` |

Passar `date_from` numa rota que espera `dateFrom` é **ignorado em silêncio** e
você recebe o dia corrente.

---

## Índice

- [Shapes compartilhados](#shapes-compartilhados)
- [Acordos do dia](#acordos-do-dia)
- [Produtividade e agentes](#produtividade-e-agentes)
- [KPIs por portfólio e agente](#kpis-por-portfólio-e-agente)
- [Detalhe (drill-down)](#detalhe-drill-down)
- [Metas](#metas)
- [Efetividade de boletos](#efetividade-de-boletos)
- [Ritmo do dia](#ritmo-do-dia)
- [Regressão](#regressão)
- [Health](#health)
- [Admin — índices](#admin--índices)

---

## Shapes compartilhados

Documentados uma vez e referenciados adiante.

### `SHAPE_DETALHE` 🔓

Usado por `/dashboard/{tipo}-detalhe/{db}/{portfolio}` e
`/dashboard/{tipo}-detalhe-agente/{db}/{agente}`. **Uma linha por acordo**
(`PARCELA = 0`), não por parcela.

| Campo | Tipo | Descrição |
|---|---|---|
| `NR_RECEBIMENTO` | str | Número do acordo |
| `ID_CARTEIRA` | int | Carteira |
| `valor_primeira_parcela` | decimal | Valor da entrada |
| `valor_total` | decimal | Soma de todas as parcelas do acordo |
| `agente` | str | `USU_MASTER.NOME` |
| `matricula` | str | `USU_MASTER.MATRICULA` |
| `cpf_mask` 🔓 | str | **CPF/CNPJ completo** — o nome é legado |
| `nome_devedor` 🔓 | str | Nome do devedor |
| `data_acordo` | datetime | `DT_EMISSAO` |
| `data_vencimento` | date | `DT_VENCIMENTO` |
| `total_parcelas` | int | Contagem de parcelas |

### `SHAPE_DETALHE_TODOS` 🔓

Usado pelas rotas `*-detalhe-todos/{db}`. Igual a `SHAPE_DETALHE` **mais**:

| Campo | Tipo | Descrição |
|---|---|---|
| `portfolio_name` | str \| null | Carteira; **pode ser `null`** (usa `OUTER APPLY`) |

> Diferença que muda contagem: as rotas `*-detalhe-todos` usam **`OUTER APPLY`**
> e mantêm acordos sem carteira; as rotas por portfólio usam **`CROSS APPLY`
> (inner)** e os descartam. As duas **não fecham** entre si.

### `SHAPE_AGENTES`

Usado por `/comparacao-agentes`, `/detalhamento-agentes` e `/produtividade`
— **as três executam a mesma query**.

| Campo | Tipo | Descrição |
|---|---|---|
| `origem` | str | Banco de origem |
| `NOME` / `CHAVE` | str | Nome e login do agente |
| `qtd_acionamentos` | int | Tentativas |
| `qtd_alo` | int | Atendeu (Contato) |
| `qtd_contatos` | int | **CPC** (pessoa certa) |
| `qtd_acordos` | int | Acordos gerados |
| `qtd_boletos_emitidos` / `qtd_boletos_pagos` | int | Boletos |
| `valor_total_acordos` | decimal | **Soma de todas as parcelas** |
| `acordo_medio` | decimal | Ticket médio |
| `parcelamento_medio` | decimal | Média de parcelas |
| `valor_primeira_parcela` | decimal | Entrada emitida |
| `valor_p1_recebido` | decimal | Entrada recebida |
| `efetividade_boleto_pct` | decimal | pagos / emitidos |
| `cpc_percentual` | decimal | % de CPC |
| `desconto_medio_percentual` | decimal | ⚠ é o percentual que **sobrou**, não o desconto concedido |
| `qtd_excecoes` / `valor_excecoes` | int / decimal | Exceções (status 5) |
| `valor_primeira_parcela_excecoes` | decimal | Entrada em exceção |

---

## Acordos do dia

Grade **parcela a parcela** dos acordos emitidos hoje. As três rotas abaixo são
as **únicas paginadas** da API.

> ⚠ **Universo diferente do resto da API.** Estas rotas usam
> `ID_REC_STATUS IN (1, 3, 9, 12)` — incluem o status **9** (que não existe em
> nenhuma constante de configuração) e **não** são `STATUS_GERADOS`. Somar
> `valor_parcela` aqui **não reproduz** os KPIs.
>
> ⚠ **Uma linha por parcela.** `valor_total_acordo` se repete em todas as
> parcelas do mesmo acordo — somar essa coluna **multiplica** o valor.

### `GET /dashboard/acordos-hoje` 🔓

Banco **fixo** em `COBwebRCBAUTOS` (sem parâmetro para trocar).

| Query | Padrão | Faixa |
|---|---|---|
| `limit` | 500 | 1–5000 |
| `offset` | 0 | ≥ 0 |

**Resposta:** `agente`, `cpf_cnpj` 🔓, `nome_razao` 🔓, `valor_atualizado_divida`,
`valor_total_acordo`, `desconto_concedido`, `acordo`, `qtd_parcelas`,
`numero_parcela`, `data_emissao`, `data_vencimento`, `valor_parcela`,
`status_parcela`, `dt_pagamento`, `situacao_pagamento`.
`meta.pagination` = `{limit, offset, total, returned}`.

```bash
curl "http://127.0.0.1:8000/dashboard/acordos-hoje?limit=500&offset=0"
```

### `GET /dashboard/acordos-hoje/{database_name}` 🔓

Mesmo shape, banco escolhido no path.

### `GET /dashboard/acordos-hoje/todos` 🔓

Os dois bancos, com `banco_origem` em cada linha.
`meta.pagination` ganha `total_por_banco`.

> ⚠ **Paginação por banco, não global.** `limit=500` pode devolver **1000**
> linhas; `offset=500` pula 500 de **cada** banco. Não é fatia contínua.

### `GET /dashboard/acordos-hoje-agente/{db}` 🔓

Acordos do dia por agente. **Sempre o dia corrente** (`GETDATE()` do SQL Server)
— não aceita datas.

| Query | Padrão | Notas |
|---|---|---|
| `agente` | sem filtro | **Igualdade exata** contra `USU_MASTER.NOME` |
| `assessoria` | `todos` | Substring (`LIKE '%token%'`) contra `CHAVE`/`NOME` |

**Resposta:** `agente`, `cpf_cnpj` 🔓, `nome_devedor` 🔓, `nr_acordo`,
`tipo_acordo`, `vencimento_primeira_parcela`, `valor_primeira_parcela`,
`valor_demais_parcelas`, `qtd_parcelas`, `valor_total_acordo`, `data_emissao`.

> ⚠ `valor_demais_parcelas` é o valor da **parcela 1**, não a soma de 1..N —
> somar com `valor_primeira_parcela` **não** reconstrói `valor_total_acordo`.
> Usa `STATUS_UNIVERSO` (1,2,3,5,10,12), então **inclui exceções**: filtre por
> `tipo_acordo` se quiser só valor gerado.

---

## Produtividade e agentes

### `GET /dashboard/produtividade-hoje/{database_name}`

Rota mais rica em métricas por agente.

| Query | Padrão | Notas |
|---|---|---|
| `date_from` / `date_to` | hoje | Par obrigatório |
| `assessoria` | `todos` | Substring contra `CHAVE`/`NOME` |
| `portfolio` | todas | `DIV_AUX.CAMPO010`, **igualdade exata** |

**Resposta:** `CHAVE`, `NOME`, `qtd_acionamentos`, `qtd_alo`, `qtd_contatos`,
`cpc_percentual`, `qtd_acordos`, **`qtd_acordos_por_contrato`**,
`qtd_boletos_emitidos`, `qtd_boletos_pagos`, `acordos_percentual`,
`valor_acordos`, `acordo_medio`, `parcelamento_medio`,
`desconto_medio_percentual`, `valor_primeira_parcela`, `valor_p1_recebido`,
`qtd_excecoes`, `valor_excecoes`, `valor_primeira_parcela_excecoes`,
`qtd_rejeitados`, `valor_rejeitados`, `idade_media_acordos`, `horas_trabalhadas`.

> ⚠ `meta.filters.date` é **sempre** `"today"`, mesmo com período informado. Os
> dados respeitam o período; o rótulo não. Não use para legendar gráfico.
>
> ⚠ Com `portfolio`, `acordos_percentual` e `cpc_percentual` vêm **`null`** de
> propósito (esforço não é atribuível a carteira). Trate `null`, não `0`.
>
> ⚠ `horas_trabalhadas` é proxy pela janela de emissão: agente com um único
> acordo no dia recebe `0`.

### `GET /dashboard/comparacao-agentes/{db}`
### `GET /dashboard/comparacao-agentes/{database_name}`

**Os dois path templates acima são a mesma função** (dois decorators sobre o
mesmo handler) — não são endpoints distintos. Retorna `SHAPE_AGENTES`. Aceita
`date_from`/`date_to` (par).

> ⚠ Como os decorators são aplicados de baixo para cima, quem realmente atende as
> duas URLs é a variante `{database_name}`, e **`db` vira query param opcional**
> que **sobrescreve o path**:
> `/comparacao-agentes/todos?db=COBwebRCBAUTOS` responde **só AUTOS**.

### `GET /dashboard/detalhamento-agentes/{database_name}`

`SHAPE_AGENTES`. **Não filtra por agente** apesar do nome — devolve todos.

### `GET /dashboard/produtividade/{database_name}`

`SHAPE_AGENTES`. Alias operacional das anteriores.

> As três acima produzem **SQL idêntico** e compartilham a mesma entrada de
> cache. Não confunda com `/produtividade-hoje` (outro conjunto de colunas) nem
> com `/produtividade-agentes` (fora do envelope).

### `GET /dashboard/produtividade-agentes` ⚠ fora do envelope

Consolidado dos **dois** bancos em paralelo. Não aceita escolha de banco nem data
(sempre hoje).

| Query | Padrão |
|---|---|
| `force_refresh` | `false` |

**Resposta:** `{ generated_at, cache_age_seconds, agents: [...] }` — cada agente
tem `agent_key`, `login`, `name`, `by_database`, `total`.

> Cache próprio (TTL 60s); `force_refresh` afeta **só** esta rota.

### `GET /dashboard/tabela-performance-periodo/{db}`

| Query | Padrão | Notas |
|---|---|---|
| `date_from` | **`2026-04-01`** | Janela histórica fixa |
| `date_to` | **`2026-05-06`** exclusivo | ou seja, até 2026-05-05 |
| `agente` | sem filtro | Igualdade exata |

**Resposta:** `nome_agente`, `matricula`, `qtd_acionamentos`, `qtd_alo`,
`qtd_contatos`, `qtd_acordos`, `qtd_boletos_emitidos`, `qtd_boletos_pagos`,
`conversao_pct`, `pagos_por_cpc_pct`, `valor_total`, `soma_primeira_parcela`,
`qtd_reprovados`, `cpc_pct`, `qtd_excecoes`, `valor_excecoes`.

> ⚠ **Sem datas, NÃO devolve hoje** — devolve a janela histórica acima.
>
> ⚠ **`conversao_pct` muda de fórmula conforme o banco:** `acordos/contatos` com
> `todos`; `pagos/contatos` com banco individual (que também não devolve
> `pagos_por_cpc_pct`). Trocar o banco muda a **definição** da métrica.
>
> ⚠ `qtd_reprovados` casa por `LIKE` na descrição do status, não por
> `ID_REC_STATUS = 7`.

### `GET /dashboard/benchmarks/{db}` — não aceita `todos`

| Query | Padrão | Faixa |
|---|---|---|
| `lookback_months` | 3 | 1–12 |

**Resposta (`data` é objeto):** `taxa_contato`, `taxa_conversao`,
`efetividade_caixa`, `pct_excecoes`, `n_agentes`, `lookback_months`.

> ⚠ `meta.total_rows` = 6 (chaves do objeto) — **não** é contagem de agentes.
> `avg_taxa_contato` aqui é `contatos/alô`, que o dicionário chama de "Taxa de
> CPC" — o rótulo diverge. Só entram dias com ≥ 5 acionamentos.

### `GET /dashboard/status-carga/{db}`

Sanidade da carga. **Única rota tolerante a falha parcial.**

| Query | Padrão |
|---|---|
| `assessoria` | `todos` |

**Resposta:** `database`, `agentes`, `qtd_acionamentos`, `qtd_contatos`,
`qtd_acordos`, `valor_acordos`, `qtd_excecoes`, `valor_excecoes`.
`meta.quality` = `{status, targets, sources_ok, sources_error, numeric_cast_failures}`.

> ⚠ Com `todos`, **acrescenta uma linha `database: "todos"`** que é a soma das
> outras — somar `data[]` inteiro **conta duas vezes**. Essa linha só existe se
> os dois bancos responderem.
>
> ⚠ Banco fora devolve **HTTP 200** com `quality.status = "partial"`. Monitor que
> olha só o status code nunca vê a degradação.

### `GET /dashboard/portfolios/{database_name}` — não aceita `todos`

Lista de carteiras para preencher filtros. **Resposta:** `id`, `nome` (mesmo
valor). Reenvie em `?portfolio=` de `/produtividade-hoje`.

> ⚠ Valores podem vir com espaço à direita e precisam casar **byte a byte**.

---

## KPIs por portfólio e agente

Todas aceitam `dateFrom`/`dateTo` (par, padrão hoje) e todas medem
**`PARCELA = 0`** (a entrada), não o valor total do acordo.

| Endpoint | Campos de `data[]` | Status |
|---|---|---|
| `GET /dashboard/primeira-parcela-dia/{db}` | `total_valor`, `total_acordos` | Gerados |
| `GET /dashboard/primeira-parcela-por-portfolio/{db}` | `portfolio_name`, `qtd_acordos`, `valor_primeira_parcela` | Gerados |
| `GET /dashboard/acordos-por-portfolio/{db}` | `portfolio_name`, `qtd_acordos`, `valor_acordos` | Gerados |
| `GET /dashboard/excecoes-por-portfolio/{db}` | `portfolio_name`, `qtd_excecoes`, `valor_excecoes` | 5 |
| `GET /dashboard/rejeitados-por-portfolio/{db}` | `portfolio_name`, `qtd_rejeitados`, `valor_rejeitados` | 7 |
| `GET /dashboard/quebrados-por-portfolio/{db}` | `portfolio_name`, `qtd_quebrados`, `valor_quebrados` | 2 |
| `GET /dashboard/excecoes-por-agente/{db}` | `agente`, `qtd_excecoes`, `valor_excecoes` | 5 |
| `GET /dashboard/primeira-parcela-por-agente/{db}` | `agente`, `qtd_acordos_primeira_parcela`, `valor_primeira_parcela` | Gerados |
| `GET /dashboard/portfolio-rollup/{db}` | `portfolio_name`, `id_rec_status`, `qtd`, `valor` | 1,2,3,5,7,10,12 |
| `GET /dashboard/real-por-portfolio/{db}` | `portfolio_name`, `qtd_acordos`, `valor_recebido`, `valor_primeira_parcela` | Gerados |
| `GET /dashboard/excecoes-sem-portfolio/{db}` 🔓 | `SHAPE_DETALHE` reduzido (sem `matricula`/datas) | 5 |

`/primeira-parcela-dia` e `/primeira-parcela-por-agente` também aceitam
`assessoria`.

**Pontos que mudam o número:**

- **`valor_acordos` de `/acordos-por-portfolio` é a 1ª parcela** — numericamente
  idêntico a `valor_primeira_parcela` de `/primeira-parcela-por-portfolio`
  (mesmo SQL, alias diferente). O alias engana.
- **Sobreposição intencional:** status 2 está dentro de `STATUS_GERADOS`, então
  todo acordo de `/quebrados-por-portfolio` **também** está em
  `/acordos-por-portfolio`. Não subtraia.
- `/quebrados-por-portfolio` cobre **só QUEBRA(2)**, não QUEBRA AUTOMÁTICA(10).
- **`CROSS APPLY` inner:** acordo sem carteira resolvível **some**. Para
  exceções, o resíduo está em `/excecoes-sem-portfolio` — some os dois para
  fechar o total. Para acordos gerados **não há** rota de resíduo.
- `/excecoes-por-agente` **não** faz join de portfólio, então enxerga **todas**
  as exceções: seu total é ≥ o de `/excecoes-por-portfolio`.
- **`/real-por-portfolio` filtra `DT_PAGAMENTO`** (e exige `VR_PAGO > 0`), não
  `DT_EMISSAO`. Aqui `valor_primeira_parcela` é entrada **recebida**; na rota por
  agente, o campo homônimo é valor **emitido**. Nomes iguais, semânticas opostas.
- **`/portfolio-rollup`** reproduz os demais fatiando `id_rec_status`. `valor` é
  sempre aditivo; `qtd` só é aditivo em fatias de status único (o
  `COUNT(DISTINCT)` é por status). Status 7 entra aqui mas **não** é `STATUS_GERADOS`.

---

## Detalhe (drill-down)

Linha por acordo, **com PII**. Nenhuma pagina.

| Endpoint | Shape | Status |
|---|---|---|
| `GET /dashboard/acordos-detalhe/{db}/{portfolio}` 🔓 | `SHAPE_DETALHE` | Gerados |
| `GET /dashboard/excecoes-detalhe/{db}/{portfolio}` 🔓 | `SHAPE_DETALHE` | 5 |
| `GET /dashboard/rejeitados-detalhe/{db}/{portfolio}` 🔓 | `SHAPE_DETALHE` | 7 |
| `GET /dashboard/quebrados-detalhe/{db}/{portfolio}` 🔓 | `SHAPE_DETALHE` | 2 |
| `GET /dashboard/acordos-detalhe-todos/{db}` 🔓 | `SHAPE_DETALHE_TODOS` | Gerados |
| `GET /dashboard/excecoes-detalhe-todos/{db}` 🔓 | `SHAPE_DETALHE_TODOS` | 5 |
| `GET /dashboard/rejeitados-detalhe-todos/{db}` 🔓 | `SHAPE_DETALHE_TODOS` | 7 |
| `GET /dashboard/excecoes-detalhe-agente/{db}/{agente}` 🔓 | `SHAPE_DETALHE` | 5 |
| `GET /dashboard/rejeitados-detalhe-agente/{db}/{agente}` 🔓 | `SHAPE_DETALHE` | 7 |
| `GET /dashboard/quebrados-detalhe-agente/{db}/{agente}` 🔓 | `SHAPE_DETALHE` | 2 |

Todas aceitam `dateFrom`/`dateTo` (par, padrão hoje).

> ⚠ **Não existe** `/acordos-detalhe-agente` nem `/quebrados-detalhe-todos`.
> ⚠ `{agente}` casa por **igualdade exata** em `U.NOME`: acento, caixa ou espaço
> diferente devolve `data: []` com HTTP 200. Agentes da lista de exclusão sempre
> devolvem vazio.
> ⚠ `*-detalhe-todos` pode devolver **milhares de linhas de PII** num único GET.

```bash
curl "http://127.0.0.1:8000/dashboard/acordos-detalhe-todos/todos?dateFrom=2026-08-01&dateTo=2026-08-13"
```

---

## Metas

### `GET /dashboard/metas` ⚠ contrato duplo

**Resposta:** `escritorio`, `portfolio`, `grupo`, `qtd_negociadores`,
`meta_caixa`, `meta_retomadas_qtd`, `meta_retomadas_valor`, `meta_pnt`.

> ⚠ **Dois shapes:** com o arquivo presente devolve **JSON cru** (chave `metas`);
> ausente devolve **envelope** com `errors`. Cliente que só lê `data` recebe
> `undefined` no caminho feliz.
> ⚠ Lê por caminho **relativo** (`dados_metas/…`) enquanto o upload grava em
> caminho **absoluto** — se o diretório de trabalho não for a raiz, um grava num
> lugar e o outro lê de outro. `dados_metas/` não é versionado.

### `POST /dashboard/metas/upload` ⚠ falha com HTTP 200

`multipart/form-data`, campo **`file`** (PDF). Teto de **20 MB**.

> ⚠ **Nenhuma falha vira 4xx/5xx** — sempre 200 com `errors[]`. Cheque
> `errors.length`.
> ⚠ O `Content-Type` **não** é validado, só a extensão do nome.
> ⚠ O período é inferido do **nome do arquivo**; nome genérico pode sobrescrever
> o trimestre errado. `ultimas_metas.json` é sobrescrito **sem backup**.
> ⚠ Proteção CSRF só bloqueia `Origin` conhecido-e-não-autorizado; cliente sem
> `Origin` (curl) passa.

---

## Efetividade de boletos

**Taxonomia — use para escolher a rota certa:**

| Eixo | Opções |
|---|---|
| Parcela | `primeira` = `PARCELA = 0` · `colchao` = `PARCELA > 0` |
| Data | sem sufixo = por `DT_EMISSAO` · `-vencimento` = por `DT_VENCIMENTO` |
| Grão | `diaria` · `mensal` · `mensal-agente` |

> **Para medir cobrança use `-vencimento`. Para medir produção use a variante sem
> sufixo.** Agrupar por emissão joga no denominador boletos que ainda nem
> venceram, então os períodos recentes parecem estruturalmente ruins.

### Séries (ETL) — todas aceitam só `?db=`

Sem parâmetro de data: a série é **completa desde 2026-01-01**; recorte é
responsabilidade do cliente.

| Endpoint | Campos |
|---|---|
| `GET /efetividade/diaria-primeira` | `Dia_Emissao`, `Boletos_Gerados`, `Pagos_No_Prazo`, `Conversao_Prazo_5d` |
| `GET /efetividade/mensal-primeira` | `Ano`, `Mes`, + idem |
| `GET /efetividade/diaria-colchao` | `Dia_Emissao`, `Boletos_Gerados_Colchao`, `Pagos_No_Prazo`, `Conversao_Colchao` |
| `GET /efetividade/mensal-colchao` | `Ano`, `Mes`, + idem |
| `GET /efetividade/diaria-colchao-vencimento` | `Dia_Vencimento`, + idem |
| `GET /efetividade/mensal-colchao-vencimento` | `Ano`, `Mes`, + idem |
| `GET /efetividade/mensal-agente-primeira` | `Agente`, `Ano`, `Mes`, `Boletos_Gerados`, `Pagos_No_Prazo`, `Conversao_Prazo_5d` |
| `GET /efetividade/mensal-agente-colchao` | `Agente`, `Ano`, `Mes`, + colchão |
| `GET /efetividade/mensal-agente-colchao-vencimento` | idem + `Quebrados` |

> ⚠ **Nomes de coluna mudam entre "primeira" e "colchão"**
> (`Boletos_Gerados` vs `Boletos_Gerados_Colchao`; `Conversao_Prazo_5d` vs
> `Conversao_Colchao`). Componente genérico quebra em silêncio.
> ⚠ **`Ano`/`Mes` são inteiros separados** — monte o rótulo no cliente.
> ⚠ **Séries `-vencimento` incluem datas futuras** com conversão 0. Trunque.
> ⚠ **`mensal-agente-colchao-vencimento` tem `HAVING COUNT(*) >= 10`** silencioso
> — não use como total, só como ranking.
> ⚠ **`Agente` aqui é `U.CHAVE`**; em `/boletos-detalhe` e `/dashboard/*` é
> `U.NOME`. Não cruze por string.
> ⚠ Não existe `mensal-primeira-vencimento`.
> ⚠ Dados vêm de ETL em background (TTL 1h) — mais velhos que `/dashboard/*`.

### `GET /efetividade/resumo` ⚠ fora do envelope

KPIs frescos (não é ETL). Período é **sempre por vencimento**.

| Query | Obrigatório | Padrão |
|---|---|---|
| `date_from` / `date_to` | **sim** | — |
| `db` | não | `todos` |
| `parcela_tipo` | não | `primeira` (ou `colchao`) |
| `id_portfolio` | não | sem filtro |

**`data` (objeto):** `generated`, `total_acordos`, `to_mature`, **`em_carencia`**,
`overdue_unpaid`, `paid_on_time`, `broken`, `conversion_pct`, `amount_maturing`,
`amount_received`, `effectiveness_pct`, `best_day`, `worst_day`.

> ⚠ **Duas definições de "pago" convivem:** `conversion_pct` usa pago **dentro
> dos 5 dias**; `amount_received`/`effectiveness_pct` usam **qualquer** pagamento.
> Por isso `effectiveness_pct` pode ser bem maior — não são a mesma coisa.
> ⚠ **Os KPIs não são partição:** `to_mature + em_carencia + overdue_unpaid +
> paid_on_time + broken` **não fecha** em `generated` (status 2 cruza as faixas).
> ⚠ **`em_carencia`** separa "vencido mas ainda nos 5 dias de carência" de perda
> real — antes ficava tudo em `overdue_unpaid`, inflando o número.
> ⚠ **`id_portfolio` é `REC_MASTER.ID_CARTEIRA`**, não o `CAMPO010`. E
> `/boletos-detalhe` **não** aceita esse filtro — resumo filtrado por carteira
> não tem drill-down equivalente.

### `GET /efetividade/boletos-detalhe` 🔓

| Query | Obrigatório | Valores |
|---|---|---|
| `kind` | **sim** | `a_vencer` · `em_carencia` · `vencidos_nao_pagos` · `quebrados` · `pagos_prazo` |
| `date_from` / `date_to` | **sim** | `YYYY-MM-DD` |
| `db` | não | padrão `todos` |
| `parcela_tipo` | não | `primeira` (padrão) · `colchao` |

> ⚠ **`TOP 500` por valor**, sem offset — são os 500 maiores, não uma página.
> Cheque **`meta.pagination.truncated`** antes de somar; só reconcilia com
> `/resumo` quando `truncated = false`.
> ⚠ `a_vencer` e `vencidos_nao_pagos` usam `GETDATE()`: a mesma URL devolve
> conjuntos diferentes ao atravessar a meia-noite.
> ⚠ Para bater com o card, repita **exatamente** `date_from`, `date_to`, `db` e
> `parcela_tipo` do `/resumo`.

### `GET /efetividade/curva-quebra`

| Query | Obrigatório |
|---|---|
| `date_from` / `date_to` | **sim** |
| `db` | não |

> ⚠ **Universo diferente de todo o resto** — três divergências que impedem
> reconciliação: (1) status `(1,2,3,12)`, **sem** o 10; (2) **nenhum** filtro de
> agente (não faz join com `USU_MASTER`), então SERASA/ANTLIA/SISTEMA entram;
> (3) `PARCELA = 0` fixo — não há visão de colchão.
> ⚠ **É uma fotografia de hoje**, não série estável: as faixas usam idade até
> `GETDATE()`, então a mesma URL devolve números diferentes amanhã. Não compare
> entre dias.

---

## Ritmo do dia

### `GET /dashboard/ritmo-dia/{db}`

Esperado × realizado por hora. Sem query params.

> ⚠ **Só opera 08h–19h em dia útil.** Fora disso devolve **200** com
> `em_operacao: false` e `bandas: []` — **sem tocar o modelo**. Um smoke test
> noturno passa mesmo com o modelo quebrado.
>
> Requer os artefatos em `deploy/` (**incluídos neste pacote**):
> `knn_phase2_model.joblib`, `knn_phase2_scaler.joblib`, `phase1_lookup.json`,
> `ticket_lookup.json`. Sem eles a rota responde **500** em horário de operação.
>
> ⚠ `generated_at` aqui é hora **local sem offset**; as rotas com envelope usam
> **UTC com offset**. Não compare cegamente.

---

## Regressão

### `POST /regressao/agentes` ⚠ falha com HTTP 200

```json
{ "pontos": [ { "id": "AG1", "cpc": 12.5, "eficiencia": 0.8, "valor": 15000 } ] }
```

`pontos`: array de objetos, **máx. 5000**.

> ⚠ **Nenhuma falha gera status de erro** — lista vazia ou exceção no ajuste
> voltam **200** com `errors[]` preenchido e `data: []`.
> ⚠ **Omitir `id` colapsa o dataset:** a deduplicação usa `p.get("id")`; sem a
> chave, todos ficam `None`, o primeiro entra e **todo o resto vira duplicado**.
> 400 pontos viram 1, sem mensagem de erro. **Sempre envie `id`.**
> ⚠ Campo faltando = ponto **descartado em silêncio** (veja `meta.removed_nulls`).
> ⚠ Envie **números**, nunca strings — string escapa do filtro de nulos e explode
> depois como erro genérico com HTTP 200.
> ⚠ O modelo `loglog` tem coeficientes e R² em **espaço logarítmico** — não são
> comparáveis com os outros quatro.
> ⚠ Com exatamente 3 pontos, os 5 modelos voltam **zerados** (parecem válidos e
> não são). Filtre por `cv_train_n`.

---

## Health

⚠ **Fora do envelope.** Exigem auth quando `REQUIRE_API_AUTH=true` — monitor sem
credencial reporta downtime falso. Não entram no rate limit.

| Endpoint | Descrição |
|---|---|
| `GET /health/live` | Processo no ar. **Não** toca o banco. |
| `GET /health/ready` | Pronto para tráfego; mapa por banco + status do ETL |
| `GET /health/db` | Sonda **todos** os bancos |
| `GET /health/db/{database_name}` | Sonda um banco; **não** aceita `todos` (400) |

**Resposta:** `{status, database, connection}` · `503` quando falha.

> ⚠ `/health/db` é **tudo ou nada**: um banco fora derruba para 503 mesmo com o
> outro perfeito. Para granularidade use `/health/ready`.
> ⚠ `/health/ready` e `/health/db` **expõem a mensagem crua do driver ODBC** no
> corpo do 503; `/health/db/{db}` não (só `"Falha no healthcheck do banco."`).
> ⚠ Um ETL vencido **não** marca `degraded` — só a sonda de banco decide.

---

## Admin — índices

Requer **`ENABLE_INDEX_ADMIN=true`** (senão **403**). Só banco único — **não**
aceita `todos`. Ordem dos gates: `401 → 403 → 400`.

### `GET /admin/indexes/status/{database_name}`

Read-only. Estado de cada índice recomendado.

### `POST /admin/indexes/apply/{database_name}`

| Query | Padrão |
|---|---|
| `dry_run` | **`true`** |
| `online` | `false` |
| `update_statistics` | `false` |

**Idempotente:** índice existente vira `skipped_existing`, nunca recria.

> ⚠ **Falha parcial silenciosa:** cada `CREATE` tem try/except próprio — uma
> falha (típico: `online=true` em SQL Server Standard) **não** aborta o laço nem
> muda o status HTTP. A resposta é 200; inspecione item a item.
> ⚠ **Sem rollback** — commit por índice, sem transação do conjunto.
> ⚠ No `dry_run`, `update_statistics` lista **todas** as tabelas; na execução real
> só as que tiveram índice criado. O dry-run superestima.
> ⚠ Volte `ENABLE_INDEX_ADMIN=false` e reinicie após a janela.
