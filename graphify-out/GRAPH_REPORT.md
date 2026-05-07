# Graph Report - .  (2026-05-06)

## Corpus Check
- 189 files · ~84,848 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 574 nodes · 1102 edges · 58 communities (48 shown, 10 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 86 edges (avg confidence: 0.83)
- Token cost: 18,500 input · 4,200 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Frontend Dashboard Components|Frontend Dashboard Components]]
- [[_COMMUNITY_Backend API Layer|Backend API Layer]]
- [[_COMMUNITY_UI Component Library|UI Component Library]]
- [[_COMMUNITY_App Shell & Navigation|App Shell & Navigation]]
- [[_COMMUNITY_Architecture Decision Records|Architecture Decision Records]]
- [[_COMMUNITY_Efetividade & Dashboard Modules|Efetividade & Dashboard Modules]]
- [[_COMMUNITY_Acordos & Query Infrastructure|Acordos & Query Infrastructure]]
- [[_COMMUNITY_Operational Docs & Notes|Operational Docs & Notes]]
- [[_COMMUNITY_API Middleware & Dependencies|API Middleware & Dependencies]]
- [[_COMMUNITY_Efetividade Service Layer|Efetividade Service Layer]]
- [[_COMMUNITY_Data Volume Analysis Scripts|Data Volume Analysis Scripts]]
- [[_COMMUNITY_Chart Query Functions|Chart Query Functions]]
- [[_COMMUNITY_Efetividade ETL Pipeline|Efetividade ETL Pipeline]]
- [[_COMMUNITY_Database Connection Pool|Database Connection Pool]]
- [[_COMMUNITY_Agent Telemetry Logger|Agent Telemetry Logger]]
- [[_COMMUNITY_Response Envelope Utils|Response Envelope Utils]]
- [[_COMMUNITY_Input Validation|Input Validation]]
- [[_COMMUNITY_Query Executor|Query Executor]]
- [[_COMMUNITY_Redis Comparator Docs|Redis Comparator Docs]]
- [[_COMMUNITY_Frontend Requirements|Frontend Requirements]]
- [[_COMMUNITY_Claude Config|Claude Config]]
- [[_COMMUNITY_Robots Txt|Robots Txt]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 51 edges
2. `request()` - 24 edges
3. `Agecob Decisões Técnicas (ADRs)` - 16 edges
4. `run_query()` - 14 edges
5. `trackEvent()` - 12 edges
6. `calcCpc()` - 11 edges
7. `calcConversao()` - 11 edges
8. `get_efetividade()` - 11 edges
9. `gerar_relatorio()` - 11 edges
10. `Pipeline Analise Operacional v2` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Dashboard v2 Feature Set` --semantically_similar_to--> `Efetividade de Boletos Module`  [INFERRED] [semantically similar]
  agecob-lens/BD.txt → pr-body.md
- `get_ef_diaria_primeira()` --calls--> `get_efetividade()`  [INFERRED]
  api/routers/efetividade.py → dominios/efetividade/servico.py
- `get_ef_mensal_primeira()` --calls--> `get_efetividade()`  [INFERRED]
  api/routers/efetividade.py → dominios/efetividade/servico.py
- `get_ef_diaria_colchao()` --calls--> `get_efetividade()`  [INFERRED]
  api/routers/efetividade.py → dominios/efetividade/servico.py
- `get_ef_mensal_colchao()` --calls--> `get_efetividade()`  [INFERRED]
  api/routers/efetividade.py → dominios/efetividade/servico.py

## Hyperedges (group relationships)
- **COBweb Databases + Backend + KPI Map form the operational data layer** — concept_cobwebrcbautos, concept_cobwebrcbconsumer, concept_fastapi_backend, docs_mapa_kpis [INFERRED 0.95]
- **Pipeline v2 + Fact Table + Prescriptive Rules form the Operational Analysis system** — docs_pipeline_v2, concept_fato_produtividade_portfolio, concept_prescriptive_rules_engine [EXTRACTED 1.00]
- **Efetividade ETL + Queries + Colchão Toggle implement the Efetividade de Boletos feature** — concept_etl_background, agecoblens_queries, concept_colchao_vencimento_toggle [INFERRED 0.85]
- **main.py Refactor — Three Structural Changes (Unified Query, SQL Filter, CTE Date Restriction)** — build_produtividade_query, filter_excluded_agents_removal, cte_saldo_original_fix [EXTRACTED 1.00]
- **Executive Dashboard — InsightEngine + KpiStrip + InsightCard form Daily Readout** — insight_engine, executive_kpi_strip, executive_insight_card [EXTRACTED 1.00]
- **Obsidian Centralisation — MOC + Decisoes + Regras as unified knowledge base** — agecob_moc, agecob_decisoes_tecnicas, agecob_regras_negocio [INFERRED 0.85]

## Communities (58 total, 10 thin omitted)

### Community 0 - "Frontend Dashboard Components"
Cohesion: 0.1
Nodes (27): DetalhamentoChartsPanel(), isApprovedAgreement(), isExceptionAgreement(), normalizeAgreementType(), fmtNum(), fmtPct(), AppSidebar(), deduplicateMessages() (+19 more)

### Community 1 - "Backend API Layer"
Cohesion: 0.07
Nodes (58): _agent_debug_startup(), _agent_log_cleanup_loop(), _agent_ndjson(), api_prefix_middleware(), _build_acordos_por_portfolio_query(), _build_agreements_tabela_query(), _build_excecoes_por_agente_query(), _build_excecoes_por_portfolio_query() (+50 more)

### Community 3 - "App Shell & Navigation"
Cohesion: 0.07
Nodes (22): addToRemoveQueue(), dispatch(), genId(), reducer(), toast(), useToast(), useInViewport(), LoadQueue (+14 more)

### Community 4 - "Architecture Decision Records"
Cohesion: 0.07
Nodes (43): ADR-001: Monolito em main.py, ADR-002: CTEs Separadas — Join de Agregados, ADR-003: Tabela Fato sem Dimensão Agente (Fase 1), ADR-004: CROSS APPLY TOP 1 para Portfólio, ADR-005: Filtro de Agentes Exclusivamente no SQL, ADR-006: CPC IDs Hardcoded, ADR-007: Agente Cross-Database como Entidades Separadas, ADR-008: Prompts de Agente em Inglês (+35 more)

### Community 5 - "Efetividade & Dashboard Modules"
Cohesion: 0.1
Nodes (25): applyAdminIndexes(), _efSuffix(), fetchAcordos(), fetchAcordosHojeAgente(), fetchAcordosPorBanco(), fetchAcordosPorPortfolio(), fetchAcordosTodos(), fetchAdminIndexesStatus() (+17 more)

### Community 6 - "Acordos & Query Infrastructure"
Cohesion: 0.08
Nodes (31): build_agreements_tabela_query(), build_produtividade_agentes_query(), build_produtividade_query(), normalize_agent_key(), Unification key across databases. Prefers CHAVE (login) over NOME., Single source of truth para produtividade-por-agente de hoje.      Parameters, ProdutividadeServico, get_acordos_por_portfolio() (+23 more)

### Community 7 - "Operational Docs & Notes"
Cohesion: 0.09
Nodes (38): Analise Operacional Extension PR, BD.txt - Context: Agecob Data Scientist Role, ID_REC_STATUS Reference Table, AgDash index.html Entry Point, Mudança: Colchão Por Vencimento Toggle, Agreement Effectiveness SQL Queries, agecob-lens Frontend README, Agecob Database (General-Purpose Storage Layer) (+30 more)

### Community 8 - "API Middleware & Dependencies"
Cohesion: 0.1
Nodes (22): ensure_validated_execution(), extract_run_id(), normalize_api_path(), rate_limit_dashboard(), require_auth(), api_prefix_middleware(), security_middleware(), CacheManager (+14 more)

### Community 9 - "Efetividade Service Layer"
Cohesion: 0.11
Nodes (27): _build_ef_diaria_colchao(), _build_ef_diaria_colchao_vencimento(), _build_ef_diaria_primeira(), _build_ef_mensal_agente_colchao(), _build_ef_mensal_agente_colchao_vencimento(), _build_ef_mensal_agente_primeira(), _build_ef_mensal_colchao(), _build_ef_mensal_colchao_vencimento() (+19 more)

### Community 10 - "Data Volume Analysis Scripts"
Cohesion: 0.22
Nodes (16): _carregar_dataframe(), _format_bytes(), gerar_relatorio(), imprimir_relatorio(), main(), _metricas_categoricas(), _metricas_historicas(), _metricas_numericas() (+8 more)

### Community 11 - "Chart Query Functions"
Cohesion: 0.22
Nodes (12): build_acordos_por_portfolio_query(), build_excecoes_por_agente_query(), build_excecoes_por_portfolio_query(), build_primeira_parcela_dia_query(), build_primeira_parcela_por_agente_query(), Gráfico: exceções agrupadas por agente., Gráfico: acordos aprovados agrupados por portfolio (CAMPO010 da DIV_AUX)., Gráfico: valor e quantidade da 1ª parcela por agente (acordos aprovados). (+4 more)

### Community 20 - "Redis Comparator Docs"
Cohesion: 1.0
Nodes (3): Redis WhatsApp Lead Comparator Architecture, Arquitetura Comparador (Redis/CRM), Redis TTL WhatsApp Lead Comparator

## Knowledge Gaps
- **57 isolated node(s):** `Retorna string no formato '(1, 3, 12)' para uso em clausula IN.`, `Single source of truth para produtividade-por-agente de hoje.      Parameters`, `Cria conexão com SQL Server usando autenticação SQL (usuário/senha).`, `Executa query e retorna lista de dicionários (linhas).`, `Imprime no terminal os nomes das colunas e no máximo N linhas.` (+52 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `UI Component Library` to `Frontend Dashboard Components`, `Efetividade & Dashboard Modules`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `quote_ident()` connect `API Middleware & Dependencies` to `Acordos & Query Infrastructure`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `trackEvent()` (e.g. with `handleDbChange()` and `handleCarteiraChange()`) actually correct?**
  _`trackEvent()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Retorna string no formato '(1, 3, 12)' para uso em clausula IN.`, `Single source of truth para produtividade-por-agente de hoje.      Parameters`, `Cria conexão com SQL Server usando autenticação SQL (usuário/senha).` to the rest of the system?**
  _57 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend Dashboard Components` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Backend API Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `UI Component Library` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._