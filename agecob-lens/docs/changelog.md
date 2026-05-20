---
title: Agecob — Changelog Consolidado
tags: [agecob, changelog, operacao]
created: 2026-04-27
updated: 2026-05-19
---

# Changelog Consolidado — agecob-lens

Registro unificado de todas as mudanças significativas no projeto, em ordem cronológica reversa. Substitui o `github-changelog.md` anterior.

---

## 2026-05-19 — Reorganização e enxugamento da documentação

- Estrutura por categoria criada: `specs/`, `regras/`, `plans/`, `runbooks/`, `analysis/`.
- 16 arquivos movidos com `git mv` (histórico preservado).
- **Deletados (15 arquivos)**: scratch (`aa.txt`, `mudança.md`, `BD.txt`), out-of-scope (`arquitetura comparador.txt`), duplicata (`agecob-lens/CLAUDE.md`), incident resolvido (`desespero.md`), reports concluídos (`refactor_main_py_report.md`, `produtividade-agentes-consistency-audit.md`), duplicatas de changelog/pipeline/redesign em `arquivado/`, `complementação e centralização/`, `future implem/`.
- **Mesclados em 2 docs novos**:
  - `regras/id-rec-status.md` ← `descrição ID_REC_STATUS.md` + `id_rec_status.txt` (`BD.txt` vazio, descartado).
  - `plans/redesign-executivo.md` ← `redesign_executivo_dashboard_v2.md` + `complementacao_redesign_executivo.md`.
- MOC reescrito com nova taxonomia e referências rápidas.
- Subpastas `complementação e centralização/` e `future implem/` removidas (vazias após move).
- Redução de surface: ~41 → ~18 docs principais.

## 2026-04-27 — Documentação centralizada

- Criada estrutura de documentação para Obsidian (MOC + docs especializados).
- Diagnóstico de atualidade de todos os docs existentes.
- Identificados como desatualizados: `pipeline v1` (obsoleto pela v2), `data-coverage-analysis` (janela trimestral não refletida), `missing-endpoints-contracts` (sobreposição com pipeline v2), `github-changelog` (incompleto).

## 2026-04-24 — Pipeline Análise Operacional v2

- Publicada versão v2 do pipeline (`pipeline-analise-operacional_v2.md`).
- Decisões incorporadas:
  - Grão da tabela fato: dia × portfólio × banco (agente fora da fase 1).
  - Janela inicial: trimestral (3 meses).
  - `CTO_MASTER` e `USU_MASTER` fora do escopo da fase 1.
  - CARGA_LOTE integrado como contexto de reshuffle.
- Validação de infraestrutura:
  - Índices de `REC_MASTER` e `CTO_MASTER` confirmados.
  - Benchmarks: CTEs separadas ~1s vs join direto ~81s (6 meses).
  - Estimativa trimestral: < 1s por CTE, job completo < 10s.
- Estrutura DDL de `fato_produtividade_portfolio` definida.
- Query base do job de agregação validada em produção.
- Adicionados: freshness contract no envelope, alert lifecycle, YAML schema de regras, corte `bu` no diagnóstico.
- Seção 10 (CARGA_LOTE): thresholds de classificação definidos com base em estatísticas reais (137 lotes).

## 2026-04-22 — Auditoria de consistência /produtividade-agentes

- Executada auditoria completa do endpoint `/dashboard/produtividade-agentes`.
- Resultado: 34 PASS, 1 FAIL (bloqueado por ambiente — sem .git local).
- Correções aplicadas:
  - `agent_key` padronizado para minúsculas.
  - `GROUP BY` alinhado para `UM.CHAVE, UM.NOME`.
  - `cache_age_seconds` ajustado para nunca retornar 0 em cache hit imediato.
- Runtime verification: cache TTL de 60s confirmado com 3 calls sequenciais.

## ~2026-04-20 — Refactor main.py (3 changes)

- **Change 1:** Unificação da query de produtividade.
  - Criada `_build_produtividade_query(db, *, use_distinct_esforco)`.
  - Removidas: `QUERY_PRODUTIVIDADE_HOJE`, `QUERY_AGENTES_UNIFICADO_BASE`, `get_query_comparacao_agentes`, `_build_query_agentes_unificado`, `_map_origem_filter`.
  - Resultado: 1568 → 1447 linhas (−7.7%).
- **Change 2:** Eliminação do filtro Python redundante.
  - 8 call sites de `_filter_excluded_agents` removidos.
  - 3 helpers deletados: `_filter_excluded_agents`, `_is_excluded_agent_row`, `_normalize_agent_text`.
  - `QUERY_ACORDOS_HOJE` convertido para usar `FILTRO_AGENTES_EXCLUIDOS_SQL`.
- **Change 3:** `CTE_Saldo_Original` restrito ao dia.
  - Modo distinct: `WHERE RD.NR_RECEBIMENTO IN (SELECT ... WHERE DT_EMISSAO >= @Hoje)`.
  - Modo comparacao (todos/UNION ALL): `WHERE EXISTS (SELECT 1 FROM CTE_Acordos_Unicos ...)`.

## ~2026-04-15 — Endpoint /produtividade-agentes

- Implementado endpoint consolidado `GET /dashboard/produtividade-agentes`.
- Resposta com granularidade dupla: consolidado por `agent_key` + split por `by_database`.
- Normalização cross-DB via `CHAVE` em minúsculas.
- Cache próprio com TTL de 60s e `force_refresh` support.
- Query paralela por banco via `ThreadPoolExecutor`.

## ~2026-04-10 — Redesign inicial de interface

- Tema atualizado para visual claro com cores secundárias padronizadas.
- Labels normalizados para legibilidade.
- Blocos redundantes removidos da home.
- Gráfico de distribuição corrigido (separação volume vs valor, remoção de trend line ambígua).

## ~2026-04-08 — Endpoints de gráficos/cards

- Implementados builders de chart queries:
  - `_build_primeira_parcela_dia_query`
  - `_build_excecoes_por_portfolio_query`
  - `_build_excecoes_por_agente_query`
  - `_build_acordos_por_portfolio_query`
  - `_build_primeira_parcela_por_agente_query`
- Todos seguem padrão `_wrap_todos_or_single` + `CROSS APPLY TOP 1` + `FILTRO_AGENTES_EXCLUIDOS_SQL`.

## ~2026-04-05 — Operação de servidor

- `atualizar.bat` corrigido para monorepo `C:\agecob`.
- Build no diretório correto, validações por etapa, restart controlado do serviço `AgecobAPI`.
- Autoelevação UAC adicionada.

## ~2026-04-01 — Organização Git e segurança

- Divergências de histórico resolvidas (non-fast-forward em `T` e `main`).
- `.env.example` publicado em ambas as branches.
- `.gitignore` atualizado (`.env`, `.cursor/`, exceção para `.env.example`).
- Remoto `ag-front` populado.
- `.env` local confirmado fora do versionamento.

## ~2026-03-28 — Setup inicial

- Repositório `agecob-lens` criado.
- FastAPI + Uvicorn + pyodbc configurados.
- Primeiros endpoints de produtividade implementados.
- Frontend React/TS + Vite + Tailwind + shadcn inicializado.
- Nginx como reverse proxy + NSSM como service manager configurados.

---

## Notas

- Datas marcadas com `~` são aproximadas (reconstruídas a partir de commits e contexto).
- Para detalhes técnicos de cada mudança, ver os docs especializados referenciados em [[agecob-moc]].
