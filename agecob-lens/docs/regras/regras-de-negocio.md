---
title: Agecob — Regras de Negócio COBweb
tags: [agecob, backend, regras-de-negocio, cobweb]
created: 2026-04-27
updated: 2026-04-27
---

# Regras de Negócio COBweb

Fonte de verdade para todas as regras de negócio que governam o agecob-lens. Qualquer mudança aqui deve se propagar para o `main.py`, o `mapa-kpis-dashboard.md`, e os docs de pipeline.

---

## Status de Acordo

| Constante | IDs | Significado |
|---|---|---|
| `STATUS_APROVADOS` | `(1, 3, 12)` | ATIVO + BAIXA POR PAGAMENTO + BAIXA POR PAGAMENTO AVULSO |
| `STATUS_EXCECAO` | `(5)` | Negócio chama "Exceção"; enum REC_MASTER nomeia como PENDENTE (aguardando validação interna) |
| `STATUS_REJEITADO` | `(7)` | REJEITADO (supervisor/banco negou) |
| `STATUS_UNIVERSO_ACORDOS` | `(1, 3, 5, 12)` | Universo total de acordos considerados |

## Contato com Pessoa Certa (CPC)

IDs de complemento que qualificam um contato como CPC:

```
CPC_COMPLEMENTO_IDS = (252, 130, 110, 111, 253, 144, 151, 216, 140, 108, 90)
```

**Gestão:** hardcoded, mantido manualmente por Isaque como cientista de dados. Não mover para config dinâmica.

## Terminologia Operacional

| Termo | Definição | Filtro técnico |
|---|---|---|
| **Acionamento** | Qualquer tentativa de contato | Todo `ID_CTO_MASTER` (sem filtro de complemento) |
| **Contato (CPC)** | Contato efetivado com a pessoa certa | `ID_COMPLEMENTO IN CPC_COMPLEMENTO_IDS` |
| **Acordo aprovado** | Acordo em status ativo ou baixado | `ID_REC_STATUS IN (1, 3, 12)` |
| **Exceção** | Acordo pendente de aprovação bancária | `ID_REC_STATUS = 11` |
| **Primeira parcela** | Parcela de entrada do acordo | `PARCELA = 0` (não 1 — convenção COBweb) |

## Parcelas

```
PRIMEIRA_PARCELA = 0
```

A primeira parcela no COBweb é `PARCELA = 0`. Nunca "normalizar" para 1.

## Portfólio

```
PORTFOLIO_COLUMN = "CAMPO010"
```

O nome do portfólio/banco vem de `DIV_AUX.CAMPO010`, não de `CART_MASTER`. Decisão do integrador do sistema — não alterar.

Nomes de portfólio reais (extraídos de `CART_MASTER` como referência): BVFinanceira, Santander, Panamericano, Yamaha, entre outros.

## Agentes Excluídos

Agentes que são contas de sistema e devem ser filtrados de toda exibição:

| Tipo | Valor |
|---|---|
| Nomes exatos | `COBDESANTOS`, `NEMBUSUSER` |
| Prefixos no NOME | `ANTLIA%`, `INTERNA%` |
| Prefixos na CHAVE | `suporte%`, `SISTEMA%` |

Implementação: constante `FILTRO_AGENTES_EXCLUIDOS_SQL` aplicada no `WHERE` de **toda** query, antes da agregação. O filtro Python (`_filter_excluded_agents`) foi removido no refactor por ser redundante.

## Chave do Agente

O identificador de login do agente é a coluna `CHAVE` em `USU_MASTER`, não `COD_USUARIO`. A normalização usa `CHAVE` em minúsculas como `agent_key`.

## Cross-Database

O mesmo agente pode existir em `COBwebRCBCONSUMER` e `COBwebRCBAUTOS`. Regra:
- **Por padrão:** tratados como entidades separadas (cada banco tem seus números)
- **Consolidação explícita:** quando necessário, feita via match por `CHAVE` normalizada (endpoint `/produtividade-agentes`)

## Fórmulas de KPI

| KPI | Fórmula | Nota |
|---|---|---|
| CPC % | `CEILING((qtd_contatos / qtd_acionamentos) × 10000) / 100` | |
| Taxa de conversão | `qtd_acordos / qtd_acionamentos × 100` | |
| Desconto médio % | `AVG(valor_total_acordo / VR_SALDO × 100)` | guarda `VR_ORIGINAL > 0` |
| Valor primeira parcela | produtividade: `AVG(VALOR_P1)` · comparação: `SUM(VALOR_P1)` | granularidade intencional |
| qtd_acionamentos | produtividade: `COUNT(DISTINCT)` · comparação: `COUNT` sem DISTINCT | diferença intencional |

## Granularidade Intencional

Existem diferenças propositais entre endpoints:
- `/produtividade-hoje` usa `COUNT(DISTINCT ID_CTO_MASTER)` para acionamentos
- `/comparacao-agentes` usa `COUNT(ID_CTO_MASTER)` sem DISTINCT

Isso afeta números absolutos entre telas. É comportamento esperado e documentado.

## Classificação de Cargas (CARGA_LOTE)

| Tipo | Critério (`QTD_CLI`) |
|---|---|
| Rotina | ≤ 500 |
| Carga relevante | 501 – 10.000 |
| Reshuffle | > 10.000 |

`QTD_NV_CLI` separa clientes genuinamente novos de realocados — volume alto nem sempre significa carteira nova.

## Janela de Dados

- **Dashboard operacional:** dia atual (`@Hoje <= data < @Amanha`)
- **Pipeline analítico (fase 1):** trimestral (3 meses), incremental diário
- **Pipeline analítico (futuro):** máximo a validar com DBA (referência original: 28 meses + 15 dias)

## Referências

- [[mapa-kpis-dashboard]] — Mapa completo KPI → fórmula → endpoint → origem
- [[agecob-stack-e-arquitetura]] — Stack e infraestrutura
- [[pipeline-analise-operacional_v2]] — Pipeline com decisões de fase 1
- [[agecob-moc]] — Índice geral
