# AgDash Redesign — Pipeline de Execução

> **Regra de ouro:** execute as ondas em ordem. Dentro de cada onda, de cima para baixo.
> Marque `[x]` apenas ao concluir e testar. Não pule itens.

---

## Fase 0 — Preparação do Ambiente (você, antes de chamar o Claude)

| # | Ação | Output esperado |
|---|------|-----------------|
| 0.1 | `git checkout T` | Branch de trabalho ativa |
| 0.2 | `git fetch origin && git merge origin/main` | Branch T sincronizada com backend atual |
| 0.3 | Criar estrutura de pastas vazia para o redesign | Esqueleto de diretórios pronto |
| 0.4 | Copiar o HTML standalone para `/reference/design-prototype.html` | Claude tem acesso visual ao alvo |
| 0.5 | Documentar endpoints existentes do `api.ts` em `/docs/api-contract.md` | Claude sabe o que pode consumir |

**Estrutura de pastas sugerida:**

```text
src/
  components/
    executive/
      kpis/
      charts/
      insights/
      tables/
  hooks/
    useExecutiveData.ts
  transforms/
    executiveMetrics.ts
  mocks/
    executiveData.ts
  types/
    executive.ts
reference/
  design-prototype.html
docs/
  api-contract.md
  redesign-plan.md
```

---

## Onda A — Fundação: Consistência, Terminologia e Formatação

> **Regra:** aplicar em todas as rotas antes de qualquer redesign visual.

### Dicionário de métricas (oficial, imutável durante o redesign)

| Métrica | Label | Tooltip / Fórmula | Unidade |
|---------|-------|-------------------|---------|
| Valor Acordos | Valor Acordos | — | BRL |
| 1ª Parcela | 1ª Parcela | — | BRL |
| CPC | CPC | `qtd_contatos / qtd_acionamentos` | % |
| Conversão | Conversão de acordos | `qtd_acordos / qtd_acionamentos` | % |
| Ticket Médio | Ticket Médio | `valor_acordos / qtd_acordos` | BRL |
| Exceções | Exceções | `valor_excecoes / valor_acordos` | % |
| Qtd Acordos | Qtd Acordos | — | count |
| Acionamentos | Acionamentos | — | count |

- [x] Auditar e renomear "Taxa de Conversão" → "Conversão de acordos" em todos os títulos e tooltips
- [x] Unificar CPC: label `CPC`, tooltip com fórmula, unidade `%`
- [x] Unificar Ticket Médio: label `Ticket Médio`, tooltip com fórmula, unidade `BRL`
- [x] Unificar Exceções: label `Exceções`, tooltip com fórmula, unidade `%`
- [x] Auditar títulos de rankings: ordenação real deve bater com o título (nenhum "Top 10" que ordena por outra métrica)

### Formatação monetária e anti-truncamento

- [x] Implementar `formatBRL(value)` (`formatBRLCompact` em `src/lib/metrics.ts`):
  - `≥ 100k` → `R$ 1,61 mi` / `R$ 450 mil` (Intl compact)
  - `< 100k` → `R$ 12.345,67` (formato completo)
  - `null` / `undefined` / `NaN` → `—`
- [x] Proibir reticências (`…`) em qualquer valor monetário no viewport principal (removido `truncate` em `ExecutiveKpiStrip` value span)
- [x] Aplicar `formatBRL` em todos os cards de valor em `Dashboard.tsx`, `AnaliseProdutividade.tsx`, `DetalhamentoAgentes.tsx`, `ComparacaoAgentes.tsx` (via `ExecutiveKpiStrip` central — BRL roteado por `formatBRLCompact`)

### Filtros: auditar e documentar

- [x] Mapear filtro **Carteira** em cada rota: onde funciona, onde é decorativo
- [x] Remover filtros decorativos do viewport executivo (ou mover para aba avançada) — `ComparacaoAgentes` é decorativo, remoção deferida p/ Onda C (escopo de redesign de página); demais rotas não têm o filtro
- [x] Documentar decisão em `docs/filter-audit.md`

---

## Onda B — Componentes Base

> **Regra:** nenhum componente de página é alterado antes de seus subcomponentes estarem prontos e testados isoladamente.

| # | Componente | Props / Responsabilidade |
|---|------------|--------------------------|
| B.1 | `KpiDeltaBadge` | `value`, `baseline`, `direction`, `unit`, `label` → formato `↑ 12% vs meta` |
| B.2 | `SectionHeader` | `title`, `description`, `unit` — separa seções analíticas |
| B.3 | `ExecutiveKpiStrip` | Grid assimétrico: 2 colunas largas para financeiros, 4 estreitas para operacionais. Integra `KpiDeltaBadge`. |
| B.4 | `ExecutiveInsightCard` | Hero banner 100% largura. Estado único dominante (`critical` \| `positive`). Omissão automática em `neutral`. |
| B.5 | `ExecutiveRankingTable` | Coluna primária + secundária + ações inline (abrir ficha / comparar / acionar). |
| B.6 | `RitmoDiaHeatmap` | Eixo X: horas. Eixo Y: métricas. Células por semáforo. Tooltip com números brutos. |
| B.7 | `AgentRegressionScatter` | Regressão linear simples no frontend. Scatter com linha de regressão + banda de confiança. Cor por resíduo (verde acima / vermelho abaixo). |

- [x] B.1 `KpiDeltaBadge` pronto e testado
- [x] B.2 `SectionHeader` pronto e testado
- [x] B.3 `ExecutiveKpiStrip` pronto e testado
- [x] B.4 `ExecutiveInsightCard` pronto e testado
- [x] B.5 `ExecutiveRankingTable` pronto e testado
- [x] B.6 `RitmoDiaHeatmap` — **descartado**: `RitmoDiaCard` (KNN dedicado) cobre o caso. Arquivo deletado.
- [x] B.7 `AgentRegressionScatter` pronto e testado

---

## Onda C — Redesign por Página

> **Regra:** aplicar componentes base. Nenhuma nova lógica de componente nesta fase.

### Home — `Dashboard.tsx`

- [x] Substituir faixa de KPIs por `ExecutiveKpiStrip`
  - **Primários:** Valor Acordos, 1ª Parcela, CPC, Conversão
  - **Secundários:** Ticket, Exceções, Qtd Acordos, Acionamentos
- [x] KPI principal `text-3xl font-bold` (md:text-3xl no `KpiCard` highlight); secundários `text-xl font-semibold`
- [x] Substituir 3 cards simétricos de "Resumo do dia" por `ExecutiveInsightCard` (hero banner único)
- [x] Implementar **omissão do hero quando estado neutro** — `ExecutiveInsightCard` retorna `null` em `data.empty`; `Index.tsx` desfaz wrap `<Card>` órfão e renderiza `RitmoDiaCard` standalone
- [x] Linha 3: 2 gráficos lado a lado (BuValueChart + BuEfficiencyChart)
- [x] Linha 4: `ExecutiveRankingTable` único — Top 10 por valor acordado, coluna secundária `qtd_acordos`
- [x] Remover: rankings duplicados — Home já tem ranking único
- [x] ~~Adicionar `RitmoDiaHeatmap`~~ — `RitmoDiaCard` (KNN) já presente, cumpre o papel operacional
- [ ] Garantir que o layout total da Home não exceda 2 scrolls em viewport 1920×1080 *(validação manual)*
- [ ] Responsividade: `lg` mantém grid completo; `md` empilha gráficos *(validação manual)*

### Análise — `AnaliseProdutividade.tsx`

- [x] Substituir cards de resumo por `ExecutiveKpiStrip` com métricas de eficiência (CPC, Conversão, Ticket, Acionamentos/Contato)
- [ ] ~~Hero banner com alerta de anomalia~~ — **deferred**: precisa baseline histórico (dia anterior / banda de confiança) que o backend atual não expõe. `ExecutiveInsightCard` "Sinais do dia" foi **removido** desta rota (anti-pattern: só Home).
- [ ] ~~Evolução temporal CPC/Conversão dual-axis~~ — **deferred**: backend não tem endpoint de série temporal CPC/Conv. Requer mudança de contrato (Onda D).
- [x] Distribuição BU — grouped bar (`GroupedVolumeChart` + `BuEfficiencyChart`) já presente no `AnaliseChartsPanel` (sem boxplot — Recharts não tem nativo)
- [x] Tabela: `ExecutiveRankingTable` — Top 10 por CPC (ordem descendente: maior CPC = melhor contato/acionamento; checklist literal "menor=melhor" estava invertido vs. fórmula oficial `contatos/acionamentos`), threshold mínimo 10 acionamentos. Coluna secundária Conversão. Ações inline deferred.
- [x] Remover ranking por valor financeiro de agente — `Top 10 Agentes por 1ª Parcela` removido de `AnaliseChartsPanel`. Rankings de portfólio/exceção/rejeitados mantidos (dimensão risco, não receita-do-agente).

### Detalhamento — `DetalhamentoAgentes.tsx`

- [x] Substituir cards simétricos por `ExecutiveKpiStrip`
- [x] Hero banner: `ExecutiveInsightCard` pessoal — Ticket do agente vs. média da BU; só renderiza quando `|delta| ≥ 10%` (omissão neutro)
- [x] Gráfico principal: `AgentRegressionScatter` integrado em `DetalhamentoChartsPanel` — X=`qtd_acionamentos`, Y=`valor_acordos`, highlight no agente. **Placeholder** (regressão OLS local; modelo real virá de outro lugar).
- [ ] ~~Evolução diária 4 séries~~ — **deferred**: backend não expõe série temporal por agente. Requer endpoint (Onda D).
- [x] Tabela: `ExecutiveRankingTable` Top 10 BU do agente, `highlightLabel` no agente selecionado, coluna primária valor / secundária qtd
- [x] Mini-cards percentil — Top X% em Valor + Top Y% em CPC (calculado em BU local). Renderiza só quando agent selecionado.
- [ ] Remover: decomposição de variação, cards de "meta" sem baseline clara

### Comparação — `ComparacaoAgentes.tsx`

- [x] Layout em 2 colunas fixas (Agente A | Agente B)
- [x] Cada coluna: `ExecutiveKpiStrip` reduzido (4 KPIs: Valor, Qtd, CPC, Conversão, sem delta)
- [x] Hero banner: `ExecutiveInsightCard` veredito automático — vencedor valor + vencedor eficiência (CPC+Conv médio); omite em empate (`|Δvalor|<100` e `|Δef|<1`)
- [x] Gráfico principal: Radar Recharts 5 dimensões (Valor/Qtd/CPC/Conversão/Ticket) normalizado pelo máximo da equipe (BU dos selecionados)
- [ ] ~~Evolução temporal sobreposta~~ — **deferred**: backend não expõe série temporal por agente
- [x] Tabela: `ExecutiveRankingTable` Top 10 BU comum, `highlightLabels` dual (amber=A, sky=B). Prop nova em `ExecutiveRankingTable`.
- [x] Remover comparação de N agentes — rewrite restringe a 2; `FilterBar` decorativo removido de `ComparacaoAgentes.tsx`. `EffortResultScatter.tsx` (dead após rewrite) deletado.

---

## Onda D — Integração Backend (sem contrato novo)

> **Regra de ouro:** nenhuma mudança de contrato API. Tudo que for implementado deve funcionar com o backend de hoje. Transformações no frontend.

- [x] Mapear `api.ts` completo: listar todos os endpoints, campos, tipos e formatos entregues hoje — ver `docs/api-contract.md`
- [x] Criar `src/mocks/executiveData.ts` com shape idêntico ao contrato real (para desenvolvimento offline) — espelha `ApiEnvelope<ProdutividadeRow>` etc., + 4 simulated séries com `isSimulated:true` + `warnOnce`
- [x] Criar `src/transforms/executiveMetrics.ts`: funções puras de transformação (`calcCPC`, `calcTicket`, `pctToFraction`, `fractionToPct`, `parseDateBackend`, re-export de `formatBRL`/`formatBRLCompact`/`formatDelta`)
- [x] Configurar proxy em `vite.config.ts` apontando para backend real — já configurado (`/api` → `VITE_API_PROXY_TARGET ?? 127.0.0.1:8000`). Não tocado.
- [x] Estratégia de dados por campo aplicada:
  - Direto: `valor_acordos`, `qtd_acordos`, `acordo_medio` (ticket), `valor_primeira_parcela` etc.
  - Transformado: `cpc_percentual`/`acordos_percentual` (0–100 → fração via `pctToFraction`)
  - Derivado: Exceções% = `valor_excecoes / valor_acordos` (frontend), Mediana de equipe, Concentração Top 3
  - Simulado: 4 séries temporais (anomaly band, CPC/Conv dual, agent daily, A/B overlay) — `isSimulated:true` + warn
- [x] Implementar `useExecutiveData` hook: orquestra chamadas, cache por rota (queryKey `["executive", route, ...]`), fallback para mocks quando `import.meta.env.DEV && VITE_USE_MOCKS === "true"`
- [x] Garantir que filtros (período, BU) propaguem corretamente para todos os novos componentes — `Detalhamento` e `Comparação` já consomem `useGlobalFilters` e propagam `dateFrom`/`dateTo`/`category` ao hook e aos charts. Auditado.

---

## Onda E — Polish, Responsividade e Animações

- [ ] Tooltips em todos os gráficos: valor bruto + percentual + label da métrica (seguindo dicionário da Onda A)
- [ ] Animações de entrada: stagger nos KPIs (100ms entre cada), fade-in nos gráficos (300ms), nenhuma animação em re-render por filtro (instantâneo)
- [ ] Loading states: skeleton screens nos cards e gráficos, nunca spinner genérico no centro da página
- [ ] Estados vazios: quando não há dados para o período selecionado, mostrar ilustração + CTA de ajuste de filtro (não "N/A" cru)
- [ ] Responsividade final: testar em 1366×768 (mínimo executivo), 1920×1080 (padrão), 2560×1440 (máximo comum)
- [ ] Acessibilidade: contrast ratio mínimo 4.5:1 em todos os textos, labels em gráficos legíveis sem hover, navegação por teclado na tabela de ranking

---

## Fase 5 — Teste de Integração e Deploy Gradual

### Teste de Integração (você executa)

| Etapa | O que validar | Quem |
|-------|---------------|------|
| 5.1 | `npm run build` passa sem erro e sem warning de dependência circular | CI/CD |
| 5.2 | Proxy aponta para backend real: filtros de período retornam dados nos 4 novos layouts | Você |
| 5.3 | Teste de regressão visual: rota antiga e nova lado a lado (com feature flag), comparar 5 métricas-chave — valores devem bater (exceto formatação) | Você |
| 5.4 | Teste de navegação: alternar Index → Análise → Detalhamento → Comparação, verificar persistência de estado do filtro | Você |
| 5.5 | Teste de performance: Lighthouse ≥ 85 Performance, ≥ 95 Accessibility (Chrome DevTools, throttling 4G) | Você |

> **Gate:** se 5.3 ou 5.4 falharem, volta para Onda D. Não avança.

### Deploy Gradual

| Etapa | Mecanismo | Controle |
|-------|-----------|----------|
| 5.6 | Implementar feature flag `showExecutiveV2` (estado global ou query param `?v2=1`) | Código |
| 5.7 | Merge da branch `T` para `main` com flag desligada (`showExecutiveV2 = false`) | Git |
| 5.8 | Ativar para seu usuário + chefe via flag por e-mail ou query param | Você |
| 5.9 | Validar leitura executiva: chefe extrai status do dia em ≤ 1 minuto na Home | Você |
| 5.10 | Rollout: 25% → 50% → 100% (monitorar erros no console e feedback) | Você |
| 5.11 | Remover feature flag e código legado 7 dias após 100% estável | Git |

---

## Checklist Final de Entrega

| Item | Status |
|------|--------|
| Branch T preparada e sincronizada com main | ☐ |
| Protótipo acessível em `/reference/design-prototype.html` | ☐ |
| API mapeada em `/docs/api-contract.md` | ☐ |
| Dicionário de métricas aplicado em todas as rotas | ☐ |
| Componentes base testados isoladamente (Storybook ou página de teste) | ☐ |
| Onda A validada (terminologia + formatação) | ☐ |
| Onda B validada (todos os 7 componentes base) | ☐ |
| Onda C validada (4 páginas redesign completas) | ☐ |
| Onda D validada (integração real, mocks removidos) | ☐ |
| Onda E validada (polish, responsividade, acessibilidade) | ☐ |
| Build limpo, zero warnings | ☐ |
| Feature flag implementada e testada | ☐ |
| Deploy 100% concluído | ☐ |
| Código legado removido da main | ☐ |
| Atualizar `agecob-lens/docs/CLAUDE.md`: trocar "Estado atual" por "Estado: redesign concluído" e remover obrigação de ler `TASKS.md` | ☐ |

---

## Prompt Modelo para o Claude

```text
Contexto:
- Projeto React + TypeScript + Tailwind, branch T
- Backend existente, endpoints em src/services/api.ts
- Protótipo visual em /reference/design-prototype.html
- Plano de redesign em /docs/redesign-plan.md

Tarefa:
1. Mapear o protótipo HTML para componentes React necessários
2. Definir props e tipos de cada componente
3. Especificar quais dados vêm da API vs. cálculos locais
4. Propor ordem de implementação em waves
5. Identificar gaps de dados (o que falta no backend)

Restrições:
- Nenhuma mudança de contrato API
- Todos os KPIs atuais preservados
- Métricas seguem dicionário oficial (CPC, conversão, ticket, exceções)
- Componentes reutilizáveis entre rotas (Index, Analise, Detalhamento, Comparacao)

Output esperado:
- Lista de componentes com responsabilidade clara
- Matriz de dados (campo → fonte → transformação necessária)
- Plano de waves com dependências
- Lista de riscos/assumptions
```
