# AgDash API — Guia de Integração

API REST (FastAPI) de **leitura** sobre os bancos de cobrança em SQL Server.
Este pacote contém **apenas o backend** — sem frontend.

> **Leia este arquivo inteiro antes de escrever ou gerar código contra esta API.**
> Vários campos têm nomes que não descrevem o conteúdo (`cpf_mask` devolve CPF
> completo; `valor_acordos` é a 1ª parcela, não o acordo inteiro), e há rotas que
> devolvem **HTTP 200 em caso de falha**. Integrar por intuição a partir dos nomes
> produz números errados que parecem certos.

| Documento | Para quê |
|---|---|
| **README.md** (este) | Conceitos, autenticação, contrato, erros, segurança, FAQ |
| **[ENDPOINTS.md](ENDPOINTS.md)** | Referência completa dos 57 endpoints |

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Início rápido](#2-início-rápido)
3. [Conceitos de domínio](#3-conceitos-de-domínio-leia-antes-da-referência)
4. [Autenticação](#4-autenticação)
5. [Convenções](#5-convenções)
6. [Contrato de resposta](#6-contrato-de-resposta)
7. [Erros e status codes](#7-erros-e-status-codes)
8. [Paginação](#8-paginação)
9. [Rate limiting](#9-rate-limiting)
10. [Cache e frescor do dado](#10-cache-e-frescor-do-dado)
11. [Regras de negócio](#11-regras-de-negócio-implementadas-no-sql)
12. [PII e segurança](#12-pii-e-segurança)
13. [Armadilhas conhecidas](#13-armadilhas-conhecidas)
14. [Perguntas frequentes](#14-perguntas-frequentes)
15. [Configuração (.env)](#15-configuração-env)

---

## 1. Visão geral

**O que é:** camada de leitura analítica sobre `COBwebRCBAUTOS` e
`COBwebRCBCONSUMER`. Agrega acordos, produtividade de agentes, exceções,
efetividade de boletos e metas.

**Para que serve:** obter números **já com as regras de negócio aplicadas**.
Os filtros de status, exclusão de agentes e resolução de carteira estão dentro
do SQL. Reimplementar isso do lado do consumidor é a principal fonte de
divergência de números.

**O que NÃO é:**

- Não é OLTP. Não há escrita de dados de negócio (a única escrita é o upload do PDF de metas).
- Não tem consistência transacional — todas as leituras usam `WITH (NOLOCK)`.
- Não é multi-tenant e não tem noção de usuário final. Auth é uma chave única de serviço.

**Stack:** Python 3.8+, FastAPI, pyodbc, ODBC Driver 17 for SQL Server.

---

## 2. Início rápido

### Pré-requisitos

- Python 3.8+
- **ODBC Driver 17 for SQL Server** instalado no sistema operacional
- Acesso de rede ao SQL Server
- Arquivo `.env` preenchido (use `.env.example` como base)

### Instalação

```bash
python -m pip install -r requirements.txt
```

### Subir a API

```bash
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

> Use uma porta livre na sua máquina. **A porta 8000 do servidor de produção já
> está ocupada pelo serviço `AgecobAPI`** — não suba uma segunda instância lá.

### Primeira chamada

```bash
curl http://127.0.0.1:8000/health/db
```

Resposta esperada:

```json
{ "status": "ok", "databases": { "COBwebRCBAUTOS": "ok", "COBwebRCBCONSUMER": "ok" } }
```

Se retornar `503`, a conexão com o banco falhou — veja
[Perguntas frequentes](#14-perguntas-frequentes).

### Um dado real

```bash
curl "http://127.0.0.1:8000/dashboard/primeira-parcela-dia/todos"
```

### Documentação interativa

Com `REQUIRE_API_AUTH=false` (padrão), o Swagger fica em `http://127.0.0.1:8000/docs`.

> Com `REQUIRE_API_AUTH=true`, `/docs`, `/redoc` e `/openapi.json` **deixam de
> existir** (404) — é proposital, para não expor o schema na rede.

---

## 3. Conceitos de domínio (leia antes da referência)

Sem esta seção os nomes dos campos enganam.

### 3.1 O funil de cobrança

É **monotônico** — cada etapa é subconjunto da anterior:

```
Acionamento  →  Contato (Alô)  →  CPC  →  Acordo  →  1ª Parcela
```

| Etapa | Campo na resposta | Definição no banco | Pergunta que responde |
|---|---|---|---|
| Acionamento | `qtd_acionamentos` | linhas de `CTO_MASTER` no período | "Quantas tentativas?" |
| **Contato (Alô)** | `qtd_alo` | `CTO_COMPLEMENTO.ALO = 1` | "Alguém atendeu?" |
| **CPC** | `qtd_contatos` | `COD_COMPLEMENTO IN ('449','452','453','454','455','459')` | "Falei com a pessoa certa?" |
| Acordo | `qtd_acordos` | acordos gerados | "Fechou?" |
| 1ª Parcela | `valor_primeira_parcela` | `PARCELA = 0` | "Quanto de entrada?" |

> **Atenção ao vocabulário.** "CPC" é uma **contagem** (`qtd_contatos`), nunca um
> percentual. E o campo chamado `qtd_contatos` é o **CPC**, não o "Contato/Alô" —
> os nomes estão invertidos em relação à intuição. `qtd_alo` é que é o "Contato".

### 3.2 Status de acordo (`ID_REC_STATUS`)

| Conjunto | Valores | Significado |
|---|---|---|
| Aprovados | `1, 3, 12` | Ativo + baixas por pagamento |
| **Gerados** (`STATUS_GERADOS`) | `1, 2, 3, 10, 12` | Aprovados + QUEBRA(2) + QUEBRA AUTOMÁTICA(10) |
| Exceção | `5` | O enum do banco chama de `PENDENTE`; o negócio chama de "Exceção" |
| Rejeitado | `7` | Supervisor/banco negou |
| Quebrado | `2` | Acordo quebrado |

**A base de valor é `STATUS_GERADOS`, não "aprovados".** Um acordo firmado hoje
conta no valor gerado de hoje **mesmo que quebre depois** — quebrar é desfecho
posterior. Por isso status 2 e 10 entram.

Consequência prática: `/dashboard/quebrados-por-portfolio` e
`/dashboard/acordos-por-portfolio` **se sobrepõem de propósito**. Não subtraia um
do outro esperando "acordos líquidos".

### 3.3 Os dois grãos de contagem de acordos

Existem **duas** contagens diferentes, e usar a errada distorce métricas:

| Campo | Grão | Onde usar |
|---|---|---|
| `qtd_acordos` | por acordo | rankings, por agente, **ticket médio**, **Conversão %** |
| `qtd_acordos_por_contrato` | por contrato/dívida | **só** o card global "Qtd Acordos" |

`qtd_acordos_por_contrato` conta `DISTINCT (NR_RECEBIMENTO, ID_CARTEIRA, ID_DIVIDA)`
— um acordo que agrupa N dívidas conta N. **Nunca use como denominador**: dividir
valor por contratos subestima o ticket médio.

### 3.4 Portfólio (carteira)

"Portfólio" = `DIV_AUX.CAMPO010` (texto), resolvido por `CROSS APPLY TOP 1`.

> **`id_portfolio` do `/efetividade/resumo` é outra coisa:** filtra
> `REC_MASTER.ID_CARTEIRA` (a carteira do sistema), **não** o `CAMPO010`. São
> dimensões diferentes com nomes parecidos.

A maioria das rotas por-portfólio usa `CROSS APPLY` **INNER**: acordo cuja
carteira não resolve **desaparece do resultado**. Para exceções há o resíduo em
`/dashboard/excecoes-sem-portfolio`; para acordos gerados **não existe**
endpoint equivalente.

### 3.5 Fórmulas oficiais

| Métrica | Fórmula | Unidade |
|---|---|---|
| CPC | `Σ qtd_contatos` | contagem |
| Taxa de contato | `Σ qtd_alo / Σ qtd_acionamentos` | % |
| **Conversão** | `Σ qtd_acordos / Σ qtd_contatos × 100` | % |
| Ticket médio | `Σ valor_acordos / Σ qtd_acordos` | R$ |
| Composição de entrada | `valor_1ª_parcela / valor_acordos × 100` | % |
| Efetividade de caixa | `valor_p1_recebido / valor_primeira_parcela × 100` | % |

> O denominador de Conversão é **CPC**, nunca boletos emitidos.

---

## 4. Autenticação

Controlada por `REQUIRE_API_AUTH` (padrão **`false`** — sem autenticação).

Com `REQUIRE_API_AUTH=true`, **os dois headers são obrigatórios**:

```
X-API-Key: <API_KEY>
Authorization: Bearer <API_TOKEN>
```

```bash
curl -H "X-API-Key: $API_KEY" \
     -H "Authorization: Bearer $API_TOKEN" \
     http://127.0.0.1:8000/dashboard/primeira-parcela-dia/todos
```

**Prefixos protegidos:** `/dashboard/`, `/efetividade/`, `/regressao/`,
`/health/`, `/admin/`. Qualquer outro caminho passa sem auth.

Detalhes que costumam custar tempo:

- O header `Authorization` é comparado **byte a byte** contra `Bearer <token>`.
  `bearer` minúsculo ou espaço extra reprova.
- Mandar só um dos dois headers dá **401**.
- `REQUIRE_API_AUTH=true` com `API_KEY`/`API_TOKEN` vazios devolve **500**, não 401.
- `/health/` também exige auth — um monitor de uptime sem credencial reporta
  downtime falso.
- Respostas 401/429/503 **não levam headers CORS** e não levam `X-Run-Id`.

---

## 5. Convenções

### Base URL e alias `/api`

Todo endpoint responde também sob `/api`:

```
/dashboard/acordos-hoje   ==   /api/dashboard/acordos-hoje
```

O prefixo é removido antes do roteamento **e antes da decisão de auth** — não há
bypass por `/api`.

### Parâmetro de banco

`{db}` / `{database_name}` aceita:

| Valor | Efeito |
|---|---|
| `COBwebRCBAUTOS` | só esse banco |
| `COBwebRCBCONSUMER` | só esse banco |
| `todos` | os dois, agregados |

Exceções: `/dashboard/portfolios/{db}` e `/admin/*` **não** aceitam `todos`
(devolvem 400).

### Datas

Formato **`YYYY-MM-DD`**. Onde existem, `dateFrom`/`dateTo` andam **em par** —
mandar um sem o outro é **400**.

- O intervalo é **fechado no início e aberto no fim** (`>= from`, `< to+1dia`).
- `dateFrom > dateTo` são **trocados silenciosamente**, sem erro.
- Sem datas, o padrão é **hoje** (relógio do **servidor**), com exceções
  documentadas em [ENDPOINTS.md](ENDPOINTS.md).
- Nem toda rota aceita data. Passar `dateFrom` onde não é suportado é
  **ignorado em silêncio**, e você recebe o dia corrente achando que é o período.

### Tipos

`Decimal`, `datetime` e `date` chegam serializados em JSON (número e string ISO).
Valores monetários vêm como número — trate arredondamento no consumidor.

---

## 6. Contrato de resposta

Envelope padrão (**não existe campo `success`**):

```json
{
  "meta": {
    "generated_at": "2026-08-13T14:03:21.884512+00:00",
    "total_rows": 42,
    "sources": ["COBwebRCBAUTOS", "COBwebRCBCONSUMER"],
    "filters": { "date": "today", "database": "todos" },
    "run_id": "srv-9f2c1a4b7e01",
    "quality": {}
  },
  "data": [],
  "errors": []
}
```

| Chave | Significado |
|---|---|
| `generated_at` | UTC, momento em que o envelope foi montado. **Não** é a idade do dado — dado cacheado tem `generated_at` fresco. |
| `total_rows` | `len(data)` — linhas **desta** resposta. O total real fica em `meta.pagination.total`. |
| `sources` | Bancos que a rota **pretendia** consultar. É declaração de intenção, **não** prova de que responderam. |
| `filters` | Filtros aplicados. |
| `run_id` | Correlação de log; ecoado no header `X-Run-Id`. Cite em chamado de suporte. |
| `quality` | Diagnóstico da coleta. Vazio na maioria; preenchido em `/dashboard/status-carga`. |
| `pagination` | **Única chave condicional.** Ausência significa "esta rota não pagina". |

### Três rotas fogem do envelope

| Rota | Formato |
|---|---|
| `GET /dashboard/produtividade-agentes` | `{generated_at, cache_age_seconds, agents}` |
| `GET /efetividade/resumo` | `data` é **objeto**, não array; `meta` reduzido |
| `GET /dashboard/metas` | JSON cru quando o arquivo existe; envelope quando não existe |
| `GET /health/*` | formato próprio (ver [ENDPOINTS.md](ENDPOINTS.md)) |

---

## 7. Erros e status codes

| Status | Causa | Retry? |
|---|---|---|
| **200** | Sucesso — **mas veja o aviso abaixo** | — |
| **400** | Banco inválido; par de datas incompleto/malformado | Não |
| **401** | Credenciais ausentes/erradas | Não |
| **403** | `/admin/*` com `ENABLE_INDEX_ADMIN=false` | Não |
| **422** | `limit`/`offset` fora da faixa; `kind` inválido | Não |
| **429** | Rate limit — respeite o header `Retry-After` | Sim, com backoff |
| **500** | Erro de banco, config ausente, exceção não tratada | Geralmente não |
| **503** | Healthcheck falhou **ou** `ENABLE_VALIDATED_ROUTES=false` | Depende |
| **504** | Timeout de query (`DB_QUERY_TIMEOUT`, padrão 60s) | **Sim** |

**A distinção 504 vs 500 é deliberada:** 504 = lento (vale retry);
500 = quebrado (não vale).

### Formato do corpo de erro

Praticamente todo erro previsto sai como `HTTPException`, cujo corpo é
**apenas `detail`** — sem `meta`, sem `data`, sem `errors`:

```json
{ "detail": "Erro ao executar consulta no banco de dados." }
```

> **Escreva o parser assumindo `body.detail` como único campo confiável quando
> `status !== 200`.** A exceção é o handler global de erro não tratado (500), que
> devolve `detail` **e** o envelope.

### ⚠️ Rotas que falham com HTTP 200

Três rotas **nunca** devolvem status de erro. Checar só o status code trata falha
como sucesso:

| Rota | Como detectar a falha |
|---|---|
| `POST /dashboard/metas/upload` | `errors.length > 0` |
| `POST /regressao/agentes` | `errors.length > 0` e `data.length` |
| `GET /dashboard/status-carga/{db}` | `meta.quality.status !== "ok"` |

### `db=todos` **não** é tolerante a falha

Com `todos`, se **um** banco estiver fora, a resposta inteira vira **500** — você
não recebe os dados do banco saudável. A única exceção é
`/dashboard/status-carga`, que devolve 200 com `errors[]` e
`meta.quality.status = "partial"`.

---

## 8. Paginação

Só **três** rotas paginam: `/dashboard/acordos-hoje`,
`/dashboard/acordos-hoje/{database_name}` e `/dashboard/acordos-hoje/todos`.

| Param | Padrão | Faixa |
|---|---|---|
| `limit` | 500 | 1–5000 (fora disso: 422) |
| `offset` | 0 | ≥ 0 |

```json
"pagination": { "limit": 500, "offset": 0, "total": 1284, "returned": 500 }
```

> **Armadilha em `/acordos-hoje/todos`:** a janela é aplicada **por banco**, não
> no conjunto unificado. `limit=500` pode devolver **1000** linhas, e `offset=500`
> pula 500 de **cada** banco — não é uma fatia contínua. Para paginação correta,
> pagine cada banco separadamente e junte no cliente.

Todas as demais rotas devolvem o conjunto **inteiro, sem limite**. Algumas
(`*-detalhe-todos`) podem retornar milhares de linhas com PII.

`/efetividade/boletos-detalhe` é diferente: corta em **`TOP 500` por valor**, sem
offset. Confira `meta.pagination.truncated` antes de somar a lista.

---

## 9. Rate limiting

**75 requisições / 60 segundos**, por `(IP do cliente + X-API-Key)`.

- Aplica-se a `/dashboard/`, `/admin/`, `/regressao/`.
- **Não** se aplica a `/efetividade/` nem `/health/`.
- Vale mesmo com `REQUIRE_API_AUTH=false`.
- Resposta: `429` + header `Retry-After` (segundos).
- Valores são **fixos no código**, não configuráveis por `.env`.
- Estado é por processo: com `--workers 4` o teto efetivo é ~4×.

---

## 10. Cache e frescor do dado

Cache **em memória, por processo**, TTL padrão **60s** (`DASHBOARD_CACHE_TTL`;
`0` desliga).

- **Não existe API de invalidação.** Só expiração, evicção por limite (500
  entradas) ou restart do serviço.
- Com múltiplos workers, cada um tem seu cache — duas chamadas seguidas podem
  devolver idades diferentes.
- `generated_at` é sempre fresco, **mesmo com dado cacheado**. Não use para medir
  idade do dado.
- Erro **nunca** é cacheado.
- `force_refresh=true` existe **só** em `/dashboard/produtividade-agentes` e não
  afeta as demais rotas.
- **Single-flight:** chamadas concorrentes na mesma chave compartilham uma
  execução. Se a líder falhar, todas recebem o mesmo erro.

**Séries de `/efetividade/*`** vêm de um ETL em background com TTL próprio
(`EFETIVIDADE_ETL_TTL`, padrão **1 hora**) — são mais "velhas" que as demais
rotas por construção.

---

## 11. Regras de negócio (implementadas no SQL)

Já aplicadas pela API. **Não reimplemente no consumidor.**

| Regra | Valor |
|---|---|
| 1ª parcela | `PARCELA = 0` |
| Aprovados | `ID_REC_STATUS IN (1, 3, 12)` |
| Gerados (base de valor) | `IN (1, 2, 3, 10, 12)` |
| Exceção | `= 5` |
| Rejeitado | `= 7` |
| Quebrado | `= 2` |
| Pré-filtro das CTEs | `IN (1, 2, 3, 5, 10, 12)` |
| Boleto pago no prazo | `VR_PAGO > 0 AND DT_PAGAMENTO <= DT_VENCIMENTO + 5 dias` |
| Portfólio | `DIV_AUX.CAMPO010` via `CROSS APPLY TOP 1` |
| Filtro de data padrão | `DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha` |
| NOLOCK | obrigatório em toda leitura |

### Agentes excluídos — **dois filtros diferentes**

Este é o motivo nº 1 de números que "não fecham" entre páginas.

| Filtro | Onde | Critério |
|---|---|---|
| `FILTRO_AGENTES_EXCLUIDOS_SQL` | `/dashboard/*` | igualdade exata + prefixo: `COBDESANTOS`, `FT5SYSTEM`, `NEMBUSUSER`, `ANTLIA%`, `INTERNA%`, `SUPORTE%`, `SISTEMA%` |
| `FILTRO_AGENTES_EFETIVIDADE_SQL` | `/efetividade/*` | **substring** (`%...%`), e exclui **também `SERASA` e `NEMBUS`** |

**A divergência é intencional** (registrada no código). Consequência: totais de
`/efetividade/*` **não reconciliam** com `/dashboard/*`. Não trate como bug.

`/efetividade/curva-quebra` é ainda mais divergente: **não faz JOIN com
`USU_MASTER`**, então **nenhum** filtro de agente é aplicado, e usa status
`(1,2,3,12)` — **sem** o 10 (QUEBRA AUTOMÁTICA).

---

## 12. PII e segurança

### Dado pessoal exposto

Estas rotas devolvem **CPF/CNPJ completo** e **nome do devedor**:

| Rota | Observação |
|---|---|
| `/dashboard/acordos-hoje*` | `cpf_cnpj` + `nome_razao` |
| `/dashboard/*-detalhe/{db}/{portfolio}` | `cpf_mask` + `nome_devedor` |
| `/dashboard/*-detalhe-agente/{db}/{agente}` | idem, e a **URL contém o nome do funcionário** |
| `/dashboard/*-detalhe-todos/{db}` | **em massa**, sem paginação |
| `/dashboard/excecoes-sem-portfolio/{db}` | `cpf_mask` + `nome_devedor` |
| `/efetividade/boletos-detalhe` | `cpf_mask` + nome |

> **`cpf_mask` NÃO é mascarado.** O nome é legado; o campo devolve
> `DEV_MASTER.CPF_CNPJ` **inteiro**. É decisão consciente do projeto (2026-08-06),
> não bug. Alguns docstrings no código ainda dizem "CPF mascarado" — estão
> desatualizados.

**Obrigações de quem consome:**

- Não logar, não cachear em disco, não exportar sem controle de acesso.
- `*-detalhe-todos` pode devolver milhares de linhas de PII em um único GET —
  evite em telas abertas.
- URLs de `*-detalhe-agente` carregam nome de funcionário para logs de acesso,
  histórico de browser e Sentry.

### Saída de dados para terceiros — removida

A rota `POST /agente/chat` (agente de IA) **foi removida deste pacote**. Era o
único ponto da API que enviava dados para fora da rede — texto do usuário,
resultados de ferramentas, nomes e logins de agentes e, via `get_maiores_acordos`,
**CPF de devedor** — para um provedor de LLM externo.

Com a remoção, **nenhum endpoint desta API faz chamada de saída para terceiros.**
Todo tráfego é: cliente → API → SQL Server.

### Endpoints administrativos

`/admin/indexes/apply/*` **altera o schema** (cria índices). Mantenha
`ENABLE_INDEX_ADMIN=false` fora de janela de DBA. Use `dry_run=true` antes.

### Rede

Sem HTTPS na frente (proxy Caddy/nginx), **não exponha esta API fora de
localhost** — são dados de cobrança (PII) e o token trafega em texto puro.

---

## 13. Armadilhas conhecidas

Ordenadas por quanto tempo custam quando não se sabe.

1. **`ENABLE_VALIDATED_ROUTES=false` derruba todo o `/dashboard/*` com 503.**
   O padrão é `true`. As demais flags têm padrão `false` — esta é a exceção.

2. **`cpf_mask` devolve CPF completo.** Ver [PII](#12-pii-e-segurança).

3. **`valor_acordos` em `/acordos-por-portfolio` é a 1ª parcela**, não o valor
   total do acordo (`WHERE PARCELA = 0`). É numericamente idêntico ao
   `valor_primeira_parcela` de `/primeira-parcela-por-portfolio` — o alias é que
   engana. O valor total do acordo aparece como `valor_total_acordos` em
   `/comparacao-agentes`.

4. **Rotas que falham com HTTP 200** — ver [seção 7](#7-erros-e-status-codes).

5. **`/efetividade/*` não reconcilia com `/dashboard/*`** — filtros de agente
   diferentes, de propósito.

6. **Emissão vs vencimento em `/efetividade/*`.** Sem o sufixo `-vencimento`, a
   série é agrupada por `DT_EMISSAO`; com o sufixo, por `DT_VENCIMENTO`. Como
   "pago no prazo" só ocorre até 5 dias após o vencimento, agrupar por emissão faz
   os dias recentes parecerem **estruturalmente ruins**. Para medir cobrança use
   `-vencimento`; para medir produção use a variante sem sufixo.

7. **Séries de vencimento incluem datas futuras**, com conversão 0. Trunque em
   "hoje" no cliente.

8. **`/dashboard/status-carga/todos` inclui uma linha-resumo `database: "todos"`**
   dentro de `data[]`, que é a soma das outras. Somar `data[]` inteiro **conta
   tudo duas vezes**.

9. **`/dashboard/comparacao-agentes` tem dois decorators**, e um query param `db`
   **sobrescreve** o segmento do path:
   `/comparacao-agentes/todos?db=COBwebRCBAUTOS` responde só AUTOS.

10. **`/comparacao-agentes`, `/detalhamento-agentes` e `/produtividade` são a
    mesma query** — mudam só o rótulo de telemetria. `/detalhamento-agentes` não
    filtra por agente apesar do nome.

11. **Match de agente é igualdade exata** em `U.NOME`. Diferença de acento, caixa
    ou espaço devolve `data: []` com **HTTP 200**, sem aviso de "não encontrado".

12. **`/dashboard/produtividade-hoje` declara `filters.date = "today"` sempre**,
    mesmo com período informado. Os **dados** respeitam o período; o **rótulo**
    mente. Não use `meta.filters` para legendar gráfico nessa rota.

13. **`/dashboard/tabela-performance-periodo` muda a fórmula conforme o banco:**
    `conversao_pct` é `acordos/contatos` com `todos`, e `pagos/contatos` com banco
    individual. Sem datas, o padrão é uma janela histórica fixa (**não** é hoje).

14. **`/dashboard/acordos-hoje` usa status `(1,3,9,12)` hardcoded** — inclui o
    status **9**, que não existe em nenhuma constante de configuração, e não é
    `STATUS_GERADOS`. Somar `valor_parcela` daqui **não** reproduz os KPIs.
    Além disso é **uma linha por parcela**: `valor_total_acordo` se repete em
    todas as parcelas do mesmo acordo — somar essa coluna multiplica o valor.

15. **`/dashboard/real-por-portfolio` filtra por `DT_PAGAMENTO`**, não
    `DT_EMISSAO`. Comparar com `/acordos-por-portfolio` é comparar coisas
    diferentes.

16. **`/efetividade/mensal-agente-colchao-vencimento` tem `HAVING COUNT(*) >= 10`**
    silencioso — agentes com menos de 10 boletos somem. Use como ranking, nunca
    como total.

17. **`/efetividade/curva-quebra` é uma fotografia de hoje**, não uma série
    estável: as faixas usam idade até `GETDATE()`, então a mesma URL devolve
    números diferentes amanhã.

18. **Chave de agente muda entre rotas:** `/efetividade/*` (séries) devolve
    `Agente = U.CHAVE`; `/efetividade/boletos-detalhe` e `/dashboard/*` devolvem
    `U.NOME`. Cruzar por string **não casa**.

19. **`DB_POOL_TIMEOUT` é configuração morta** — é lida do `.env` mas nenhum
    código a consome. Ajustá-la não muda nada.

20. **`DB_POOL_SIZE` não limita concorrência.** O pool usa `get_nowait()`: fila
    vazia abre conexão nova na hora. Ele limita quantas ficam **guardadas**
    ociosas, não quantas existem sob pico.

---

## 14. Perguntas frequentes

**Preciso de acesso ao servidor de produção?**
Não. Este pacote roda em qualquer máquina com Python e rota de rede até o SQL
Server. Use o `.env` que você recebeu.

**Preciso de credencial direta do SQL Server?**
Não, e não é recomendado. As regras de negócio (status, exclusão de agentes,
resolução de carteira) estão no SQL desta API. Consultando o banco direto você
teria que reimplementá-las e provavelmente chegaria a números diferentes.

**Os números não batem com o dashboard. O que verifico?**
Nesta ordem: (1) mesmo `db`? (2) mesmo período — e a rota **aceita** período?
(3) está misturando `/efetividade/*` com `/dashboard/*` (filtros de agente
diferentes)? (4) está somando 1ª parcela achando que é valor total? (5) está
somando linhas por parcela como se fossem por acordo? (6) em
`/status-carga/todos`, contou a linha-resumo duas vezes?

**Por que `data` veio vazio com HTTP 200?**
Provavelmente filtro que não casou — nome de agente com acento/espaço diferente,
portfólio inexistente ou período sem movimento. A API não distingue "não
encontrado" de "vazio".

**Como sei se o dado está velho?**
`generated_at` **não** serve — é sempre fresco. Assuma até
`DASHBOARD_CACHE_TTL` (60s) para `/dashboard/*` e até `EFETIVIDADE_ETL_TTL`
(1h) para as séries de `/efetividade/*`.

**Qual endpoint uso para "quanto entrou de dinheiro"?**
`/dashboard/real-por-portfolio/{db}` (filtra `DT_PAGAMENTO`, exige `VR_PAGO > 0`).
As rotas de acordo medem valor **gerado**, não recebido.

**Posso paginar qualquer rota?**
Não — só as três de `/acordos-hoje`. As demais devolvem tudo.

**Recebi 504. Retento?**
Sim, com backoff — é timeout de query. Em **500** de banco, não.

**Recebi 503 e o banco está no ar.**
Verifique `ENABLE_VALIDATED_ROUTES`. Com `false`, todo `/dashboard/*` responde
503 mesmo com o banco perfeito.

**`/docs` sumiu.**
`REQUIRE_API_AUTH=true` desliga `/docs`, `/redoc` e `/openapi.json`.

**`/dashboard/ritmo-dia` responde 200 com `em_operacao: false`.**
Correto fora de 08h–19h e em fim de semana — a rota nem toca o modelo nesse caso.

**`/dashboard/metas` diz que não encontrou o arquivo.**
`dados_metas/` não é versionado. Rode o extrator ou use
`POST /dashboard/metas/upload`. Atenção: o GET lê por caminho **relativo** e o
upload grava em caminho **absoluto** — se o diretório de trabalho do processo não
for a raiz do projeto, um grava num lugar e o outro lê de outro.

**Posso criar endpoints novos para as tabelas do dicionário?**
Só com escopo definido. Colunas de titular (telefone, endereço, e-mail, nome da
mãe, data de nascimento) são dado sensível e não devem virar endpoint genérico.
Siga o padrão de `dominios/graficos/queries.py`: CTE separada, `NOLOCK`,
envelope, filtro de agentes no SQL — nunca `SELECT *` de tabela crua.

---

## 15. Configuração (`.env`)

Use `.env.example` como base. **Nunca** versione o `.env` preenchido.

### Banco (obrigatório)

| Variável | Descrição |
|---|---|
| `DB_DRIVER` | `ODBC Driver 17 for SQL Server` |
| `DB_SERVER` | host/IP do SQL Server |
| `DB_USER` / `DB_PASSWORD` | credenciais |

Vazios → **500** com mensagem específica, antes de tocar a rede.

### Autenticação

| Variável | Padrão | Efeito |
|---|---|---|
| `REQUIRE_API_AUTH` | `false` | Liga auth nos 6 prefixos **e desliga `/docs`** |
| `API_KEY` / `API_TOKEN` | vazio | Obrigatórios se auth ligada (senão 500) |
| `CORS_ALLOW_ORIGINS` | `localhost:5173,127.0.0.1:5173` | CSV de origens |
| `CORS_ALLOW_CREDENTIALS` | `false` | Forçado a `false` se origem for `*` |

### Feature flags

| Variável | Padrão | Efeito |
|---|---|---|
| `ENABLE_VALIDATED_ROUTES` | **`true`** | `false` → todo `/dashboard/*` vira **503** |
| `ENABLE_INDEX_ADMIN` | `false` | Habilita `/admin/indexes/*` |
| `ENABLE_AGENT_TELEMETRY` | `false` | Logs ndjson em `logs/` |

### Performance

| Variável | Padrão | Efeito |
|---|---|---|
| `DASHBOARD_CACHE_TTL` | `60` | TTL do cache (s). `0` desliga |
| `DASHBOARD_CACHE_MAX_ENTRIES` | `500` | Teto de entradas (piso 16) |
| `DB_QUERY_TIMEOUT` | `60` | Timeout de query (s) → **504** |
| `DB_POOL_SIZE` | `6` | Conexões guardadas por banco por worker |
| `DB_POOL_MAX_AGE_SECONDS` | `1800` | Reciclagem de conexão (s) |
| `DB_POOL_TIMEOUT` | `10` | ⚠️ **Lida mas nunca usada** |
| `EFETIVIDADE_ETL_TTL` | `3600` | TTL do ETL de efetividade (s) |
| `METAS_UPLOAD_MAX_BYTES` | `20971520` | Teto do PDF de metas (20 MB) |

### Observabilidade

| Variável | Padrão |
|---|---|
| `SENTRY_DSN` | vazio (desliga) |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` |
| `SENTRY_ENABLE_LOGS` | `true` |

> Variável já definida no ambiente do SO **vence** o `.env`.
> `SENTRY_TRACES_SAMPLE_RATE` com valor não numérico **derruba o boot**.

---

## Conteúdo do pacote

```
main.py              bootstrap FastAPI
api/                 routers HTTP + auth/middleware
core/                pool de conexões, run_query, cache, envelope
config/settings.py   .env + constantes de regra de negócio
dominios/            regras e SQL por domínio
deploy/              artefatos do modelo de /dashboard/ritmo-dia
requirements.txt
.env.example
README.md            este guia
ENDPOINTS.md         referência dos 57 endpoints
```

**Nós de alto impacto** (mexer com cuidado): `run_query()`,
`build_response_envelope()`, `config/settings.py`, `cache_manager`,
`pool_manager`.

Ao estender: toda query passa por `run_query()`; `NOLOCK` obrigatório; filtro de
agentes **dentro** do SQL; resposta via `build_response_envelope()`; CTEs
separadas por agregação.
