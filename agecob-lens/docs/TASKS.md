# AgDash Redesign — Tasks

> Execute as ondas em ordem. Dentro de cada onda, execute os itens de cima para baixo.
> Marque `[x]` imediatamente ao concluir cada item, antes de passar para o próximo.

---

## Onda A — Consistência e Clareza

### Terminologia e rótulos
- [ ] Auditar todas as ocorrências de "Taxa de Conversão" sem fórmula e renomear para "Conversão de acordos"
- [ ] Unificar rótulo CPC com fórmula `qtd_contatos / qtd_acionamentos` em todas as rotas
- [ ] Auditar e corrigir títulos de rankings que não batem com a ordenação real

### Formatação monetária
- [ ] Implementar utilitário de formatação responsiva (ex.: `formatBRL(value)` → `R$ 1,61 mi`)
- [ ] Aplicar `formatBRL` em todos os cards primários de `Dashboard.tsx`
- [ ] Aplicar `formatBRL` em todos os cards primários de `AnaliseProdutividade.tsx`
- [ ] Aplicar `formatBRL` em todos os cards primários de `DetalhamentoAgentes.tsx`
- [ ] Aplicar `formatBRL` em todos os cards primários de `ComparacaoAgentes.tsx`

### Filtros sem efeito
- [ ] Auditar filtro `Carteira` em cada rota e documentar onde não tem efeito real
- [ ] Remover ou conectar `Carteira` à filtragem real em cada rota identificada

---

## Onda B — Reorganização por Página

### Componentes novos (criar antes de aplicar nas páginas)
- [ ] Criar `KpiDeltaBadge`: props `value`, `baseline`, `direction`, `unit` — formato `↑ 12% vs meta`
- [ ] Criar `SectionHeader`: props `title`, `description`, `unit`
- [ ] Criar `ExecutiveKpiStrip`: grid assimétrico, 2 colunas largas + 4 estreitas, integra `KpiDeltaBadge`
- [ ] Criar `ExecutiveInsightCard`: hero banner 100% largura, omissão automática em estado neutro
- [ ] Criar `ExecutiveRankingTable`: coluna primária + secundária + ações inline (abrir / comparar / acionar)

### Home — `Dashboard.tsx`
- [ ] Substituir faixa de KPIs atual por `ExecutiveKpiStrip` (primários: Output, Caixa, CPC, Conversão)
- [ ] KPI principal (`Valor Acordos`) com `text-3xl font-bold`; secundários com `text-xl font-semibold`
- [ ] Substituir 3 cards simétricos do Daily Readout por `ExecutiveInsightCard` (hero banner)
- [ ] Implementar omissão do hero banner em estado neutro (espaço em branco)
- [ ] Linha 3: 2 gráficos — resultado por BU (esquerda) e eficiência por BU (direita)
- [ ] Linha 4: substituir rankings duplicados por `ExecutiveRankingTable` único (Top 10 por valor acordado)

### Análise de Produtividade — `AnaliseProdutividade.tsx`
- [ ] Remover bloco "Sinais do dia" desta rota
- [ ] Mesclar `AnaliseChartsPanel` + `DashboardV2ChartsPanel` em painel único
- [ ] Seção A (Financeiro): 2 gráficos — `valor_acordos` por portfólio/BU + Top-N `valor_primeira_parcela`
- [ ] Seção B (Eficiência): 2 gráficos — separar Volume de Valor; conversão por BU
- [ ] Seção C (Risco/Qualidade): 2 gráficos — exceções por portfólio e por agente
- [ ] Remover qualquer gráfico que repita a mesma dimensão/recorte de outro na página

### Detalhamento de Agentes — `DetalhamentoAgentes.tsx`
- [ ] Linha 1: resumo compacto do agente selecionado (5 KPIs: acordos, valor, CPC, conversão, ticket)
- [ ] Linha 2: 2 gráficos — Volume (acionamentos/contatos) e Valor (1ª parcela/acordos)
- [ ] Tabela "Acordos de hoje" colapsada por padrão, expansível sob demanda
- [ ] Remover decomposição contato/sem-contato em gráfico e tabela ao mesmo tempo — manter só no gráfico

### Comparação de Agentes — `ComparacaoAgentes.tsx`
- [ ] Linha 1: 4 KPIs comparativos (melhor, pior, mediana, dispersão)
- [ ] Linha 2: scatter `qtd_acionamentos` vs `valor_acordos`
- [ ] Linha 3: tabela comparativa ordenada pela métrica selecionada, com variação relativa
- [ ] Linha 4: bloco "Quem priorizar hoje" (Top 3 oportunidades + Top 3 riscos) com CTAs inline
- [ ] Remover fórmulas concorrentes de CPC/conversão — usar apenas dicionário oficial

---

## Onda C — Valor Executivo

### KpiDeltaBadge em todas as rotas
- [ ] Aplicar `KpiDeltaBadge` em todos os KPIs primários de `Dashboard.tsx`
- [ ] Aplicar `KpiDeltaBadge` em todos os KPIs primários de `AnaliseProdutividade.tsx`
- [ ] Aplicar `KpiDeltaBadge` em todos os KPIs primários de `DetalhamentoAgentes.tsx`
- [ ] Aplicar `KpiDeltaBadge` em todos os KPIs primários de `ComparacaoAgentes.tsx`
- [ ] Implementar lógica de fallback no badge: meta → MoM → média móvel N dias

### KPIs derivados (frontend, sem mudança de backend)
- [ ] KPI: razão exceções/valor acordado (`valor_excecoes / valor_acordos`)
- [ ] KPI: concentração de resultado (Top 3 agentes / total)
- [ ] KPI: produtividade média por agente

### Bloco de sinal gerencial
- [ ] Criar bloco "Sinal Gerencial" com recomendações objetivas (foco BU, revisão de exceções, redistribuição)

### Sidebar
- [ ] Reestruturar `AppSidebar` por nível de zoom: Síntese → Análise → Detalhe → Deep Dive
- [ ] Adicionar sub-itens em Produtividade: Por Escritório/BU

---

## Onda D — Interação Profunda

### Deep linking
- [ ] Implementar utilitário de deep link com query parameters URL-shareable
- [ ] `ExecutiveRankingTable` (Home): ação "Abrir ficha" navega para `DetalhamentoAgentes` com agente pré-selecionado
- [ ] `ExecutiveRankingTable` (Home): ação "Comparar" adiciona agente à seleção em `ComparacaoAgentes`
- [ ] Scatter de `ComparacaoAgentes`: clique no ponto navega para `DetalhamentoAgentes` com agente pré-selecionado
- [ ] CTA do `ExecutiveInsightCard` crítico: carrega rota com filtros já aplicados (BU, período, ordenação)

### Heatmap do Ritmo do Dia
- [ ] Criar `RitmoDiaHeatmap`: eixo X horas, eixo Y métricas (acionamentos, contatos, conversão)
- [ ] Células coloridas por semáforo (emerald/yellow/rose vs meta)
- [ ] Tooltip com números brutos (esperado / realizado / acumulado / delta)
- [ ] Se meta horária ausente no backend: calcular no frontend distribuindo meta diária pelas horas de operação
- [ ] Substituir bloco textual atual de Ritmo do Dia pelo `RitmoDiaHeatmap`
