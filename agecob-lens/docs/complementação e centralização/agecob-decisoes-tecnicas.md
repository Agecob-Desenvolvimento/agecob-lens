---
title: Agecob — Decisões Técnicas
tags: [agecob, decisao, adr]
created: 2026-04-27
updated: 2026-04-27
---

# Decisões Técnicas — agecob-lens

Registro de decisões técnicas significativas no formato leve (ADR simplificado). Cada decisão tem contexto, escolha e consequência.

---

## ADR-001: Monolito em main.py (sem split de módulos)

**Data:** 2026-04 · **Status:** ativo

**Contexto:** O backend inteiro vive em um único `main.py` (1447 linhas). Splitting em módulos é o próximo passo lógico, mas o refactor de unificação de queries era prioridade.

**Decisão:** Manter monolito até que o refactor (Change 1/2/3) esteja validado em produção. Split é PR separado.

**Consequência:** Arquivo grande, mas com fonte de verdade única para queries. Facilita auditorias e diffs. O split será feito quando o volume de endpoints justificar.

---

## ADR-002: CTEs separadas → join de agregados (nunca join direto)

**Data:** 2026-04-24 · **Status:** permanente

**Contexto:** Join entre `CTO_MASTER` e `REC_MASTER` diretamente (linha × linha) causou produto cartesiano implícito. Query de 6 meses: ~81 segundos.

**Decisão:** Sempre agregar cada tabela em uma CTE separada, depois join entre as CTEs agregadas.

**Consequência:** Mesma query caiu de 81s para ~1s. Padrão obrigatório em qualquer query histórica futura.

---

## ADR-003: Tabela fato sem dimensão agente na fase 1

**Data:** 2026-04-24 · **Status:** ativo

**Contexto:** O grão dia × agente × portfólio × banco seria o mais rico, mas `CTO_MASTER` (acionamentos por agente) requer join pesado e a fase 1 foca em entrega rápida de valor.

**Decisão:** `fato_produtividade_portfolio` com grão dia × portfólio × banco. Sem `CTO_MASTER` nem `USU_MASTER` na fase 1.

**Consequência:** Cortes diagnósticos por agente ficam para fase futura (tabela separada `fato_produtividade_agente`). Regras prescritivas por agente também adiadas.

---

## ADR-004: CROSS APPLY TOP 1 para portfólio

**Data:** 2026-04 · **Status:** permanente

**Contexto:** Um acordo pode cobrir múltiplas dívidas. JOIN direto com `DIV_AUX` multiplica linhas.

**Decisão:** Usar `CROSS APPLY (SELECT TOP 1 DA.CAMPO010 ...)` para pegar um único portfólio por acordo.

**Consequência:** Garante 1 linha por acordo nos gráficos e agregações. Padrão obrigatório em qualquer query que toque `DIV_AUX`.

---

## ADR-005: Filtro de agentes exclusivamente no SQL

**Data:** 2026-04 (refactor) · **Status:** permanente

**Contexto:** Havia dupla filtragem — SQL (`FILTRO_AGENTES_EXCLUIDOS_SQL`) e Python (`_filter_excluded_agents`). A filtragem Python era redundante.

**Decisão:** Remover toda filtragem Python. SQL é a fonte de verdade. Constante `FILTRO_AGENTES_EXCLUIDOS_SQL` aplicada em toda query antes da agregação.

**Consequência:** 8 call sites e 3 helpers eliminados. Menos iteração sobre resultsets. Se surgir discrepância, o debug é no SQL apenas.

---

## ADR-006: CPC IDs hardcoded

**Data:** 2026-04 · **Status:** permanente

**Contexto:** Os IDs de complemento que definem CPC poderiam ser configuráveis ou lidos de tabela.

**Decisão:** Manter hardcoded. Isaque como cientista de dados gerencia a lista manualmente. Mudanças são raras e requerem validação contextual.

**Consequência:** Alteração requer deploy. Aceito: a frequência de mudança não justifica a complexidade de config dinâmica.

---

## ADR-007: Agente cross-database como entidades separadas (default)

**Data:** 2026-04 · **Status:** ativo

**Contexto:** O mesmo operador pode trabalhar em CONSUMER e AUTOS. Consolidar ou separar?

**Decisão:** Default é entidades separadas (cada banco tem seus números). Consolidação explícita via `CHAVE` normalizada apenas no endpoint `/produtividade-agentes`.

**Consequência:** Telas padrão mostram números por banco. Tela de comparação unificada existe separadamente.

---

## ADR-008: Prompts de agente em inglês

**Data:** 2026-04 · **Status:** ativo

**Contexto:** Claude Code agents performam melhor com prompts em inglês.

**Decisão:** Escrever implementation prompts em inglês, com checklists de verificação explícitos e listas "do not touch".

**Consequência:** Melhor acurácia dos agentes. Docs internos de decisão e diário ficam em português.

---

## ADR-009: ADD-ONLY como disciplina de implementação

**Data:** 2026-04 · **Status:** ativo

**Contexto:** Em ambiente solo (sem code review), é fácil introduzir regressões ao misturar adições com refactors.

**Decisão:** Prompts de implementação são escopo de adição apenas. Refactors e auditorias de consistência são prompts separados.

**Consequência:** Menor risco de regressão. Mais prompts, mas cada um é verificável isoladamente.

---

## ADR-010: Regras prescritivas externalizadas em YAML

**Data:** 2026-04-24 · **Status:** planejado (não implementado)

**Contexto:** Thresholds e parâmetros de regras prescritivas (coaching, realocação, alerta de portfólio) precisam ser ajustáveis pelo negócio.

**Decisão:** `backend/rules/operacional.yaml` com schema versionado. Motor carrega no startup. Reload via endpoint admin.

**Consequência:** Negócio pode ajustar sem deploy. Futuro: migrar para tabela para edição via UI.

---

## ADR-011: Freshness metadata no envelope de resposta

**Data:** 2026-04-24 · **Status:** planejado (não implementado)

**Contexto:** Endpoints que leem da tabela fato podem retornar dados stale se o job de agregação não rodou.

**Decisão:** Campo `freshness_status` (`fresh|stale`) e `last_aggregation_at` no `meta` de toda resposta histórica.

**Consequência:** Frontend pode exibir banner de aviso quando dados estão desatualizados.

---

## Decisões em Aberto

Ver seção 11 do [[pipeline-analise-operacional_v2]] para a lista completa. Destaques:

| # | Decisão | Status |
|---|---|---|
| 1 | Nome definitivo da área (Análise Operacional vs alternativas) | pendente |
| 3 | Unificar `/produtividade-historico` com `/operacional/descritivo` | pendente (recomendação: unificar) |
| 6 | Onde vive o job de agregação (SQL Agent / cron Python / externo) | pendente |
| 9 | Permissão DDL no Agecob DB | pendente |
| 11 | BoxPlot (Recharts sem suporte nativo) | pendente |

---

## Referências

- [[agecob-regras-de-negocio]] — Regras que as decisões preservam
- [[refactor_main_py_report]] — Relatório do refactor que implementou ADR-002/005
- [[pipeline-analise-operacional_v2]] — Pipeline que implementa ADR-003/010/011
- [[agecob-moc]] — Índice geral
