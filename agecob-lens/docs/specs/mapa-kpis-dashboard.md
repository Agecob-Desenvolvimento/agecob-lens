# Mapa de KPIs do Dashboard

Este documento consolida a regra de negócio que alimenta os números exibidos no
dashboard. **Fonte de verdade dos valores literais: `config/settings.py`**
(tuplas de status), `agecob-lens/docs/data-layer.md` (regras) e
`docs/data-dictionary.md` (schema). Quando este mapa e essas fontes divergirem,
elas ganham — `python -m scripts.drift` cruza as duas.

## Regras globais aplicadas

- Janela de dados: dia atual (`@Hoje <= data < @Amanha`).
- Bancos: `COBwebRCBAUTOS`, `COBwebRCBCONSUMER` e consolidado `todos`.
- Status de acordo:
  - Aprovados: `ID_REC_STATUS IN (1, 3, 12)`.
  - Exceção: `ID_REC_STATUS IN (5)` — enum chama PENDENTE; negócio chama "Exceção".
  - Rejeitado: `ID_REC_STATUS IN (7)`.
  - Universo de acordos (pré-filtro CTE): `(1, 2, 3, 5, 10, 12)` — gerados + exceção.
- CPC (contato com pessoa certa): `CTO_COMPLEMENTO.ALO = 1 AND CTO_COMPLEMENTO.CONTATO = 1`, join `CTO_MASTER.ID_COMPLEMENTO = CTO_COMPLEMENTO.ID_COMPLEMENTO` (ADR-013, 2026-08-19).
- Primeira parcela: `PARCELA = 0`.
- Expurgo de agentes (backend): `COBDESANTOS`, `NEMBUSUSER`, prefixos `ANTLIA%` e `INTERNA%`.

## Origem de dados por domínio

- Esforço/acionamento: `CTO_MASTER`.
- Usuários/agentes: `USU_MASTER`.
- Acordos e parcelas: `REC_MASTER`.
- Vínculo acordo-dívida: `REC_DIVIDAS`.
- Saldo da dívida: `DIV_MASTER.VR_SALDO`.
- Portfólio: `DIV_AUX.CAMPO010` (via `CROSS APPLY TOP 1`).

## Matriz: KPI -> fórmula -> endpoint -> origem

> **Revisão 2026-09-16.** Esta tabela foi reconferida linha a linha contra
> `dominios/produtividade/queries.py`, `dominios/graficos/queries.py` e
> `config/settings.py`. Dois erros se repetiam e foram corrigidos em todas as
> ocorrências: (a) **status 11** como filtro de exceção — o correto é
> `STATUS_EXCECAO` = (5); a correção de `ed7a9f4` pegou só a linha 15 e deixou quatro
> linhas da tabela para trás; (b) **"aprovados"** onde o código usa `STATUS_GERADOS`
> = (1, 2, 3, 10, 12), que inclui quebra e quebra automática. Também corrigidas as
> unidades de `qtd_acionamentos`/`qtd_contatos` (devedores, não `ID_CTO_MASTER`) e o
> denominador de `cpc_percentual` (`qtd_alo`, não `qtd_acionamentos`).

| KPI / Campo | Fórmula (como está implementado hoje) | Endpoint(s) | Origem principal |
|---|---|---|---|
| `qtd_acionamentos` | `COUNT(DISTINCT CM.ID_DEV)` (produtividade) / `COUNT(*)` sobre `CTE_Esforco_Dedup`, deduplicado por (`ID_USUARIO`, `origem`, dia, `ID_DEV`) (comparação) — **devedores únicos nos dois casos, nunca `ID_CTO_MASTER`** | `/dashboard/produtividade-hoje/{db}`, `/dashboard/comparacao-agentes/{db}`, `/dashboard/detalhamento-agentes/{db}`, `/dashboard/produtividade/{db}` | `CTO_MASTER` |
| `qtd_contatos` | `COUNT(DISTINCT CASE WHEN CC.ALO = 1 AND CC.CONTATO = 1 THEN CM.ID_DEV END)` (produtividade) / `SUM(teve_contato)` sobre `CTE_Esforco_Dedup`, onde `teve_contato = MAX(...)` por devedor (comparação) | mesmos acima | `CTO_MASTER` + `CTO_COMPLEMENTO` |
| `cpc_percentual` | `CAST(CEILING(qtd_contatos * 100.0 / NULLIF(qtd_alo, 0)) AS INT)` — denominador é `qtd_alo`, **não** `qtd_acionamentos`; resultado é inteiro arredondado para cima | mesmos acima | derivado de `CTO_MASTER` |
| `qtd_acordos` | `COUNT(DISTINCT NR_RECEBIMENTO)` com `STATUS_GERADOS` = (1, 2, 3, 10, 12) — inclui quebra (2) e quebra automática (10), **não** só aprovados | produtividade/comparação/status-carga | `REC_MASTER` (agregado por acordo) |
| `acordos_percentual` | `(qtd_acordos / qtd_acionamentos) * 100` | `/dashboard/produtividade-hoje/{db}` | derivado de `CTO_MASTER` + `REC_MASTER` |
| `taxa_conversao` | `(qtd_acordos / qtd_contatos) * 100` — acordos gerados sobre CPC (Σ `qtd_contatos`), nunca sobre `qtd_acionamentos` nem boletos emitidos. **Atenção:** esses três endpoints não emitem mais uma coluna com esse nome — a antiga `taxa_conversao` deles era pagos/emitidos e foi renomeada `efetividade_boleto_pct` (`dominios/produtividade/queries.py:517-520`). Hoje a fórmula oficial sai como `avg_taxa_conversao` em `/dashboard/benchmarks/{db}` (`:644-645`) e como `conversao_pct` no grão agente (`dominios/agente/agentes.py:84`). | benchmarks/agente | derivado de `CTO_MASTER` + `REC_MASTER` |
| `valor_acordos` / `valor_total_acordos` | `SUM(valor_total_acordo)` para `STATUS_GERADOS` = (1, 2, 3, 10, 12) | produtividade/comparação/status-carga | `REC_MASTER` (soma de parcelas por `NR_RECEBIMENTO`) |
| `acordo_medio` | `AVG(valor_total_acordo)` para `STATUS_GERADOS` = (1, 2, 3, 10, 12) | produtividade/comparação | `REC_MASTER` |
| `parcelamento_medio` | `AVG(CAST(PLANO AS DECIMAL(10,2)))` para `STATUS_GERADOS` = (1, 2, 3, 10, 12) | produtividade/comparação | `REC_MASTER.PLANO` |
| `desconto_medio_percentual` | `AVG(valor_total_acordo / VR_ORIGINAL * 100)` com `VR_ORIGINAL > 0` | produtividade/comparação | `REC_MASTER` + `REC_DIVIDAS` + `DIV_MASTER.VR_SALDO` |
| `valor_primeira_parcela` | `SUM(VALOR_P1)` para `STATUS_GERADOS` nos dois ramos — não existe `AVG` desta coluna em `dominios/` | produtividade/comparação | `REC_MASTER` com `PARCELA = 0` |
| `qtd_excecoes` | `COUNT(CASE WHEN ... THEN 1 END)` com `STATUS_EXCECAO` = (5) | produtividade/comparação/status-carga | `REC_MASTER` |
| `valor_excecoes` | `SUM(valor_total_acordo)` com `STATUS_EXCECAO` = (5) | produtividade/comparação/status-carga | `REC_MASTER` |
| `total_valor` (1ª parcela dia) | `SUM(R.VALOR)` com `PARCELA = 0` e `STATUS_GERADOS` = (1, 2, 3, 10, 12) (inclui quebras) | `/dashboard/primeira-parcela-dia/{db}` | `REC_MASTER` |
| `total_acordos` (1ª parcela dia) | `COUNT(DISTINCT R.NR_RECEBIMENTO)` com `PARCELA = 0` e `STATUS_GERADOS` = (1, 2, 3, 10, 12) | `/dashboard/primeira-parcela-dia/{db}` | `REC_MASTER` |
| `qtd_excecoes` por portfólio | `COUNT(DISTINCT NR_RECEBIMENTO)` com `PARCELA = 0` e `STATUS_EXCECAO` = (5) | `/dashboard/excecoes-por-portfolio/{db}` | `REC_MASTER` + `REC_DIVIDAS` + `DIV_AUX.CAMPO010` |
| `valor_excecoes` por portfólio | `SUM(R.VALOR)` (mesmo filtro acima) | `/dashboard/excecoes-por-portfolio/{db}` | `REC_MASTER` + `DIV_AUX` |
| `qtd_excecoes` por agente | `COUNT(DISTINCT NR_RECEBIMENTO)` com `PARCELA = 0` e `STATUS_EXCECAO` = (5) | `/dashboard/excecoes-por-agente/{db}` | `REC_MASTER` + `USU_MASTER` |
| `valor_excecoes` por agente | `SUM(R.VALOR)` (mesmo filtro acima) | `/dashboard/excecoes-por-agente/{db}` | `REC_MASTER` + `USU_MASTER` |
| `qtd_acordos` por portfólio | `COUNT(DISTINCT NR_RECEBIMENTO)` com `PARCELA = 0` e `STATUS_GERADOS` = (1, 2, 3, 10, 12) | `/dashboard/acordos-por-portfolio/{db}` | `REC_MASTER` + `REC_DIVIDAS` + `DIV_AUX.CAMPO010` |
| `valor_acordos` por portfólio | `SUM(R.VALOR)` (mesmo filtro acima) | `/dashboard/acordos-por-portfolio/{db}` | `REC_MASTER` + `DIV_AUX` |
| `qtd_acordos_primeira_parcela` por agente | `COUNT(DISTINCT NR_RECEBIMENTO)` com `PARCELA = 0` e `STATUS_GERADOS` = (1, 2, 3, 10, 12) | `/dashboard/primeira-parcela-por-agente/{db}` | `REC_MASTER` + `USU_MASTER` |
| `valor_primeira_parcela` por agente | `SUM(R.VALOR)` com `PARCELA = 0` e `STATUS_GERADOS` = (1, 2, 3, 10, 12) | `/dashboard/primeira-parcela-por-agente/{db}` | `REC_MASTER` + `USU_MASTER` |

## Endpoints de acordos detalhados

### `/dashboard/acordos-hoje/{db}` e `/dashboard/acordos-hoje/todos`

Retorna linhas por parcela com:

- agente (`USU_MASTER.CHAVE`)
- devedor (`DEV_MASTER`)
- valor atualizado da dívida (`REC_DIVIDAS + DIV_MASTER.VR_SALDO`)
- valor total do acordo (soma de parcelas por `NR_RECEBIMENTO`)
- desconto concedido = `saldo_atualizado_divida - valor_total_acordo`
- status da parcela (`REC_STATUS.DESCR`)
- situação de pagamento (`PAGO` / `EM ABERTO`)

### `/dashboard/acordos-hoje-agente/{db}`

Retorna a tabela consolidada por acordo do detalhamento de agentes, com:

- CPF, devedor, tipo de acordo, vencimento da 1ª parcela
- valor da 1ª parcela, valor das demais parcelas, quantidade de parcelas
- valor total do acordo, data de emissão

## Observações de implementação

- O endpoint de status-carga é derivado da query de produtividade (não consulta própria de volume/carga física).
- No consolidado `todos`, a API soma os resultados dos dois bancos no backend.
- Existem diferenças intencionais de granularidade entre produtividade e comparação (uso de `DISTINCT` em esforço/contato), que podem alterar números absolutos entre telas.
