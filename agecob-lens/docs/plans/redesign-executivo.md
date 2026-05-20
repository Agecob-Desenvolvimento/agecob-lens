# Redesign Executivo do AgDash — Plano Canônico

> Documento único de referência. Consolida `redesign_executivo_dashboard_v2.md` (specs visuais + InsightEngine) e `complementacao_redesign_executivo.md` (princípios + estrutura de ondas).
>
> Regras de execução rápida e checklist de tarefas estão em [`../CLAUDE.md`](../CLAUDE.md) e [`../TASKS.md`](../TASKS.md).

---

## 1. Visão e Objetivo

Transformar o AgDash em uma interface de decisão executiva: menos blocos redundantes, narrativa explícita de ação, semântica de KPI consistente entre rotas e cabeçalho de leitura que responde em até 30 segundos a "como estamos hoje?".

A meta não é exibir mais dados — é exibir os dados certos com hierarquia visual proporcional à urgência de decisão.

---

## 2. Diagnóstico Consolidado

- Blocos de UI redundantes e não funcionais em várias rotas (ex.: filtro `Carteira` sem efeito real em algumas páginas).
- Definições inconsistentes de métricas (CPC vs conversão) e rótulos de ranking divergentes.
- Densidade excessiva de gráficos sem hierarquia explícita de leitura.
- Faixa de KPIs achatada: 10 cards com mesma tipografia, cor e tamanho — quebra o scan executivo.
- Bloco "Sinais do dia" duplicado entre rotas e simétrico demais.
- "Ritmo do dia" textual e ilegível: 4 linhas por hora forçam leitura linear.
- Sidebar plana com 6 itens — não comunica nível de zoom.
- KPIs sem baseline: número absoluto sem meta/comparativo é descrição, não sinal.
- **Sem especificação de tipo de gráfico** — documentos diziam *o que* mostrar, nunca *como* visualizar.
- **Sem lógica de Daily Readout** definida — "2 insights + 1 ação" sem source-of-truth.

---

## 3. Princípio Fundamental — Regra "Errado ou Agir"

Critério obrigatório de inclusão para qualquer elemento que ocupe espaço no viewport principal:

> *Este elemento responde, sem interação adicional, a "O que está errado agora?" ou "O que eu faço agora?"*

- **Sim:** permanece, com hierarquia visual proporcional à gravidade.
- **Não:** removido ou rebaixado para camada secundária (drawer, aba secundária, colapsável).

Aplicar antes de criar/manter qualquer card, gráfico ou bloco.

---

## 4. Arquitetura de Informação em 3 Camadas

### Camada 1 — Resposta executiva em 30 segundos
- 4–6 KPIs fixos em todas as rotas principais:
  - Resultado financeiro (`Σ valor_acordos`)
  - Caixa imediato (`Σ valor_primeira_parcela`)
  - CPC (`contatos / acionamentos`)
  - Conversão de acordos (`acordos / acionamentos`)
  - Ticket médio (`valor_acordos / qtd_acordos`)
  - Exceções (% sobre acordos ou valor)
- Daily Readout em formato de **estado dominante** (seção 7).

### Camada 2 — Explicação visual
- Máximo 2–3 gráficos por seção.
- Separar **Volume** de **Valor** quando unidades diferirem.
- Não repetir mesmo recorte/dimensão em visuais diferentes.

### Camada 3 — Ação
- Top oportunidades e riscos em linguagem de negócio.
- Destaques por BU (AUTOS vs CONSUMER) para alocação.
- Toda ação recomendada conectada por **deep link com estado pré-carregado** (seção 9).

---

## 5. Dicionário Único de Métricas + Baselines

### Definições oficiais

| Métrica | Fórmula |
|---|---|
| **CPC** | `Σ qtd_contatos / Σ qtd_acionamentos` |
| **Conversão de acordos** | `Σ qtd_acordos / Σ qtd_acionamentos` |
| **Ticket médio** | `Σ valor_acordos / Σ qtd_acordos` |
| **Exceções (% valor)** | `Σ valor_excecoes / Σ valor_acordos` |

### KPIs derivados (Onda C, frontend-only)
- **Taxa de exceções (count):** `Σ qtd_excecoes / Σ qtd_acordos * 100`
- **Concentração de resultado:** `Σ valor_acordos (Top 3) / Σ valor_acordos (total) * 100`
- **Produtividade média por agente:** `Σ valor_acordos / count(distinct agents)`
- **Operational Health Score:** média ponderada normalizada de CPC, conversão, ticket, exception rate. Escala 0–100. Headline do Daily Readout. Pesos definidos pelo negócio.
- **Eficiência marginal:** volume de acionamentos onde conversão começa a cair por agente (análise por bin).

### Política de preservação
- Todos os KPIs existentes permanecem. Redesign atua apenas em: ordem de leitura, agrupamento por prioridade, clareza de rótulo/unidade, remoção de redundância visual.

### Regras de apresentação
- Cada métrica deve expor: rótulo curto (card), fórmula padronizada (tooltip), unidade explícita (BRL, %, count).
- Proibir rótulos ambíguos ("Taxa de Conversão" sem fórmula).

### Baselines como cidadão de primeira classe
Todo KPI primário exibe linha de comparação abaixo do valor:
- **Meta do período** (se disponível na API)
- **MoM / YoD** (fallback)
- **Média móvel N dias** (fallback frontend)

Formato: `↑ 12% vs meta` ou `↓ 4% vs ontem`.

---

## 6. Hierarquia Visual da Faixa de KPIs

- **Escala dimensional proporcional:** KPI principal (`Valor Acordos`) ocupa **2× área visual** dos secundários. Grid assimétrico — 2 colunas largas (financeiro) + 4 estreitas (operacional).
- **Tipografia:** primário em `text-3xl font-bold`, secundários em `text-xl font-semibold`. Unidades como sub-label `text-sm text-muted`.
- **Semântica de cor + direção:** delta com seta e cor — verde `emerald`, vermelho `rose`, neutro `slate`.
- **Anti-truncamento:** proibir reticências em cards primários. Formatação responsiva: `R$ 1,61 mi` em vez de `R$ 1.611.168…`.

---

## 7. Daily Readout — Estado Dominante (Hero Banner)

Substituir simetria de 3 cards (crítico/positivo/ação) por **faixa horizontal única** 100% largura:

- **Estado crítico:** fundo `rose-50`, borda `rose-200`, métrica afetada em destaque, delta vs meta, **CTA primário embutido** (ex.: *"Verificar qualidade dos contatos →"* abre filtro pré-aplicado).
- **Estado positivo:** faixa `emerald-50`, altura menor, CTA secundário.
- **Estado neutro:** **omitir bloco inteiro**. Espaço em branco ativo comunica "nada a declarar".

**Regra:** nunca exibir "Sem ação imediata recomendada" como elemento permanente.

### Daily Readout — Insight Engine Specification

Módulo determinístico frontend-only (`src/lib/insightEngine.ts`). Consome dados de respostas API existentes. Sem novo endpoint.

#### Rule-to-Phrase Mapping

| Rule ID | Condição | Severidade | Template |
|---|---|---|---|
| `insight_cpc_above_avg` | CPC > média 30d (se disp.) ou CPC > 40% | `positive` | "CPC em {value}%, acima da média do escritório." |
| `insight_cpc_below_avg` | CPC < 20% | `warning` | "CPC em {value}% — abaixo do patamar operacional." |
| `insight_conversion_drop` | Conversão < 5% com > 100 acionamentos | `critical` | "Conversão em {value}% com alto volume. Verificar qualidade dos contatos." |
| `insight_exception_spike` | Exceções > 2× média (se disp.) ou > 10 no dia | `warning` | "Volume de exceções elevado: {value} hoje." |
| `insight_first_installment_high` | `valor_primeira_parcela / valor_acordos > 60%` | `positive` | "Primeira parcela em {value}% do valor — bom caixa." |
| `insight_concentration` | Top 3 agentes > 70% do total | `warning` | "Concentração: Top 3 = {value}% do valor total." |
| `action_bu_focus` | Uma BU com > 2× conversão da outra | `action` | "Considere realocar capacidade para {bu_name}." |
| `action_exception_review` | Taxa exceções > 15% | `action` | "Revisar política de exceções — taxa em {value}%." |
| `action_no_signal` | Nenhuma condição disparou | `action` | (omitir bloco) |

#### Selection Logic
1. Avaliar todas as regras.
2. Maior severidade `positive`/`warning` → slot 1.
3. Segunda maior de categoria diferente → slot 2.
4. Maior prioridade `action` → slot 3.
5. Sem regras disparadas → estado neutro (omitido).

#### Contract

```typescript
interface InsightEngineOutput {
  insight1: { text: string; severity: 'positive' | 'warning' | 'critical' };
  insight2: { text: string; severity: 'positive' | 'warning' | 'critical' };
  action: { text: string; severity: 'action' };
}

function generateDailyReadout(data: ProdutividadeData): InsightEngineOutput
```

---

## 8. Ritmo do Dia — Heatmap

Substituir bloco textual por **heatmap bidimensional** (horas × métrica):

- **Eixo X:** horas (escala comercial).
- **Eixo Y:** métricas (acionamentos, contatos, conversão).
- **Células coloridas por semáforo:** verde (acima meta), amarelo (na meta ±10%), vermelho (abaixo).
- **Leitura:** <0,5 s. Números brutos só no tooltip (esperado/realizado/acumulado/delta).
- Meta horária ausente no backend → calcular no frontend distribuindo meta diária pelas horas de operação.

---

## 9. Deep Linking e Ações Contextuais

Toda tabela/ranking executivo precisa de **ações inline** que carregam destino com estado pré-aplicado:

- **Top 10 Agentes:** "Abrir ficha" (→ DetalhamentoAgentes com agente pré-selecionado), "Comparar" (→ ComparacaoAgentes adicionando), "Acionar" (modal).
- **Scatter de Comparação:** clique em ponto → detalhamento.
- **CTA do hero banner crítico:** rota com filtros aplicados (BU=CONSUMER, período=hoje, ordenação=CPC desc).

**Técnica:** query params URL-shareable.

---

## 10. Sidebar — Hierarquia de Zoom

- **Nível 1 — Síntese:** *Dashboard Executivo* — "Como estamos?"
- **Nível 2 — Análise:** *Produtividade* — "Por quê?"
  - Sub-item: *Por Escritório/BU*
  - Sub-item: *Por Carteira*
- **Nível 3 — Detalhe:** *Agentes* — "Quem?"
  - Sub-item: *Detalhamento Individual*
  - Sub-item: *Comparação*

Indentação + ícones de escala (`LayoutDashboard` → `BarChart3` → `Users`) reforçam progressão.

---

## 11. Visual Encoding Specification (Dicionário de Tipos de Gráfico)

**Single source of truth** pra cada slot. Todos charts usam Recharts.

### Regras globais
- **Nunca misturar unidades (count vs BRL) no mesmo eixo Y.** Usar dual Y axes ou dois gráficos.
- **Nunca conectar barras categóricas com trend line.** Linhas só pra séries temporais ou dimensões contínuas.
- **Labels sempre acima das barras** (`LabelList position="top"`).
- **Locale brasileiro:** milhar `.`, decimal `,`, prefixo `R$`.
- **Codificação semântica de cor:**
  - Azul → volume/count (acionamentos, contatos, acordos qty)
  - Verde → financeiro/positivo (valor_acordos, valor_primeira_parcela)
  - Âmbar/laranja → eficiência/rate (CPC, conversão, ticket)
  - Vermelho → risco/alerta (exceções, low performance)
- **Responsivo:** `ResponsiveContainer width="100%" height={300}`. Abaixo de `md`, 1 chart por linha.

### Slots por página

#### Home — Row 3 Left: BU Outcome
| Attr | Value |
|---|---|
| Chart | `BarChart` grouped (side-by-side) |
| X | AUTOS, CONSUMER |
| Y | BRL (eixo único) |
| Bars | `valor_acordos` (green-600) + `valor_primeira_parcela` (green-400) |
| Labels | `R$ X.XXX,XX` |

#### Home — Row 3 Right: BU Efficiency
| Attr | Value |
|---|---|
| Chart | `BarChart` grouped |
| X | AUTOS, CONSUMER |
| Y | % (0–100) |
| Bars | CPC% (amber-500) + Conversão% (amber-300) |
| ReferenceLine | Média do escritório (dashed) |

#### Home — Row 4: Top 10 by Agreed Value
| Attr | Value |
|---|---|
| Chart | `BarChart` horizontal (`layout="vertical"`) |
| Y | Agentes (desc por `valor_acordos`) |
| X | BRL |
| Bars | `valor_acordos` (green-600) |
| Secundário | `qtd_acordos` como label no final da barra |

#### AnaliseProdutividade — Seção A (Financeiro)
- **A1:** `valor_acordos` por portfólio/BU — horizontal bars, cor por BU.
- **A2:** Top-N agente `valor_primeira_parcela` — horizontal bars (green-400).

#### AnaliseProdutividade — Seção B (Eficiência)
- **B1:** Volume por BU — grouped vertical (`qtd_acionamentos` blue-600 + `qtd_contatos` blue-400).
- **B2:** Conversão por BU — grouped vertical (CPC% amber-500 + Conv% amber-300), com ReferenceLine.

#### AnaliseProdutividade — Seção C (Risco/Qualidade)
- **C1:** Exceções por portfólio — horizontal bars (red-500). Dado real, `ID_REC_STATUS = 11`.
- **C2:** Exceções por agente — horizontal bars (red-400), eixo `qtd_excecoes/qtd_acordos*100`, ReferenceLine.

#### DetalhamentoAgentes — Row 2
- **Left (Volume):** vertical 2-bars (Acionamentos blue-600, Contatos blue-400). Subtítulo `CPC: XX,X%`.
- **Right (Value):** vertical 2-bars (1ª Parcela green-400, Acordos green-600). Subtítulo `Ticket médio: R$ X.XXX,XX`.

#### ComparacaoAgentes — Row 2: Effort vs Result Scatter
| Attr | Value |
|---|---|
| Chart | `ScatterChart` |
| X | `qtd_acionamentos` (esforço) |
| Y | `valor_acordos` (resultado BRL) |
| Dots | 1 por agente, cor por BU se ambos selecionados |
| Tooltip | Nome + ambos valores |
| Quadrant lines | Mediana X e Y como `ReferenceLine` dashed |

⚠ Dependência API: `/dashboard/comparacao-agentes/{db}` deve retornar ambos os campos. Validar antes.

---

## 12. Layout-Alvo por Página

### 12.1 Home — `Index.tsx`
**Objetivo:** "como estamos hoje?" em 20–30 s.

- Linha 1: KPIs com destaque dimensional em Output, Caixa, CPC, Conversão.
- Linha 1B: KPIs complementares.
- Linha 2: Daily Readout (hero banner).
- Linha 3: BU Outcome (esq) + BU Efficiency (dir).
- Linha 4: Top 10 ranking único com ações inline.

**Remover:** rankings duplicados com mesma ordenação.

### 12.2 Análise de Produtividade — `AnaliseProdutividade.tsx`
**Objetivo:** explicar *por quê*.

- Seção A — Financeiro: 2 gráficos (A1, A2).
- Seção B — Eficiência: 2 gráficos (B1, B2).
- Seção C — Risco/Qualidade: 2 gráficos (C1, C2).

**Regra:** painel único (mesclar `AnaliseChartsPanel` + `DashboardV2ChartsPanel`).
**Remover:** proxy sintético de exceções, gráficos com mesma história, "Sinais do dia" (só na Home).

### 12.3 Detalhamento — `DetalhamentoAgentes.tsx`
**Objetivo:** drill-down individual.

- Linha 1: 5 KPIs do agente (acordos, valor, CPC, conversão, ticket).
- Linha 2: Volume (esq) + Valor (dir).
- Linha 3: "Acordos de hoje" colapsável.

**Sidebar agente:** busca + atalhos Top-N.
**Anti-redundância:** decomposição contato/sem-contato só no gráfico.

### 12.4 Comparação — `ComparacaoAgentes.tsx`
**Objetivo:** alocação e coaching.

- Linha 1: 4 KPIs (melhor, pior, mediana, dispersão).
- Linha 2: Scatter esforço×resultado.
- Linha 3: Tabela ordenável com variação relativa.
- Linha 4: "Quem priorizar hoje" (Top 3 oportunidades + Top 3 riscos).

**Regra:** uma única terminologia CPC/conversão.

---

## 13. Anti-padrões a Eliminar

| Anti-padrão | Ação |
|---|---|
| "Sinais do dia" duplicado | Manter só na Home. |
| Rankings com mesma ordenação em abas distintas | Consolidar em ranking autoritativo único. |
| Decomposição contato/sem-contato em gráfico **e** tabela | Manter só no gráfico. Tabela colapsada. |
| Card neutro permanente | Converter em estado omitido. |
| Filtros sem efeito | Remover ou conectar. |
| Valores monetários truncados em cards primários | Formatação responsiva (`R$ 1,61 mi`). |

---

## 14. Componentização

### Novos (criar)
- `ExecutiveKpiStrip` — grid assimétrico primário/secundário.
- `ExecutiveInsightCard` — hero banner com CTA embutido, omissão em neutro.
- `SectionHeader` — título + descrição + unidade.
- `ExecutiveRankingTable` — coluna primária + secundária + ações inline.
- `RitmoDiaHeatmap` — heatmap horas × métrica.
- `KpiDeltaBadge` — direção + cor + baseline.

### Contratos TypeScript (resumo)

```typescript
interface ExecutiveKpiStripProps {
  kpis: Array<{
    label: string;
    value: number;
    unit: 'BRL' | '%' | 'count';
    formula?: string;
    priority: 'primary' | 'secondary';
    trend?: 'up' | 'down' | 'stable';
  }>;
  loading?: boolean;
  error?: string;
}

interface ExecutiveInsightCardProps {
  insight1: { text: string; severity: 'positive' | 'warning' | 'critical' };
  insight2: { text: string; severity: 'positive' | 'warning' | 'critical' };
  action: { text: string; severity: 'action' };
  loading?: boolean;
  empty?: boolean;
}

interface ExecutiveRankingTableProps {
  title: string;
  rows: Array<{
    rank: number;
    label: string;
    primaryValue: number;
    primaryUnit: 'BRL' | '%' | 'count';
    secondaryValue?: number;
    secondaryUnit?: 'BRL' | '%' | 'count';
  }>;
  primaryColumnLabel: string;
  secondaryColumnLabel?: string;
  maxRows?: number;
  loading?: boolean;
  empty?: boolean;
}
```

Interfaces completas em `src/types/executive.ts`.

### Existentes (refatorar)
- `AnaliseChartsPanel`
- `DashboardV2ChartsPanel`
- `DetalhamentoChartsPanel`
- `AgentComparisonDashboard`
- `AppSidebar` (reestruturação por nível de zoom)

---

## 15. Plano de Execução em Ondas

### Onda A — Consistência e Clareza
- Dicionário único de métricas em títulos/tooltips/cards.
- Corrigir labels desalinhados de ranking.
- Remover ou conectar filtros não funcionais.
- Formatação anti-truncamento em todos os cards monetários.
- Aplicar Visual Encoding aos charts existentes (resolver "Distribuição de Produtividade" com unidades mistas primeiro).

### Onda B — Reorganização por Página
- Home: síntese + ranking único + hero banner.
- Análise: consolidar em Financeiro/Eficiência/Risco. Remover Daily Readout daqui.
- Detalhamento: resumo no topo, tabela rebaixada.
- Comparação: unificar semântica.
- Aplicar hierarquia tipográfica/dimensional.

### Onda C — Valor Executivo (sem mudar backend)
- KPIs derivados (exceções/acordado, concentração, produtividade média).
- `KpiDeltaBadge` em todos primários (meta → MoM → média móvel).
- Bloco "Sinal Gerencial".
- Reestruturação sidebar.

### Onda D — Interação Profunda
- Deep linking entre rotas com estado pré-carregado.
- Ações inline em todos rankings/tabelas.
- `RitmoDiaHeatmap` substituindo bloco textual.
- Hero banner crítico com CTA navegacional.

---

## 16. Critérios de Aceite

- Toda página responde "resultado", "eficiência", "risco" sem ambiguidade de fórmula.
- Nenhum card/gráfico redundante no mesmo viewport.
- Nenhum filtro visível sem impacto real.
- Caminho de leitura executiva ≤ 1 minuto/página.
- Todo KPI primário exibe baseline.
- Daily Readout neutro é omitido.
- Toda tabela executiva expõe ação inline navegável.
- Valores monetários primários não truncam.
- Sidebar comunica hierarquia de zoom.
- Todo chart corresponde à entrada do Visual Encoding (tipo, orientação, cor, labels).
- Daily Readout gera ≥ 1 insight de dado real em dia não-vazio.

---

## 17. Riscos e Dependências

- Vistas de tendência/meta dependem de série histórica (fora das ondas iniciais).
- Validação de negócio para agregações com médias (`acordo_medio`, `desconto_medio_percentual`, `parcelamento_medio`).
- Exceções: garantir dado real, sem proxies sintéticos.
- Meta horária heatmap: ausente no backend → derivar no frontend (validar curva com negócio).
- **ScatterChart Comparação:** `/dashboard/comparacao-agentes/{db}` deve retornar `qtd_acionamentos` + `valor_acordos` na mesma resposta. Validar; senão é mudança de contrato.
- **Operational Health Score:** pesos precisam sign-off do negócio.
- **InsightEngine thresholds** (CPC 20%/40%, exceções 2×, concentração 70%): estimativas iniciais, calibrar pós-deploy.

---

## 18. Referência Cruzada — Pipeline de Análise Operacional

Este plano cobre o **dashboard de mesmo-dia**. O documento [`pipeline-analise-operacional.md`](pipeline-analise-operacional.md) cobre a **análise histórica/médio prazo** (semanas/meses) com camadas descritiva, diagnóstica, prescritiva.

Fluxo mental do usuário:

```
Index (síntese de hoje)
  ├── "Preciso detalhe" → DetalhamentoAgentes
  ├── "Preciso comparar" → ComparacaoAgentes
  ├── "Por quê hoje" → AnaliseProdutividade
  └── "Padrões históricos" → AnaliseOperacional
       ├── Descritivo → "o que aconteceu"
       ├── Diagnóstico → "por quê"
       └── Prescritivo → "o que fazer"
```

Gap conhecido: pipeline operacional sem `corte=bu` diagnóstico AUTOS vs CONSUMER ao longo do tempo. Adicionar no doc do pipeline.
