---
title: Agecob — Regras de Negócio COBweb
tags: [agecob, backend, regras-de-negocio, cobweb]
created: 2026-04-27
updated: 2026-08-19
---

# Regras de Negócio COBweb

Fonte de verdade para todas as regras de negócio que governam o agecob-lens. Qualquer mudança aqui deve se propagar para `config/settings.py` (constantes de status, CPC e filtros), os builders de SQL em `dominios/`, o `mapa-kpis-dashboard.md` e os docs de pipeline.

> `main.py` **não** carrega regra de negócio desde a modularização de 2026-05-05
> ([[decisoes-tecnicas#ADR-014]]): são 115 linhas de bootstrap, sem nenhuma rota nem
> constante. A referência a propagar para o `main.py` foi corrigida em 2026-09-16.

---

## Status de Acordo

| Constante | IDs | Significado |
|---|---|---|
| `STATUS_APROVADOS` | `(1, 3, 12)` | ATIVO + BAIXA POR PAGAMENTO + BAIXA POR PAGAMENTO AVULSO |
| `STATUS_EXCECAO` | `(5)` | Negócio chama "Exceção"; enum REC_MASTER nomeia como PENDENTE (aguardando validação interna) |
| `STATUS_REJEITADO` | `(7)` | REJEITADO (supervisor/banco negou) |
| `STATUS_UNIVERSO_ACORDOS` | `(1, 2, 3, 5, 10, 12)` | Universo total (gerados + exceção): aprovados (1,3,12) + QUEBRA(2) + QUEBRA AUTOMÁTICA(10) + exceção(5) |

## Contato com Pessoa Certa (CPC)

Um acionamento qualifica como contato (CPC) quando alguém atendeu E o
complemento está marcado como contato no cadastro (regra vigente desde
2026-08-19):

```sql
LEFT JOIN CTO_COMPLEMENTO CC (NOLOCK) ON CM.ID_COMPLEMENTO = CC.ID_COMPLEMENTO
...
COUNT(DISTINCT CASE WHEN CC.ALO = 1 THEN CM.ID_DEV END)                     AS qtd_alo,
COUNT(DISTINCT CASE WHEN CC.ALO = 1 AND CC.CONTATO = 1 THEN CM.ID_DEV END)  AS qtd_contatos
```

O join é **LEFT** e o predicado vive dentro do agregado condicional, nunca no `WHERE`
(`dominios/produtividade/queries.py:138-142`). Isso é essencial para o funil: um
acionamento sem complemento correspondente ainda conta em `qtd_acionamentos`. Um
`JOIN` interno descartaria essas linhas e quebraria `acionamentos ≥ alô ≥ CPC`.

**Gestão:** dirigido por dado (`CTO_COMPLEMENTO.ALO` + `CTO_COMPLEMENTO.CONTATO`), mantido no cadastro do sistema. O `AND ALO=1` evita que codigos com `CONTATO=1` mas sem atendimento real (ex.: `UNALLOCATED_NUMBER`) quebrem o funil `acionamentos ≥ alô ≥ CPC`. Entre 2026-07 e 2026-08-19 a regra foi uma lista curada de `COD_COMPLEMENTO` (`CPC_COMPLEMENTO_CODS`); ver `data-layer.md` para o histórico.

## Terminologia Operacional

| Termo | Definição | Filtro técnico |
|---|---|---|
| **Acionamento** | Qualquer tentativa de contato | Linhas de `CTO_MASTER` sem filtro de complemento. A **unidade de contagem depende do ramo**: `COUNT(DISTINCT CM.ID_DEV)` (devedores únicos) em `/produtividade-hoje` e `/status-carga`; `COUNT(*)` nos demais. Ver "Granularidade Intencional". |
| **Contato (CPC)** | Contato efetivado com a pessoa certa | `CTO_COMPLEMENTO.ALO = 1 AND CTO_COMPLEMENTO.CONTATO = 1` (via JOIN por `ID_COMPLEMENTO`) |
| **Acordo aprovado** | Acordo em status ativo ou baixado | `ID_REC_STATUS IN (1, 3, 12)` |
| **Exceção** | Acordo pendente de aprovação bancária | `ID_REC_STATUS = 5` (enum REC_MASTER nomeia PENDENTE) |
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
| Nomes exatos (NOME) | `COBDESANTOS`, `FT5SYSTEM`, `NEMBUSUSER` |
| Nomes exatos (CHAVE) | `NEMBUSUSER` |
| Prefixos no NOME | `ANTLIA%`, `INTERNA%` |
| Prefixos na CHAVE | `INTERNA%`, `SUPORTE%`, `SISTEMA%` |

São 9 cláusulas, todas comparadas via `UPPER(LTRIM(RTRIM(...)))`
(`config/settings.py:196-206`).

Implementação: constante `FILTRO_AGENTES_EXCLUIDOS_SQL` aplicada no `WHERE` antes da agregação. O filtro Python (`_filter_excluded_agents`) foi removido no refactor por ser redundante — ver [[decisoes-tecnicas#ADR-005]].

> **Exceção importante (não unificar sem decisão de negócio).** O domínio
> **Efetividade** usa uma segunda lista, deliberadamente divergente:
> `FILTRO_AGENTES_EFETIVIDADE_SQL` (`config/settings.py:212-227`). Ela casa por
> **substring** (`LIKE '%...%'`, não prefixo/exato) e exclui também `SERASA`, `NEMBUS`
> e `FT5SYSTEM`. Está aplicada em 6 pontos de `dominios/efetividade/queries.py`; um
> sétimo builder usa de propósito o filtro padrão, com a justificativa no próprio
> docstring. Unificar as duas muda os números da página Efetividade — o próprio
> `settings.py:212-216` registra isso como **decisão de negócio pendente**. Portanto
> "aplicada em **toda** query" era falso e foi corrigido em 2026-09-16.

## Chave do Agente

O identificador de login do agente é a coluna `CHAVE` em `USU_MASTER`, não `COD_USUARIO`. A normalização usa `CHAVE` em minúsculas como `agent_key`.

## Cross-Database

O mesmo agente pode existir em `COBwebRCBCONSUMER` e `COBwebRCBAUTOS`. Regra:
- **Por padrão:** tratados como entidades separadas (cada banco tem seus números)
- **Consolidação explícita:** quando necessário, feita via match por `CHAVE` normalizada (endpoint `/produtividade-agentes`)

## Fórmulas de KPI

| KPI | Fórmula | Nota |
|---|---|---|
| CPC | `Σ qtd_contatos` (contagem) | CPC = Contatos, só que com outro nome. Unidade: count, **não** %. |
| Taxa de contato % | `round(qtd_alo × 100.0 / qtd_acionamentos, 2)` | a razão. Rotular sempre "Taxa de contato", nunca "CPC". Numerador é `qtd_alo` (atendeu), não `qtd_contatos` (CPC). Implementado em `_ratio_pct` (`dominios/agente/agentes.py:24-27`, usado em `:75`). |
| Taxa de CPC % | `round(qtd_contatos × 100.0 / qtd_alo, 2)` | etapa seguinte do funil: CPC sobre quem atendeu. No SQL de produtividade sai como `cpc_percentual`, com `CEILING(...)` e `CAST(... AS INT)` (`dominios/produtividade/queries.py:307-309`, `:521`) — arredondamento para cima, inteiro. |
| Taxa de conversão | `qtd_acordos / qtd_contatos × 100` | acordos gerados sobre CPC (Σ `qtd_contatos`), nunca sobre `qtd_acionamentos` nem boletos emitidos |
| Desconto médio % | `AVG(VALOR_TOTAL_ACORDO / VR_ORIGINAL × 100)` | guarda `VR_ORIGINAL > 0`. `VR_ORIGINAL` é o agregado por acordo — `SUM(ISNULL(DM.VR_SALDO, 0))` na CTE de saldo original (`dominios/produtividade/queries.py:94`) — **não** a coluna `VR_SALDO` crua por dívida. |
| Valor primeira parcela | `SUM(VALOR_P1)` nos dois ramos | Não há granularidade intencional aqui: ambos somam. `AVG(VALOR_P1)` não existe em `dominios/`. Ver `queries.py:117` e `:472`. |
| qtd_acionamentos | `use_distinct_esforco=True`: `COUNT(DISTINCT CM.ID_DEV)` · `False`: `COUNT(*)` | diferença intencional, mas **nenhum dos dois conta `ID_CTO_MASTER`** — ver "Granularidade Intencional" abaixo |

## Granularidade Intencional

Existem diferenças propositais entre endpoints. O seletor é o parâmetro
`use_distinct_esforco` de `build_produtividade_query`
(`dominios/produtividade/queries.py:14-21`):

- `/produtividade-hoje` e `/status-carga` (`use_distinct_esforco=True`) usam
  `COUNT(DISTINCT CM.ID_DEV)` — **devedores únicos acionados no dia**
  (`queries.py:138`, comentado em `:300`)
- `/comparacao-agentes`, `/detalhamento-agentes` e `/produtividade`
  (`use_distinct_esforco=False`) usam `COUNT(*)` sobre as linhas de `CTO_MASTER` do
  período (`queries.py:414`)

> **Correção (2026-09-16).** Este bloco dizia `COUNT(DISTINCT ID_CTO_MASTER)` vs
> `COUNT(ID_CTO_MASTER)`. Nenhuma das duas formas existe no código: o ramo distinct
> deduplica por **devedor** (`ID_DEV`), não por acionamento, o que muda o significado
> do KPI — "quantas pessoas diferentes o agente acionou hoje", não "quantas tentativas
> ele fez". O ramo não-distinct é `COUNT(*)`. Introduzido em `7c04b98` (Ritmo do Dia,
> KNN Fase 2). `agecob-lens/docs/specs/refactor-main-py.md` repetia o mesmo erro e foi
> corrigido junto.

Isso afeta números absolutos entre telas. É comportamento esperado e documentado.

## Classificação de Cargas (CARGA_LOTE)

| Tipo | Critério (`QTD_CLI`) |
|---|---|
| Rotina | ≤ 500 |
| Carga relevante | 501 – 10.000 |
| Reshuffle | > 10.000 |

`QTD_NV_CLI` separa clientes genuinamente novos de realocados — volume alto nem sempre significa carteira nova.

> **Não implementado (verificado 2026-09-16).** Esta classificação em três faixas por
> `QTD_CLI` não existe no código. A única leitura de `CARGA_LOTE` no repositório é
> `api/routers/ritmo_dia.py:135-138` (`_obter_dias_desde_batimento`), que usa um corte
> **único** e sobre **outra coluna**: `WHERE ID_USUARIO = 1 AND QTD_NV_CLI > 10000`.
> Mantido aqui como regra de negócio declarada; se a intenção é que o dashboard
> classifique cargas, isso ainda é trabalho a fazer, não comportamento atual.

## Janela de Dados

- **Dashboard operacional:** dia atual (`@Hoje <= data < @Amanha`)
- **Pipeline analítico (fase 1):** trimestral (3 meses), incremental diário
- **Pipeline analítico (futuro):** máximo a validar com DBA (referência original: 28 meses + 15 dias)

## Referências

- [[mapa-kpis-dashboard]] — Mapa completo KPI → fórmula → endpoint → origem
- [[agecob-stack-e-arquitetura]] — Stack e infraestrutura
- [[pipeline-analise-operacional_v2]] — Pipeline com decisões de fase 1
- [[agecob-moc]] — Índice geral
