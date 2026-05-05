# Documentação — agecob-lens/docs/

> Adicionado em 2026-05-05. Cobre todos os arquivos em `agecob-lens/docs/` e subpastas.

---

## Índice de documentos

| Arquivo | Tipo | Resumo |
|---|---|---|
| `complementação e centralização/agecob-moc.md` | MOC (índice) | Mapa de conteúdo central: links para todos os docs por área |
| `complementação e centralização/agecob-stack-e-arquitetura.md` | Referência | Stack tecnológico, diagrama de infraestrutura, tabelas SQL consumidas |
| `complementação e centralização/agecob-regras-de-negocio.md` | Referência | Fonte de verdade das regras COBweb: status, IDs, fórmulas, filtros |
| `complementação e centralização/agecob-decisoes-tecnicas.md` | ADRs | 11 decisões técnicas documentadas (ADR-001 a ADR-011) |
| `complementação e centralização/agecob-padroes-e-antipadroes.md` | Guia | Padrões SQL, cache e processo com anti-padrões medidos |
| `complementação e centralização/agecob-changelog-consolidado.md` | Changelog | Timeline técnica mar–abr 2026, todas as mudanças significativas |
| `complementação e centralização/agecob-diario-de-bordo.md` | Diário | Timeline pessoal semana a semana (contexto e aprendizados) |
| `mapa-kpis-dashboard.md` | Referência | Matriz KPI → fórmula → endpoint → tabela de origem |
| `produtividade-agentes-consistency-audit.md` | Auditoria | 34 PASS no endpoint `/produtividade-agentes` (2026-04-22) |
| `desespero.md` | Diário | Episódio de crise com Git em 2026-05-05 e lições aprendidas |
| `data-coverage-analysis.md` | Análise | Cobertura e gaps de dados por endpoint |
| `missing-endpoints-contracts.md` | Contratos | Endpoints pendentes em placeholder mode |
| `redesign_executivo_dashboard_v2.md` | Plano | Redesign executivo: waves A/B/C, Visual Encoding, InsightEngine |
| `pipeline-analise-operacional_v2.md` | Plano | Pipeline analítico: pirâmide, tabela fato, regras prescritivas |
| `refactor_main_py.md` | Plano | Especificação do refactor (pre-execution) |
| `refactor_main_py_report.md` | Relatório | Resultado do refactor: 1568 → 1447 linhas, 3 changes |
| `future implem/análise Carteira.md` | Futuro | Análise de carteira (planejado) |
| `future implem/pipeline-analise-operacional.md` | Futuro | v1 do pipeline (substituída pela v2) |
| `future implem/redesign_executivo_dashboard_92b7d68c.plan.md` | Futuro | Plan de redesign executivo |
| `arquivado/pipeline-analise-operacional.md` | Arquivado | Pipeline v1 obsoleto |
| `arquivado/github-changelog.md` | Arquivado | Changelog parcial (substituído pelo consolidado) |

---

## Regras de negócio (resumo rápido)

Fonte: `agecob-regras-de-negocio.md`

| Regra | Valor |
|---|---|
| Acordos aprovados (`ID_REC_STATUS`) | `IN (1, 3, 12)` |
| Exceção | `= 11` |
| Universo de acordos | `IN (1, 3, 11, 12)` |
| Primeira parcela | `PARCELA = 0` |
| Portfólio | `DIV_AUX.CAMPO010` via `CROSS APPLY TOP 1` |
| CPC IDs | `(252,130,110,111,253,144,151,216,140,108,90)` — hardcoded |
| Agentes excluídos | `COBDESANTOS`, `NEMBUSUSER`, `ANTLIA%`, `INTERNA%`, `suporte%`, `SISTEMA%` |
| Filtro de data | `DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha` |
| NOLOCK | Obrigatório em todas as tabelas |

---

## Decisões técnicas (ADRs)

Fonte: `agecob-decisoes-tecnicas.md`

| ADR | Decisão | Status |
|---|---|---|
| 001 | Manter monolito `main.py` até refactor validado | ativo |
| 002 | CTEs separadas → join de agregados (nunca join linha×linha) | **permanente** |
| 003 | Tabela fato sem dimensão agente na fase 1 | ativo |
| 004 | `CROSS APPLY TOP 1` para portfólio em `DIV_AUX` | **permanente** |
| 005 | Filtro de agentes exclusivamente no SQL | **permanente** |
| 006 | CPC IDs hardcoded | **permanente** |
| 007 | Agentes cross-database como entidades separadas por padrão | ativo |
| 008 | Prompts de agente em inglês | ativo |
| 009 | ADD-ONLY como disciplina de implementação | ativo |
| 010 | Regras prescritivas externalizadas em YAML | planejado |
| 011 | `freshness_status` no envelope de resposta histórica | planejado |

---

## Padrões SQL obrigatórios

Fonte: `agecob-padroes-e-antipadroes.md`

**CTE separada (correto):**
```sql
WITH CTE_Esforco AS (SELECT agente, COUNT(*) AS acionamentos FROM CTO_MASTER ... GROUP BY agente),
     CTE_Acordos AS (SELECT agente, COUNT(DISTINCT NR_RECEBIMENTO) FROM REC_MASTER ... GROUP BY agente)
SELECT E.*, A.* FROM CTE_Esforco E LEFT JOIN CTE_Acordos A ON E.agente = A.agente
```
Join direto (81s em 6 meses) → CTEs separadas (1s). **Diferença medida: 81×.**

**CROSS APPLY TOP 1 (correto):**
```sql
CROSS APPLY (SELECT TOP 1 DA.CAMPO010 FROM REC_DIVIDAS RD (NOLOCK) JOIN DIV_AUX DA (NOLOCK) ... WHERE RD.NR_RECEBIMENTO = R.NR_RECEBIMENTO) CA
```

---

## Mapa de KPIs (resumo)

Fonte: `mapa-kpis-dashboard.md`

| KPI | Fórmula | Endpoint principal |
|---|---|---|
| `qtd_acionamentos` | `COUNT(DISTINCT ID_CTO_MASTER)` (produtividade) / `COUNT` (comparação) | `/dashboard/produtividade-hoje/{db}` |
| `cpc_percentual` | `CEILING((contatos/acionamentos)×10000)/100` | produtividade/comparação |
| `taxa_conversao` | `(qtd_acordos/acionamentos)×100` | comparação/detalhamento |
| `desconto_medio_percentual` | `AVG(valor_acordo/VR_ORIGINAL×100)` com `VR_ORIGINAL > 0` | produtividade/comparação |
| `valor_primeira_parcela` | produtividade: `AVG(VALOR_P1)`; comparação: `SUM(VALOR_P1)` | ambos |
| `effectiveness_pct` | `SUM(VR_PAGO)/SUM(VALOR)×100` | `/efetividade/resumo` |

---

## Auditoria `/produtividade-agentes`

Fonte: `produtividade-agentes-consistency-audit.md`

- Data: 2026-04-22
- Resultado: **34 PASS**, 1 FAIL bloqueado por ambiente (sem `.git` local)
- Correções aplicadas: `agent_key` → minúsculas; `GROUP BY UM.CHAVE, UM.NOME`; `cache_age_seconds` nunca retorna `0` em cache hit

---

## Diário — episódio Git (2026-05-05)

Fonte: `desespero.md`

Crise de sincronização: agente IA travou durante push, local ficou desatualizado enquanto o remoto já tinha 6 commits novos. Resolvido com `git fetch` + `git reset --hard origin/main`.

**Lições:** sempre verificar `git log` antes de agir; `git reset --hard origin/main` é o atalho seguro quando o remoto é a fonte de verdade; aprender a sair do Vim (`Esc`, `:wq`, `Enter`).

---

## Referências cruzadas

- [backend.md](backend.md) — implementação das queries referenciadas aqui
- [flows.md](flows.md) — fluxos end-to-end que essas regras governam
- [security.md](security.md) — auth dos endpoints admin
