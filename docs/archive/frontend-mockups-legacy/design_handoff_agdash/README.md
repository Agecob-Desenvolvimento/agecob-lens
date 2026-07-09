# Handoff: AgDash — Dashboard Executivo

## Overview

Dashboard de gestão operacional para a **AGECOB** (Grupo Agecob), empresa de cobrança e recuperação de crédito. O sistema monitora performance de agentes de cobrança, acordos financeiros, efetividade de boletos e qualidade da operação.

O dashboard possui **3 páginas** navegáveis por sidebar:
1. **Dashboard Executivo** — visão síntese com KPIs, insight diário, heatmap de ritmo e gráficos
2. **Detalhamento de Agentes** — diagnóstico individual, contexto comparativo e ações
3. **Análise & Efetividade** — boletos, conversão, portfólio e acordos quebrados

## Sobre os Arquivos de Design

Os arquivos neste bundle são **referências de design criadas em HTML** — protótipos mostrando aparência e comportamento pretendidos, **não código de produção para copiar diretamente**.

A tarefa é **recriar estes designs HTML no ambiente do codebase alvo** (React, Next.js, Vue, etc.) usando os padrões e bibliotecas já estabelecidos no projeto — ou, se não existir ambiente ainda, escolher o framework mais adequado e implementar os designs lá.

## Fidelidade

**High-fidelity (hifi)** — Os mockups são pixel-perfect com cores finais, tipografia, espaçamento e interações funcionais. O desenvolvedor deve recriar a UI com fidelidade visual usando as bibliotecas existentes do codebase.

---

## Stack do Protótipo (referência, NÃO usar em produção)

- React 18 + Babel (inline JSX, transpilado no browser)
- Gráficos: SVG inline, desenhados manualmente (sem lib de charts)
- Sem backend — dados mockados em `data.jsx`

### Recomendação para Produção

- **Charts:** usar Recharts, Tremor, ou Chart.js para os gráficos
- **Tabelas:** usar TanStack Table ou similar para sorting/filtering
- **UI Components:** Radix UI, Shadcn/ui, ou Ant Design
- **State:** React Context ou Zustand para estado global (filtros, navegação)
- **Data fetching:** conectar a API real substituindo os mocks de `data.jsx`

---

## Design Tokens

### Cores Principais (usadas no dashboard)

```
Background página:    #f8fafc
Background cards:     #fff
Texto primário:       #0f172a
Texto secundário:     #64748b
Texto terciário:      #94a3b8
Bordas:               #e2e8f0
Borda hover/zebra:    #f1f5f9
Header table bg:      #f8fafc
```

### Cores Semânticas

```
Positivo/Success:     #047857  (text)  |  #ecfdf5 (bg)  |  #a7f3d0 (border)
Crítico/Danger:       #be123c  (text)  |  #fff1f2 (bg)  |  #fecdd3 (border)
Atenção/Warning:      #b45309  (text)  |  #fffbeb (bg)  |  #fde68a (border)
Neutro:               #475569  (text)  |  #f1f5f9 (bg)
```

### Cores de Gráficos

```
Verde principal:      #10b981  (barras financeiras)
Verde claro:          #34d399  (1ª parcela)
Verde sucesso:        #22c55e  (positivo em scatter/dots)
Azul:                 #3b82f6  (barras Pareto, portfólio)
Amarelo:              #f59e0b  (CPC, atenção)
Laranja:              #f97316  (rejeitados, linha Pareto)
Vermelho:             #ef4444  (exceções, risco alto)
Rosa:                 #f43f5e  (exceções charts)
Cinza chart:          #cbd5e1  (barras inativas)
```

### Tipografia

```
Família principal:    'Inter', system-ui, -apple-system, sans-serif
Família mono:         'JetBrains Mono', ui-monospace, monospace
```

**Pesos usados:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold), 800 (black)

### Escala Tipográfica

```
Labels uppercase:     10-11px, weight 600-700, letter-spacing 0.10-0.14em
Body/dados:           12-13px, weight 400-500
Títulos de card:      14-15px, weight 600
KPI secundário:       20-24px, weight 600
KPI primário:         40px, weight 700
```

### Espaçamento

```
Gap entre cards:      12px
Padding interno card: 16-20px
Padding da página:    24px
Gap entre seções:     24px
Border radius cards:  8px
Border radius botões: 6px
Border radius badges: 999px (pill)
```

### Sombras

```
Praticamente nenhuma. Cards usam apenas border 1px solid #e2e8f0, sem box-shadow.
```

---

## Estrutura do Layout

### Layout Global

```
┌──────────────────────────────────────────────────────┐
│ ┌─────────┐ ┌──────────────────────────────────────┐ │
│ │         │ │  Topbar (sticky)                     │ │
│ │ Sidebar │ │  ┌──────────────────────────────────┐ │ │
│ │ (220px) │ │  │  Page Content (max-w: 1280px)   │ │ │
│ │ sticky  │ │  │  padding: 24px                   │ │ │
│ │ 100vh   │ │  │                                  │ │ │
│ │         │ │  └──────────────────────────────────┘ │ │
│ └─────────┘ └──────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

- Sidebar: `width: 220px` (expandida) / `56px` (colapsada), `position: sticky`, `top: 0`, `height: 100vh`
- Topbar: `position: sticky`, `top: 0`, `z-index: 20`, borda inferior
- Content: `flex: 1`, `max-width: 1280px`, `padding: 24px 24px 48px`

### Sidebar

- **Logo:** imagem 32×32px + "AgDash" (15px, bold 700) + "EXECUTIVO" (10px, uppercase)
- **Nav agrupada** em 3 níveis com labels uppercase:
  - SÍNTESE: Dashboard Executivo
  - ANÁLISE: Detalhamento Agentes
  - DETALHE: Análise & Efetividade
- **Item ativo:** bg `#f1f5f9`, color `#0f172a`, weight 600
- **Item inativo:** color `#64748b`, weight 500
- **Footer:** versão (mono) + "Grupo Agecob"
- **Clique no logo:** toggle colapsar sidebar (animação 200ms ease)

### Topbar

- **Esquerda:** título da página (16px, semibold) + badge de versão (mono, bg `#f1f5f9`)
- **Direita:** seletor de período ("De" / "Até" com datas) + filtro de categoria segmentado (Todas / AUTOS / CONSUMER)
- **Filtro ativo:** bg `#0f172a`, color `#fff`

---

## Página 1: Dashboard Executivo

### 1.1 KPI Strip (grid 6 colunas)

**KPIs Primários** (span 2 colunas cada, 2 cards):

| KPI | Valor Mock | Formato | Delta |
|-----|-----------|---------|-------|
| Valor de Acordos | R$ 1.611.575,51 | BRL compacto | ↑12% vs meta (R$ 1.440.000) |
| 1ª Parcela | R$ 320.347,39 | BRL compacto | ↓4% vs ontem |

- Valor: 40px, bold 700, tabular-nums
- Label: 11px uppercase, letter-spacing 0.12em
- Delta: badge pill com ícone seta + percentual + texto baseline

**KPIs Secundários** (span 1 coluna cada, 7 cards):

| KPI | Valor | Formato | Delta |
|-----|-------|---------|-------|
| CPC % | 43,5% | percentual | ↑5% vs média 14d |
| Conversão % | 1,2% | percentual | ↓48% vs meta |
| Ticket Médio | R$ 4.526,90 | BRL | ↑2% vs média 14d |
| Exceções % | 1,3% | percentual | ↑8% vs meta (betterWhen: down) |
| Qtd Acordos | 356 | count | sem comparativo · "19 dias úteis" |
| Gap de Performance | R$ 89 mil | BRL | sem comparativo · "Top agente vs piso da equipe" |
| Qtd Acionamentos | 30.166 | count compact (30,2k) | →3% vs média 14d |

- Valor: 24px, semibold 600
- Label: 10px uppercase
- Delta inline: seta + pct + label (11px)

**Lógica de cores do delta:**
- `direction === betterWhen` → verde (#047857, bg #ecfdf5)
- `direction !== betterWhen` → vermelho (#be123c, bg #fff1f2)
- `direction === "flat"` → cinza (#475569, bg #f1f5f9)

### 1.2 Executive Insight Card (Daily Readout)

Banner contextual no topo. 3 variantes:

**Variante "critical":**
- Background: `#fff1f2`, border: `#fecdd3`
- Ícone: circle alert vermelho (40×40, border-radius 50%)
- Badge "CRÍTICO" (10px, uppercase, vermelho)
- Métrica destacada: valor em 36px bold
- Delta badge em pill branco
- Descrição (14.5px) + CTA button (bg vermelho, texto branco, hover mais escuro)
- Layout: flex horizontal, icon + content + CTA

**Variante "positive":**
- Background: `#ecfdf5`, border: `#a7f3d0`
- Ícone: checkmark verde (32×32)
- Badge "POSITIVO" + valor inline (20px)
- CTA como link underline verde
- Layout mais compacto, single line

**Variante "neutral":** retorna null (não renderiza)

### 1.3 Ritmo de Acordos do Dia (Heatmap)

Card com grid de 12 cards (horas 8h–19h):

```
┌──────────────────────────────────────────────────────────┐
│ RITMO DE ACORDOS DO DIA BASEADO EM DIAS SEMELHANTES     │
│ Faixa: Basal · D+21 · Projeção: 22 · Esperado: 24      │
│                                                          │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ... ┌────┐ ┌────┐          │
│ │ 8h │ │ 9h │ │10h │ │11h │     │18h │ │19h │          │
│ │esp 2│ │esp 2│ │esp 2│ │    │     │    │ │    │          │
│ │real 0│ │ —  │ │ —  │ │    │     │    │ │    │          │
│ │acum 0│ │    │ │    │ │    │     │    │ │    │          │
│ │🔴 -2│ │ · │ │ · │ │    │     │    │ │    │          │
│ └────┘ └────┘ └────┘ └────┘     └────┘ └────┘          │
│ Acumulado atual: 0                                       │
└──────────────────────────────────────────────────────────┘
```

- Grid: `repeat(12, minmax(68px, 1fr))`, gap 6
- Card com data: bg `#fff`, borda, border-radius 6
- Card sem data: bg `#f8fafc`, valores "—"
- Indicador delta: dot colorido (🔴 < 0, 🟡 = 0, 🟢 > 0) + valor delta
- Font: 11px tabular-nums

### 1.4 Seção Financeiro

**SectionHeader:** título 11px uppercase bold + badge de unidade (mono) + descrição

**2 cards lado a lado (flex row, gap 12):**

1. **Valor por Unidade de Negócio** — Grouped bar chart vertical
   - AUTOS: R$ 1,56M (verde `#10b981`) + R$ 288,9k (verde claro `#34d399`)
   - CONSUMER: R$ 50,1k + R$ 31,5k
   - Legenda: Valor Acordos / 1ª Parcela
   - Barras: 32px largura, border-radius `4px 4px 0 0`
   - Labels em cima das barras (11px, tabular-nums)

2. **Top 10 Agentes por 1ª Parcela** — Horizontal bar chart
   - Label (130px) | barra (flex) | valor (90px)
   - Barra: `#10b981`, height 22px, radius 3
   - Hover: opacity 0.85 → 1

### 1.5 Seção Eficiência

**2 cards lado a lado:**

1. **CPC % e Conversão % por UN** — Grouped bar (mesmo layout que financeiro)
   - CPC: `#f59e0b`, Conversão: `#a3a300`
   - Resumo abaixo: "Média CPC: 43,5% · Média Conv.: 1,2%"

2. **Valor 1ª Parcela por Portfólio** — Horizontal bar chart
   - Cor: `#3b82f6`

### 1.6 Seção Risco / Qualidade

**3 cards em grid 3 colunas:**

1. **Exceções por Portfólio** — Horizontal bars, cor `#f43f5e`
2. **Rejeitados por Portfólio** — Horizontal bars, cor `#f97316`
3. **Boletos Quebrados por Portfólio** — Horizontal bars, cor `#ef4444`

Cada barra é clicável → expande um **RiscoDetalhePanel** abaixo do grid:

```
┌──────────────────────────────────────────────────┐
│ Exceções — Santander Financeira X...  2 acordo(s)│  [✕]
├──────────────────────────────────────────────────┤
│ ID    │ Agente  │ Devedor │ CPF │ Valor │ Data │ Motivo │
│ EXC-001│ Wilton │ MARLENE │ 076.│R$141  │05/08 │ ...    │
└──────────────────────────────────────────────────┘
```

- Header com bg colorido (rosa/laranja/vermelho conforme tipo)
- Tabela com colunas: ID (mono), Agente+mat, Devedor, CPF, Valor, Data, Motivo

---

## Página 2: Detalhamento de Agentes

### 2.1 Filtro de Agente

- Dropdown button com ícone search + nome do agente selecionado + chevron
- Dropdown: campo de busca + lista scrollável de agentes
- "Todos" = sem filtro (default)
- Largura: max-width 360px

### 2.2 KPIs de Detalhamento

**Linha 1:** grid 4 colunas (Valor Acordos, 1ª Parcela, Qtd Acordos, Ticket Médio)
- Valor: 26px bold

**Linha 2:** grid 6 colunas (CPC%, Conversão%, Qtd Acionamentos, Qtd Contatos, Qtd Exceções, Exceções % Valor)
- Valor: 20px semibold

### 2.3 Bloco 1 — Diagnóstico Individual

**BlockHeader:** número em circle preto (24px) + título uppercase + descrição

**2 cards lado a lado:**

1. **Funil de Conversão** (waterfall horizontal)
   ```
   Acionamentos  ████████████████████████  31.967
   Contatos       ███████████              13.939   CPC: 43.6%
   Acordos        █                          372    Conv.: 2.7%
   1ª Parcela     █                      R$ 333k    Efetiv.: 19.9%
   ```
   - Barras coloridas: azul → azul claro → amarelo → verde
   - Se % < 5: barra em `#f43f5e` (crítico)
   - Anotações de perda abaixo

2. **Performance vs Meta** (bullet charts)
   - 4 métricas: CPC, Conversão, Ticket Médio, Exceções
   - Fundo em 3 bandas: vermelho (poor) → amarelo (ok) → verde (good)
   - Barra de valor sobreposta
   - Linha preta vertical = meta
   - Legenda: crítico, atenção, bom, meta

### 2.4 Bloco 2 — Contexto Comparativo

1. **Heatmap de Performance** (fullwidth)
   - Grid: agentes (linhas) × métricas (colunas): CPC%, Conv.%, Valor Acordos, Contatos, Exc.%, 1ªParc.
   - Células coloridas: verde (#dcfce7) ≥90%, amarelo (#fef9c3) 70-90%, vermelho (#fee2e2) <70%
   - Clique no header: sort por coluna (desc → asc → reset)
   - Hover: scale(1.02) na row
   - Font: 11px tabular-nums dentro das células

2. **Scatter Plot: Eficiência × Resultado × Qualidade** (SVG 720×320)
   - X: CPC × Conversão (eficiência composta)
   - Y: Valor Acordos
   - Cor do dot: verde (exc <5%), amarelo (5-15%), vermelho (>15%)
   - Tamanho do dot: proporcional a √(qtd acordos)
   - Linhas tracejadas: medianas
   - Tooltip on hover: nome, eficiência, valor, exc%

3. **Regressão de Desempenho** (SVG 720×280)
   - Mesmos eixos que scatter
   - Linha de regressão tracejada azul
   - Banda de confiança 95% (polígono azul semitransparente)
   - Pontos coloridos: verde (superperforming), cinza (esperado), vermelho (subperforming)
   - Métricas do modelo: R², N agentes, Período
   - Tooltip: valor real vs previsto + desvio

### 2.5 Bloco 3 — Ação

1. **Prioridade de Intervenção** (ranking list)
   - Score de risco = (1 - CPC) × 35 + (1 - Conv/3) × 35 + (Reprov/Acordos) × 30
   - Row: rank badge (colorido por risco) + nome + meta (mono) + sparkline (7 pontos) + risk badge (Alto/Médio/Baixo) + score + CTAs
   - Sparkline: polyline SVG, cor pela tendência (verde up, vermelho down)
   - CTAs: "Abrir Ficha" (border) + ação contextual (bg colorido)
   - Hover: bg `#f8fafc`, opacity CTAs 0.4 → 1

2. **Pareto de Resultado 80/20** (SVG bar + line chart)
   - Barras: valor por agente (azul = abaixo 80%, cinza = acima)
   - Linha laranja: % acumulado
   - Linha tracejada vermelha: marca de 80%
   - Y esquerdo: valor BRL, Y direito: %
   - Labels rotacionados -25° no eixo X
   - Summary: "X agentes geram 80% do valor" + "Concentração Top 3: XX%"

---

## Página 3: Análise & Efetividade

### 3.1 Filtro de Tipo

- Segmented control: "Primeira Parcela" (ativo: bg `#0ea5e9`) / "Colchão"

### 3.2 Efetividade de Boletos (KPIs)

Grid 4 colunas, 2 rows (8 KPIs):

| KPI | Valor | Cor |
|-----|-------|-----|
| Boletos Gerados | 303 | #0f172a |
| Pagos no Prazo | 132 | #0f172a |
| % Conversão | 43.56% | #f59e0b |
| Efetividade | 48.90% | #f59e0b |
| Valor Boletos Vencendo | R$ 301.628,35 | #0f172a |
| Valor Recebido | R$ 147.501,57 | #16a34a |
| Melhor Dia | 05/05 – 100.00% | #16a34a |
| Pior Dia | 01/05 – 0.00% | #dc2626 |

### 3.3 Efetividade Diária (chart)

- SVG responsivo (mede container width)
- Barras azuis claras (#bfdbfe, hover: #93c5fd): qtd boletos por dia
- Linha verde (#16a34a): % efetividade
- Eixo Y esquerdo: boletos (0–60), Eixo Y direito: efetividade % (0–100%)
- Labels X: a cada 2 dias (dd/mm)
- Tooltip: "dd/mm · X bol. / efet: Y%"

### 3.4 Tendência Mensal + Ranking (grid 2 colunas)

1. **Tendência Mensal — % Conversão**
   - Barras verticais: Jan–Mai/26
   - Verde (#22c55e) se normal, vermelho (#dc2626) se queda
   - Linha tracejada: média
   - Labels: percentual acima da barra + mês abaixo

2. **Ranking de Agentes (boletos)**
   - Horizontal bars, top 3 em verde (#22c55e), resto em azul (#3b82f6)
   - Label (110px) + barra + valor %

### 3.5 Portfólio

**Warning banner** (bg amarelo): alerta sobre exceção sem portfólio

**Grid 3 colunas:**
1. Valor de Acordos por Portfólio — barras verdes
2. Exceções por Portfólio — barras rosa/vermelho
3. Rejeitados por Portfólio — barras laranja

### 3.6 Boletos Quebrados (expandível com detalhes)

- Barras vermelhas clicáveis por portfólio
- Click → panel de detalhes:
  - Lista de acordos quebrados, cada um expandível
  - Row: chevron + ID (mono) + devedor + agente + valor + badge "Prevista"/"Inesperada"
  - Expandido: 2 cards (Detalhes do Acordo + Perfil do Devedor) + análise de motivo
  - Cores do risco: alto (#dc2626), médio (#f59e0b), baixo (#16a34a)

---

## Interações & Comportamento

### Navegação
- Sidebar: clique no item → muda `activeNav` → renderiza página correspondente
- Sidebar toggle: clique no logo → colapsa/expande (animação width 200ms ease)

### Hover States
- Botões de nav: bg `#f8fafc` on hover (se não ativo)
- Rows de tabela: bg `#f8fafc` on hover
- Barras de gráfico: opacity 0.85 → 1
- Links/ações: color fica mais escura
- Action buttons: opacity 0.4 → 1 (revelados no hover da row)
- Heatmap cells: scale(1.02)

### Sorting
- Tabelas e heatmap: clique no header da coluna
- Ciclo: desc → asc → reset (3 cliques)
- Indicador: seta ↓/↑ ao lado do label

### Expandir/Colapsar
- Performance table: clique no header → toggle conteúdo (chevron gira 180°)
- Acordos quebrados: clique na row → expande detalhes (chevron gira 90°)
- Barras de risco: clique → abre panel de detalhes abaixo

### Tooltips (gráficos SVG)
- Hover em pontos/barras → tooltip retangular escuro (#0f172a, opacity 0.92)
- Conteúdo: nome + valores formatados
- Posição: offset do ponto, clamped para não sair do SVG

### Transições
- Width sidebar: 200ms ease
- Background hover: 80-120ms ease
- Barras width: 400-500ms ease
- Chevron rotation: 150-200ms ease
- Scale heatmap: 80ms ease

### Dados / Formatação
- BRL: `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`
- BRL compacto (≥100k): notation "compact" (ex: R$ 1,56 mi)
- Percentual: `value.toFixed(1).replace(".", ",") + "%"`
- Números: `Intl.NumberFormat("pt-BR")`
- Count grande (≥10k): `(v / 1000).toFixed(1) + "k"`

---

## State Management

### Estado Global
- `activeNav: string` — página ativa ("home" | "detalhamento" | "analise-prod")
- `sidebarCollapsed: boolean` — sidebar expandida/colapsada

### Estado Local por Página

**Dashboard Executivo:**
- Nenhum estado significativo (dados estáticos)
- `riscoDetalhe: { type, portfolio } | null` — panel de risco expandido

**Detalhamento de Agentes:**
- `selectedAgent: string | null` — agente filtrado
- `sortCol / sortDir` — ordenação do heatmap e tabela
- `expanded: boolean` — tabela de performance expandida

**Análise & Efetividade:**
- `tipoFilter: string` — "Primeira Parcela" | "Colchão"
- `selectedPortfolio: string | null` — portfólio selecionado em boletos quebrados
- `selectedAcordo: string | null` — acordo expandido

### Data Fetching (substituir mocks)
Todos os dados vêm de constantes em `data.jsx`. Em produção, substituir por calls à API:
- `GET /api/kpis?from=...&to=...&category=...`
- `GET /api/ranking?limit=10&sort=valor`
- `GET /api/heatmap?date=today`
- `GET /api/agents?search=...`
- `GET /api/agents/:id/performance`
- `GET /api/boletos?tipo=...&from=...&to=...`
- `GET /api/portfolio/acordos?status=excecao|rejeitado|quebrado`

---

## Componentes (hierarquia)

```
App
├── Sidebar
│   ├── Logo + toggle
│   ├── NavItem (×3, agrupados por nível)
│   └── Footer (versão + nome)
├── Topbar
│   ├── Título + badge versão
│   └── DateRange + CategoryFilter
│
├── [Home] Dashboard Executivo
│   ├── ExecutiveKpiStrip
│   │   ├── PrimaryKpiCard (×2, span 2)
│   │   └── SecondaryKpiCard (×7, span 1)
│   ├── ExecutiveInsightCard (critical | positive | neutral)
│   ├── RitmoDiaHeatmap (12 hour cards)
│   └── ChartsSection
│       ├── SectionHeader
│       ├── GroupedBarChart (financeiro UN)
│       ├── HorizontalBarChart (agentes 1ªP)
│       ├── BUEfficiencyChart
│       ├── HorizontalBarChart (portfólio 1ªP)
│       └── RiscoQualidade (3 × HorizontalBarChart + RiscoDetalhePanel)
│
├── [Detalhamento] Detalhamento de Agentes
│   ├── AgentFilterBar (dropdown + search)
│   ├── DetalhamentoKpiStrip (4 primary + 6 secondary)
│   ├── Bloco 1: Diagnóstico Individual
│   │   ├── FunilConversao (waterfall)
│   │   └── BulletChartsPanel (4 × BulletChart)
│   ├── Bloco 2: Contexto Comparativo
│   │   ├── PerformanceHeatmap (agentes × métricas)
│   │   ├── ImprovedScatterPlot (SVG)
│   │   └── RegressionView (SVG + stats)
│   └── Bloco 3: Ação
│       ├── RankingPrioridade (ranked list + sparklines)
│       └── ParetoChart (SVG bar + cumulative line)
│
└── [Análise] Análise & Efetividade
    ├── TipoFilter (segmented)
    ├── BoletosKpiStrip (8 KPIs)
    ├── EfetividadeDiariaChart (SVG responsive)
    ├── TendenciaMensalChart + RankingAgentesBoletos
    ├── PortfolioSection
    │   ├── Warning banner
    │   └── 3 × HorizontalBarChart
    └── BoletosQuebradosChart
        └── AcordoQuebradoRow (expandível)
```

---

## Assets

- `design/agecob-logo.jpg` — Logo AGECOB (32×32 na sidebar)
- Fontes: Google Fonts — Inter (400-800) + JetBrains Mono (400-600)
- Sem outros assets externos — todos os ícones são SVG inline

---

## Arquivos de Referência

| Arquivo | Descrição |
|---------|-----------|
| `Dashboard Executivo.html` | Arquivo principal — entry point, monta o App |
| `design/data.jsx` | Todos os dados mockados + formatters (BRL, %, number) |
| `design/sidebar.jsx` | Sidebar + Topbar |
| `design/kpi-components.jsx` | KpiDeltaBadge + ExecutiveKpiStrip + SecondaryKpiCard |
| `design/insight-card.jsx` | ExecutiveInsightCard (banner diário) |
| `design/heatmap.jsx` | SectionHeader + RitmoDiaHeatmap |
| `design/charts.jsx` | ChartsSection + todos os chart components + RiscoDetalhePanel |
| `design/ranking-table.jsx` | ExecutiveRankingTable (não usado na versão atual) |
| `design/detalhamento.jsx` | Página Detalhamento: AgentFilterBar, KPIs, assembly |
| `design/detalhamento-diagnostico.jsx` | Bloco 1: FunilConversao + BulletChartsPanel |
| `design/detalhamento-contexto.jsx` | Bloco 2: PerformanceHeatmap + Scatter + Regressão |
| `design/detalhamento-acao.jsx` | Bloco 3: RankingPrioridade + ParetoChart + Sparkline |
| `design/analise-boletos.jsx` | Boletos KPIs + Efetividade Diária + Tendência + Ranking |
| `design/analise-portfolio.jsx` | Portfólio charts + Boletos Quebrados (expandível) |
| `design/analise-page.jsx` | Assembly da página Análise & Efetividade |
| `design/colors_and_type.css` | Design system AGECOB — CSS variables |

---

## Notas para o Desenvolvedor

1. **Formatação BRL é crítica** — usar `Intl.NumberFormat("pt-BR")` para moeda e números. Formato compacto para valores ≥100k.

2. **tabular-nums** — todos os números em tabelas e KPIs usam `font-variant-numeric: tabular-nums` para alinhamento.

3. **Gráficos SVG** — no protótipo são desenhados à mão. Em produção, usar Recharts/Tremor. Manter as cores e proporções.

4. **Responsividade** — o protótipo é otimizado para desktop (≥1280px). Considerar responsive para tablet.

5. **Acessibilidade** — o insight card usa `role="status"`. Manter semântica e contraste adequados.

6. **Performance** — heatmap e scatter com muitos pontos. Considerar virtualização se dados crescerem.

7. **Temas** — o design usa apenas tema claro. Variáveis CSS no `colors_and_type.css` facilitam futura implementação de dark mode.
