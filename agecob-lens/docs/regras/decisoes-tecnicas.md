---
title: Agecob — Decisões Técnicas
tags: [agecob, decisao, adr]
created: 2026-04-27
updated: 2026-05-29
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

**Data:** 2026-04 · **Status:** SUPERSEDED por [[#ADR-012]] (2026-05-29), depois por [[#ADR-013]] (2026-08-19) — CPC hoje é `ALO=1 AND CONTATO=1`; constante só sobrevive no monolito legado

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

## ADR-012: Premissas falsas dos prompts de perf (Wave C/D) vs. backend real

**Data:** 2026-05-29 · **Status:** ativo (calibra prompts futuros)

**Contexto:** Os prompts de otimização "Wave C" (orjson + Pydantic response_model) e "Wave D" (run_in_executor + thread-local connection pool) foram escritos contra o backend **monolito antigo** (`agecob-lens/main.py`). O backend de produção já é o **modular** (root: `api/`, `core/`, `dominios/`, `config/` — ADR-001 já superado). Ao executar, o agente detectou premissas falsas que invalidam partes dos prompts:

- **"main.py only" / constantes no main.py** — falso. `run_query` vive em `core/database/query_executor.py`; `pyodbc.connect` em `core/database/pool_manager.py:56`; constantes de status/CPC em módulos `dominios/`, não no `main.py` (fino, só wiring).
- **"CPC_COMPLEMENTO_IDS hardcoded, never make dynamic"** — desatualizado. CPC virou JOIN `CTO_COMPLEMENTO.CONTATO=1`; a constante só existe no monolito legado (contradiz ADR-006, que está stale).
- **Wave C2 — "os 4 endpoints retornam o mesmo envelope"** — falso. `/dashboard/produtividade-agentes` retorna `{generated_at, cache_age_seconds, agents}` (`dominios/produtividade/servico.py:84`), **não** `{meta, data, errors}`. Um `response_model` único derrubaria campos do `meta` silenciosamente (`total_rows`, `sources`, `filters`, `run_id`, `quality`, `pagination`).
- **Wave D — "pyodbc dentro de `async def` bloqueando o event loop"** — falso. **Todos** os endpoints de DB são `def` síncrono → FastAPI já os roda no threadpool externo. O único `async def` (`api/routers/regressao.py:19`) não toca DB.
- **Wave D — criar thread-local connection pool** — redundante e conflitante. Já existe `pool_manager` (pool por database/worker, `DB_POOL_SIZE`, max-age, timeout, telemetria). Um segundo pool ignoraria esse ciclo de vida.

**Decisão:**
1. **C1 (orjson):** aplicado e depois **revertido** (2026-05-29). FastAPI 0.136 **deprecou `ORJSONResponse`** — serializa direto para JSON bytes via Pydantic (mais rápido, sem response class custom). Além de não dar ganho, `import orjson` no render quebrou produção (interpretador do servidor sem orjson → 500 "Internal Server Error" em todo endpoint, DB intacto). Conclusão: não usar orjson nesta versão de FastAPI.
2. **C2 (response_model):** **não aplicar.** Não é perf (é overhead Pydantic) e risca o contrato consumido pelo frontend. Só faria sentido com models permissivos (`extra="allow"`) cobrindo os 2 shapes, e apenas para OpenAPI/`/docs`.
3. **D:** **não aplicar como escrito.** Premissa inexistente neste código. O ganho de concorrência genuíno equivalente é mover `fit_all_models` (sklearn, CPU-bound) de `regressao.py:19` para fora do event loop (`def` simples ou `run_in_executor`).
4. **Calibração de prompts:** prompts de perf futuros devem mirar a arquitetura modular real, referenciar `pool_manager`/`query_executor`, e validar shape de resposta por endpoint antes de propor `response_model`.

**Consequência:** Os prompts Wave C/D na forma original são parcialmente inválidos contra o backend atual. **Nenhum item de C/D ficou** — C1 foi revertido (FastAPI 0.136 já serializa rápido nativamente; orjson quebrou prod). Premissas sobre monolito, constantes, envelope uniforme e endpoints async ficam registradas como **falsas** para não se repetirem. ADR-006 deve ser revisado (CPC não é mais hardcoded). **Lição:** validar versão da lib (deprecações) e paridade de dependências entre `.venv` local e interpretador do servidor antes de adicionar dep de runtime.

---

## ADR-013: CPC vira `ALO=1 AND CONTATO=1`, abandona lista curada de `COD_COMPLEMENTO`

**Data:** 2026-08-19 · **Status:** ativo

**Contexto:** ADR-006 (2026-04) foi substituído em 2026-07 por uma lista curada de `COD_COMPLEMENTO` (`CPC_COMPLEMENTO_CODS`, 6 códigos de voz) porque `CTO_COMPLEMENTO.CONTATO=1` sozinho é largo demais — pega disparo automático de WhatsApp, envio de boleto, ligação interrompida/ruim. Auditoria ao vivo em 2026-08-19 (30 dias de `CTO_MASTER` real, ambos os bancos) confirmou esse achado ainda vale para `CONTATO=1` **sem** `ALO=1`: mesmo tipo de evento (ex.: ligação interrompida) aparece com `CONTATO` `True` e `False` em códigos diferentes do catálogo — incoerência de configuração, não sinal confiável isolado.

**Decisão:** Negócio decidiu adotar `CTO_COMPLEMENTO.ALO = 1 AND CTO_COMPLEMENTO.CONTATO = 1` como nova regra de CPC, substituindo a lista curada. O `AND ALO=1` é obrigatório — sem ele, alguns códigos legados (`CONTATO=1` com `ALO=0`, ex. `UNALLOCATED_NUMBER`) quebrariam o funil monotônico `acionamentos ≥ alô ≥ CPC`.

**Consequência:** `CPC_COMPLEMENTO_CODS` e `CPC_CODS_SQL` removidos de `config/settings.py`. Todo `CC.COD_COMPLEMENTO IN {...}` nas queries (`dominios/produtividade/queries.py`, `dominios/acordos/queries.py`) virou `CC.CONTATO = 1` (mantendo o `CC.ALO = 1 AND` já existente). CPC deve subir em relação à lista curada anterior — `CONTATO=1` captura mais códigos de voz do que os 6 curados (ex.: `574 Reclamação`, `563 Retorno do Receptivo`), mesmo com o guard de `ALO=1`. Números de CPC/Taxa de CPC no histórico antes de 2026-08-19 não são diretamente comparáveis aos de depois.

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
