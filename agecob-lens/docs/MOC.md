---
title: Agecob — Map of Content
tags: [agecob, moc, index]
created: 2026-04-27
updated: 2026-05-19
---

# Agecob — Map of Content

Índice central da documentação do projeto **agecob-lens** (dashboard) + operação técnica.

> Reorganizado em 2026-05-19 por categoria: `specs/`, `regras/`, `plans/`, `runbooks/`, `analysis/`. Histórico em `arquivado/`.

---

## Contexto

A **Agecob** é empresa de cobrança (recuperação de crédito amigável e judicial, localização de devedores e bens, assessoria). Isaque é o único recurso técnico desde março/2026, construindo o **agecob-lens** — dashboard de produtividade que lê dos bancos COBweb e entrega visibilidade operacional pra gestão.

---

## 🚪 Entrada obrigatória

| Doc | Função |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Regras do redesign executivo. Dicionário oficial de métricas, anti-padrões, critérios de aceite. **Ler primeiro.** |
| [`TASKS.md`](TASKS.md) | Backlog em ondas (A → D). Marcar `[x]` ao concluir cada item. |

---

## 📋 specs/ — Contratos e fórmulas (source-of-truth)

| Doc | Conteúdo |
|---|---|
| [`specs/mapa-kpis-dashboard.md`](specs/mapa-kpis-dashboard.md) | Matriz oficial de KPIs com fórmulas, endpoints, tabelas-fonte. |
| [`specs/stack-arquitetura.md`](specs/stack-arquitetura.md) | Stack tecnológico, infra, backend FastAPI, SQL Server, cache. |
| [`specs/queries-efetividade.md`](specs/queries-efetividade.md) | Suite completa de queries de efetividade (diária/mensal, agente, colchão). |
| [`specs/missing-endpoints-contracts.md`](specs/missing-endpoints-contracts.md) | Placeholders de endpoints futuros (`produtividade-distribuicao`, `produtividade-historico`). |
| [`specs/refactor-main-py.md`](specs/refactor-main-py.md) | Contrato do refactor backend — constraints de KPI/endpoint preservados. |

## 📐 regras/ — Regras de negócio e padrões

| Doc | Conteúdo |
|---|---|
| [`regras/regras-de-negocio.md`](regras/regras-de-negocio.md) | Status de acordo, IDs CPC, convenção primeira parcela, coluna portfólio, agentes excluídos. |
| [`regras/id-rec-status.md`](regras/id-rec-status.md) | Enum `REC_MASTER.ID_REC_STATUS` (1..12) + constantes derivadas. |
| [`regras/padroes-e-antipadroes.md`](regras/padroes-e-antipadroes.md) | Padrões SQL: CTE separada vs row-by-row join, CROSS APPLY TOP 1. |
| [`regras/decisoes-tecnicas.md`](regras/decisoes-tecnicas.md) | ADRs simplificados: monolito, CTE, fact table, CROSS APPLY. |

## 🛠 plans/ — Planos de implementação

| Doc | Conteúdo |
|---|---|
| [`plans/redesign-executivo.md`](plans/redesign-executivo.md) | **Plano canônico do redesign.** 18 seções: princípio "Errado ou Agir", 3 camadas, Visual Encoding, InsightEngine, layouts por página, ondas A–D. |
| [`plans/pipeline-analise-operacional.md`](plans/pipeline-analise-operacional.md) | Pipeline histórico (semanas/meses): descritivo, diagnóstico, prescritivo. Fato dia × portfólio × banco. |
| [`plans/analise-operacional-extensao.md`](plans/analise-operacional-extensao.md) | Extensão da análise operacional: query unificada same-day + histórico. |
| [`plans/analise-carteira.md`](plans/analise-carteira.md) | Página de saúde de carteira: efetividade por agente, qtd_ativos/honrados/quebrados. |

## 🚀 runbooks/ — Procedimentos operacionais

| Doc | Conteúdo |
|---|---|
| [`runbooks/protocolo-deploy-ritmo-dia.md`](runbooks/protocolo-deploy-ritmo-dia.md) | Protocolo de deploy do Daily Readout (Fase 1). |

## 🔍 analysis/ — Análises e auditorias

| Doc | Conteúdo |
|---|---|
| [`analysis/data-coverage.md`](analysis/data-coverage.md) | Matriz de cobertura de dados por tela. Endpoints, placeholders, cache. |
| [`analysis/visualizacao-dash.md`](analysis/visualizacao-dash.md) | Auditoria de design da UI: 6 pontos fortes + 9 problemas. |

## 📅 Histórico

| Doc | Conteúdo |
|---|---|
| [`changelog.md`](changelog.md) | Changelog consolidado do projeto. |
| [`diario-de-bordo.md`](diario-de-bordo.md) | Timeline pessoal semanal de evolução. |
| `arquivado/` | Material legado (apenas `files.zip` mantido). |

---

## Onde estão as coisas (referências rápidas)

- **Quero a fórmula de um KPI** → `specs/mapa-kpis-dashboard.md`.
- **Quero entender um status de acordo** → `regras/id-rec-status.md`.
- **Vou criar componente novo do redesign** → `plans/redesign-executivo.md` § 14 + `CLAUDE.md`.
- **Vou mudar SQL/query** → `regras/padroes-e-antipadroes.md` + `specs/queries-efetividade.md`.
- **Vou tocar `main.py`** → `specs/refactor-main-py.md` (constraints) + `regras/decisoes-tecnicas.md`.
- **Vou trabalhar análise histórica** → `plans/pipeline-analise-operacional.md`.
- **Quero saber estado atual do projeto** → `changelog.md` + `diario-de-bordo.md`.

---

## Manutenção

- **Adicionando doc novo:** colocar na categoria certa (`specs`/`regras`/`plans`/`runbooks`/`analysis`) e adicionar linha aqui.
- **Doc obsoleto:** preferir deletar (git mantém histórico) a mover pra `arquivado/`.
- **Fonte concorrente detectada:** consolidar imediatamente — uma fórmula, um doc.
