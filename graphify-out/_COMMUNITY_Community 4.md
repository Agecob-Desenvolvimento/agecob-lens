---
type: community
cohesion: 0.07
members: 43
---

# Community 4

**Cohesion:** 0.07 - loosely connected
**Members:** 43 nodes

## Members
- [[ADR-001 Monolito em main.py]] - rationale - agecob-lens/docs/complementação e centralização/agecob-decisoes-tecnicas.md
- [[ADR-002 CTEs Separadas — Join de Agregados]] - rationale - agecob-lens/docs/complementação e centralização/agecob-decisoes-tecnicas.md
- [[ADR-003 Tabela Fato sem Dimensão Agente (Fase 1)]] - rationale - agecob-lens/docs/complementação e centralização/agecob-decisoes-tecnicas.md
- [[ADR-004 CROSS APPLY TOP 1 para Portfólio]] - rationale - agecob-lens/docs/complementação e centralização/agecob-decisoes-tecnicas.md
- [[ADR-005 Filtro de Agentes Exclusivamente no SQL]] - rationale - agecob-lens/docs/complementação e centralização/agecob-decisoes-tecnicas.md
- [[ADR-006 CPC IDs Hardcoded]] - rationale - agecob-lens/docs/complementação e centralização/agecob-decisoes-tecnicas.md
- [[ADR-007 Agente Cross-Database como Entidades Separadas]] - rationale - agecob-lens/docs/complementação e centralização/agecob-decisoes-tecnicas.md
- [[ADR-008 Prompts de Agente em Inglês]] - rationale - agecob-lens/docs/complementação e centralização/agecob-decisoes-tecnicas.md
- [[ADR-009 ADD-ONLY Discipline for Implementation Prompts]] - rationale - agecob-lens/docs/complementação e centralização/agecob-decisoes-tecnicas.md
- [[ADR-010 Regras Prescritivas em YAML Externalizado]] - rationale - agecob-lens/docs/complementação e centralização/agecob-decisoes-tecnicas.md
- [[ADR-011 Freshness Metadata no Envelope de Resposta]] - rationale - agecob-lens/docs/complementação e centralização/agecob-decisoes-tecnicas.md
- [[Agecob Changelog Consolidado]] - document - agecob-lens/docs/complementação e centralização/agecob-changelog-consolidado.md
- [[Agecob Company Logo]] - image - agecob-lens/public/logo-empresa.png
- [[Agecob Decisões Técnicas (ADRs)]] - document - agecob-lens/docs/complementação e centralização/agecob-decisoes-tecnicas.md
- [[Agecob Diário de Bordo]] - document - agecob-lens/docs/complementação e centralização/agecob-diario-de-bordo.md
- [[Agecob Map of Content (MOC)]] - document - agecob-lens/docs/complementação e centralização/agecob-moc.md
- [[Agecob Padrões e Anti-Padrões SQLCacheFrontend]] - document - agecob-lens/docs/complementação e centralização/agecob-padroes-e-antipadroes.md
- [[Agecob Regras de Negócio COBweb]] - document - agecob-lens/docs/complementação e centralização/agecob-regras-de-negocio.md
- [[Agecob Stack e Arquitetura]] - document - agecob-lens/docs/complementação e centralização/agecob-stack-e-arquitetura.md
- [[Analytical Pyramid — DescriptiveDiagnosticPrescriptive Layers]] - rationale - agecob-lens/docs/arquivado/pipeline-analise-operacional.md
- [[CTE_Saldo_Original Date Predicate Restriction]] - rationale - agecob-lens/docs/refactor_main_py.md
- [[EfetividadeAcordosPanel Component]] - rationale - agecob-lens/docs/future implem/análise Carteira.md
- [[Executive Dashboard Redesign Plan (Future — Older Version)]] - document - agecob-lens/docs/future implem/redesign_executivo_dashboard_92b7d68c.plan.md
- [[Executive Dashboard Redesign Plan v2]] - document - agecob-lens/docs/redesign_executivo_dashboard_v2.md
- [[Executive Metric Dictionary (CPC, Conversion, Ticket, Exceptions)]] - rationale - agecob-lens/docs/redesign_executivo_dashboard_v2.md
- [[ExecutiveInsightCard Component]] - rationale - agecob-lens/docs/redesign_executivo_dashboard_v2.md
- [[ExecutiveKpiStrip Component]] - rationale - agecob-lens/docs/redesign_executivo_dashboard_v2.md
- [[ExecutiveRankingTable Component]] - rationale - agecob-lens/docs/redesign_executivo_dashboard_v2.md
- [[GitHub Changelog (Archived)]] - document - agecob-lens/docs/arquivado/github-changelog.md
- [[GitHub Changelog (Centralizado)]] - document - agecob-lens/docs/complementação e centralização/github-changelog.md
- [[InsightEngine — Deterministic Frontend Insight Module]] - rationale - agecob-lens/docs/redesign_executivo_dashboard_v2.md
- [[Operational Analysis Pipeline (Future — EN)]] - document - agecob-lens/docs/future implem/pipeline-analise-operacional.md
- [[Operational Health Score — Composite KPI]] - rationale - agecob-lens/docs/redesign_executivo_dashboard_v2.md
- [[Pipeline Análise Operacional (Archived v1 — PT)]] - document - agecob-lens/docs/arquivado/pipeline-analise-operacional.md
- [[Pipeline Análise Operacional (Centralizado — PT)]] - document - agecob-lens/docs/complementação e centralização/pipeline-analise-operacional.md
- [[Pipeline Análise de Carteira (Future)]] - document - agecob-lens/docs/future implem/análise Carteira.md
- [[Refactor main.py Report]] - document - agecob-lens/docs/refactor_main_py_report.md
- [[Refactor main.py Specification]] - document - agecob-lens/docs/refactor_main_py.md
- [[Removal of Python-side Agent Filter (_filter_excluded_agents)]] - rationale - agecob-lens/docs/refactor_main_py.md
- [[Visual Encoding Specification — Chart Type Dictionary]] - rationale - agecob-lens/docs/redesign_executivo_dashboard_v2.md
- [[Wave-based Execution Plan (ABC)]] - rationale - agecob-lens/docs/redesign_executivo_dashboard_v2.md
- [[_build_produtividade_query — Unified Productivity Query Builder]] - rationale - agecob-lens/docs/refactor_main_py.md
- [[fato_produtividade_portfolio — Fact Table (day × portfolio × bank)]] - rationale - agecob-lens/docs/complementação e centralização/agecob-decisoes-tecnicas.md

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Community_4
SORT file.name ASC
```
