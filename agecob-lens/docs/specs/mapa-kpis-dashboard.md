# Mapa de KPIs do Dashboard (fonte oficial em `main.py`)

Este documento consolida a regra de negócio que alimenta os números exibidos no dashboard hoje, com base nas queries e endpoints do backend (`../main.py`).

## Regras globais aplicadas

- Janela de dados: dia atual (`@Hoje <= data < @Amanha`).
- Bancos: `COBwebRCBAUTOS`, `COBwebRCBCONSUMER` e consolidado `todos`.
- Status de acordo:
  - Aprovados: `ID_REC_STATUS IN (1, 3, 12)`.
  - Exceção: `ID_REC_STATUS IN (5)` — enum chama PENDENTE; negócio chama "Exceção".
  - Rejeitado: `ID_REC_STATUS IN (7)`.
  - Universo de acordos: `(1, 3, 5, 12)`.
- CPC (contato com pessoa certa): `ID_COMPLEMENTO IN (252,130,110,111,253,144,151,216,140,108,90)`.
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

| KPI / Campo | Fórmula (como está implementado hoje) | Endpoint(s) | Origem principal |
|---|---|---|---|
| `qtd_acionamentos` | `COUNT(DISTINCT CM.ID_CTO_MASTER)` (produtividade) / `COUNT(CM.ID_CTO_MASTER)` (comparação) | `/dashboard/produtividade-hoje/{db}`, `/dashboard/comparacao-agentes/{db}`, `/dashboard/detalhamento-agentes/{db}`, `/dashboard/produtividade/{db}` | `CTO_MASTER` |
| `qtd_contatos` | `COUNT(DISTINCT CASE WHEN ID_COMPLEMENTO IN CPC_IDS THEN ID_CTO_MASTER END)` (produtividade) / `COUNT(CASE WHEN ... THEN 1 END)` (comparação) | mesmos acima | `CTO_MASTER` |
| `cpc_percentual` | `CEILING((qtd_contatos / qtd_acionamentos) * 10000) / 100` | mesmos acima | derivado de `CTO_MASTER` |
| `qtd_acordos` | `COUNT(DISTINCT NR_RECEBIMENTO)` com status aprovados | produtividade/comparação/status-carga | `REC_MASTER` (agregado por acordo) |
| `acordos_percentual` | `(qtd_acordos / qtd_acionamentos) * 100` | `/dashboard/produtividade-hoje/{db}` | derivado de `CTO_MASTER` + `REC_MASTER` |
| `taxa_conversao` | `(qtd_acordos / qtd_acionamentos) * 100` | comparação/detalhamento/produtividade agregada | derivado de `CTO_MASTER` + `REC_MASTER` |
| `valor_acordos` / `valor_total_acordos` | `SUM(valor_total_acordo)` para status aprovados | produtividade/comparação/status-carga | `REC_MASTER` (soma de parcelas por `NR_RECEBIMENTO`) |
| `acordo_medio` | `AVG(valor_total_acordo)` para aprovados | produtividade/comparação | `REC_MASTER` |
| `parcelamento_medio` | `AVG(PLANO)` para aprovados | produtividade/comparação | `REC_MASTER.PLANO` |
| `desconto_medio_percentual` | `AVG(valor_total_acordo / VR_ORIGINAL * 100)` com `VR_ORIGINAL > 0` | produtividade/comparação | `REC_MASTER` + `REC_DIVIDAS` + `DIV_MASTER.VR_SALDO` |
| `valor_primeira_parcela` | produtividade: `AVG(VALOR_P1)`; comparação: `SUM(VALOR_P1)` | produtividade/comparação | `REC_MASTER` com `PARCELA = 0` |
| `qtd_excecoes` | `COUNT(DISTINCT NR_RECEBIMENTO)` com status 11 | produtividade/comparação/status-carga | `REC_MASTER` |
| `valor_excecoes` | `SUM(valor_total_acordo)` com status 11 | produtividade/comparação/status-carga | `REC_MASTER` |
| `total_valor` (1ª parcela dia) | `SUM(R.VALOR)` com `PARCELA = 0` e aprovados | `/dashboard/primeira-parcela-dia/{db}` | `REC_MASTER` |
| `total_acordos` (1ª parcela dia) | `COUNT(DISTINCT R.NR_RECEBIMENTO)` com `PARCELA = 0` e aprovados | `/dashboard/primeira-parcela-dia/{db}` | `REC_MASTER` |
| `qtd_excecoes` por portfólio | `COUNT(DISTINCT NR_RECEBIMENTO)` com `PARCELA = 0` e status 11 | `/dashboard/excecoes-por-portfolio/{db}` | `REC_MASTER` + `REC_DIVIDAS` + `DIV_AUX.CAMPO010` |
| `valor_excecoes` por portfólio | `SUM(R.VALOR)` (mesmo filtro acima) | `/dashboard/excecoes-por-portfolio/{db}` | `REC_MASTER` + `DIV_AUX` |
| `qtd_excecoes` por agente | `COUNT(DISTINCT NR_RECEBIMENTO)` com `PARCELA = 0` e status 11 | `/dashboard/excecoes-por-agente/{db}` | `REC_MASTER` + `USU_MASTER` |
| `valor_excecoes` por agente | `SUM(R.VALOR)` (mesmo filtro acima) | `/dashboard/excecoes-por-agente/{db}` | `REC_MASTER` + `USU_MASTER` |
| `qtd_acordos` por portfólio | `COUNT(DISTINCT NR_RECEBIMENTO)` com `PARCELA = 0` e aprovados | `/dashboard/acordos-por-portfolio/{db}` | `REC_MASTER` + `REC_DIVIDAS` + `DIV_AUX.CAMPO010` |
| `valor_acordos` por portfólio | `SUM(R.VALOR)` (mesmo filtro acima) | `/dashboard/acordos-por-portfolio/{db}` | `REC_MASTER` + `DIV_AUX` |
| `qtd_acordos_primeira_parcela` por agente | `COUNT(DISTINCT NR_RECEBIMENTO)` com `PARCELA = 0` e aprovados | `/dashboard/primeira-parcela-por-agente/{db}` | `REC_MASTER` + `USU_MASTER` |
| `valor_primeira_parcela` por agente | `SUM(R.VALOR)` com `PARCELA = 0` e aprovados | `/dashboard/primeira-parcela-por-agente/{db}` | `REC_MASTER` + `USU_MASTER` |

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
