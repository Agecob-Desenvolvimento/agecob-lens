---
title: Agecob — Map of Content
tags: [agecob, moc, index]
created: 2026-04-27
updated: 2026-04-27
---

# Agecob — Map of Content

Índice central de toda a documentação do projeto agecob-lens e da operação técnica na Agecob.

---

## Contexto

A Agecob é uma empresa de prestação de serviços de cobrança (recuperação de crédito nas esferas amigável e judicial, localização de devedores e bens, assessoria a clientes). O diferencial da empresa são profissionais altamente capacitados e treinados, com foco em recuperação de ativos e administração de carteiras.

Isaque atua como único recurso técnico (desenvolvedor + administrador de TI), desde março/2026, construindo o sistema **agecob-lens** — um dashboard de produtividade que lê dos bancos da plataforma COBweb e entrega visibilidade operacional para a gestão.

---

## Documentos por Área

### Arquitetura e Backend
- [[agecob-stack-e-arquitetura]] — Stack tecnológico, deploy, infraestrutura
- [[agecob-regras-de-negocio]] — Regras de negócio COBweb (status, IDs, expurgos, fórmulas)
- [[mapa-kpis-dashboard]] — Mapa KPI → fórmula → endpoint → origem (fonte oficial)
- [[refactor_main_py_report]] — Relatório do refactor do main.py

### Frontend e Redesign
- [[redesign_executivo_dashboard_v2]] — Plano de redesign executivo (waves A/B/C, Visual Encoding, InsightEngine)

### Pipeline Analítico
- [[pipeline-analise-operacional_v2]] — Pipeline da Análise Operacional (pirâmide analítica, tabela fato, regras prescritivas)

### Contratos e Cobertura
- [[missing-endpoints-contracts]] — Contratos de endpoints pendentes (placeholder mode)
- [[data-coverage-analysis]] — Análise de cobertura de dados e gaps

### Qualidade e Auditoria
- [[produtividade-agentes-consistency-audit]] — Auditoria de consistência do endpoint /produtividade-agentes

### Operação e Changelog
- [[agecob-changelog-consolidado]] — Changelog consolidado (Git + backend + frontend + servidor)

### Decisões e Aprendizados
- [[agecob-decisoes-tecnicas]] — Registro de decisões técnicas (ADRs resumidos)
- [[agecob-padroes-e-antipadroes]] — Padrões SQL, padrões de cache, anti-padrões descobertos

### Pessoal
- [[agecob-diario-de-bordo]] — Timeline do que foi feito, semana a semana

---

## Status Atual (2026-04-27)

| Frente | Estado |
|---|---|
| Dashboard operacional (dia) | Em produção, funcional |
| Refactor main.py | Concluído (1447 linhas, 3 changes aplicados) |
| Endpoint /produtividade-agentes | Implementado e auditado |
| Redesign executivo (waves A/B/C) | Planejado, não implementado |
| Pipeline Análise Operacional | Conceitual (v2 aprovada), fase 1 pendente de permissão DDL |
| Tabela fato_produtividade_portfolio | Estrutura definida, criação pendente |
| InsightEngine | Especificado, não implementado |
| Wave A (prompt gerado) | prompt_redesign_wave_a.md produzido |

---

## Convenções deste Vault

- Docs de referência técnica: em inglês (melhor performance com agentes Claude Code)
- Docs de decisão e diário: em português
- Tags: `#agecob`, `#backend`, `#frontend`, `#pipeline`, `#decisao`, `#auditoria`
- Links internos: `[[nome-do-doc]]` (sem extensão)
