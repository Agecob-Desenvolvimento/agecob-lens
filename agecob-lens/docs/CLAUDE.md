# AgDash — Contexto para Claude Code

## Projeto
Redesign executivo do AgDash: transformar a interface em uma ferramenta de decisão executiva com hierarquia visual clara, semântica de KPI consistente e narrativa de ação.

## Estado atual
Reestruturação em andamento. **Antes de qualquer ação, leia `TASKS.md` e execute apenas itens não marcados com `[x]`.**
Ao concluir um item, marque-o com `[x]` imediatamente, antes de passar para o próximo.

---

## Regra de Inclusão — "Errado ou Agir"
Critério obrigatório para qualquer elemento que ocupe espaço no viewport principal:

> *"Este elemento responde, sem interação adicional, a 'O que está errado agora?' ou 'O que eu faço agora?'"*

- **Se sim:** permanece, com hierarquia visual proporcional à gravidade.
- **Se não:** é removido ou rebaixado para camada secundária (drawer, aba secundária, colapsável).

**Aplique esse critério antes de criar ou manter qualquer card, gráfico ou bloco.**

---

## Dicionário Oficial de Métricas
Estas são as únicas definições válidas. Não criar variações nem rótulos alternativos.

| Métrica | Fórmula |
|---|---|
| **CPC** | `Σ qtd_contatos / Σ qtd_acionamentos` |
| **Conversão de acordos** | `Σ qtd_acordos / Σ qtd_acionamentos` |
| **Ticket médio** | `Σ valor_acordos / Σ qtd_acordos` |
| **Exceções (% valor)** | `Σ valor_excecoes / Σ valor_acordos` |

- Proibido usar "Taxa de Conversão" sem especificar a fórmula.
- Proibido usar fórmulas concorrentes para o mesmo indicador na mesma página.
- Todo KPI exibe: rótulo curto (card), fórmula (tooltip), unidade explícita (BRL, %, count).

---

## Regras de Apresentação

### Valores monetários
- **Proibido truncar** valores monetários em cards primários.
- Formatação responsiva obrigatória: `R$ 1,61 mi` em vez de `R$ 1.611.168…`

### Hierarquia de KPIs
- KPI principal (`Valor Acordos`) ocupa **2× a área visual** dos secundários.
- Grid assimétrico: 2 colunas largas (financeiro) + 4 estreitas (operacional).
- Tipografia: `text-3xl font-bold` para primários, `text-xl font-semibold` para secundários.
- Unidades sempre como sub-label `text-sm text-muted`.

### Semântica de cor (deltas e estados)
- Verde: `emerald` — acima da meta / positivo
- Vermelho: `rose` — abaixo da meta / crítico
- Neutro: `slate`

### Baselines
Todo KPI primário exibe linha de comparação abaixo do valor absoluto.
Prioridade de fallback: **meta do período → MoM/YoD → média móvel N dias**
Formato: `↑ 12% vs meta` ou `↓ 4% vs ontem`

### Daily Readout (hero banner)
- **Estado crítico:** fundo `rose-50`, borda `rose-200`, CTA primário embutido.
- **Estado positivo:** fundo `emerald-50`, altura menor, CTA secundário.
- **Estado neutro:** **omitir o bloco inteiro.** Espaço em branco ativo.
- Nunca exibir "Sem ação imediata recomendada" como elemento visual permanente.

---

## Anti-padrões — Nunca Reintroduzir

| Anti-padrão | Ação |
|---|---|
| Bloco "Sinais do dia" fora da Home | Manter **apenas** na Home. Remover de todas as demais rotas. |
| Rankings com mesma ordenação em abas diferentes | Consolidar em um único ranking autoritativo por dimensão. |
| Decomposição contato/sem-contato em gráfico **e** tabela simultâneos | Manter só no gráfico. Tabela colapsada por padrão. |
| Card de estado neutro permanente | Converter em estado omitido. |
| Filtros sem efeito real nos dados | Remover ou conectar à filtragem real. |
| Valores monetários truncados em cards primários | Formatação responsiva obrigatória. |

---

## Arquitetura de Informação

### 3 Camadas
1. **Síntese (30s):** 4–6 KPIs fixos + Daily Readout
2. **Explicação:** máximo 2–3 gráficos por seção, separando Volume de Valor
3. **Ação:** Top oportunidades/riscos com deep links e estado pré-carregado

### Rotas e responsabilidades
| Arquivo | Pergunta que responde |
|---|---|
| `Dashboard.tsx` (Home) | "Como estamos?" |
| `AnaliseProdutividade.tsx` | "Por quê?" |
| `DetalhamentoAgentes.tsx` | "Quem / como este agente?" |
| `ComparacaoAgentes.tsx` | "Quem priorizar / alocar?" |

### Sidebar — hierarquia de zoom
- Nível 1 (Síntese): Dashboard Executivo
- Nível 2 (Análise): Produtividade → sub-itens por Escritório/BU
- Nível 3 (Detalhe): Detalhamento de Agentes
- Nível 4 (Deep Dive): Análise Profunda / Comparação

---

## Componentes

### Novos (criar do zero)
- `ExecutiveKpiStrip` — faixa de KPIs com grid assimétrico primário/secundário
- `ExecutiveInsightCard` — hero banner com CTA embutido e omissão automática em neutro
- `SectionHeader` — título + descrição + unidade
- `ExecutiveRankingTable` — ranking com coluna primária + secundária + ações inline
- `RitmoDiaHeatmap` — heatmap horas × métrica; tooltip com números brutos
- `KpiDeltaBadge` — direção + cor + baseline (meta / MoM / média móvel)

### Existentes (refatorar, não reescrever do zero)
- `AnaliseChartsPanel`
- `DashboardV2ChartsPanel`
- `DetalhamentoChartsPanel`
- `AgentComparisonDashboard`
- `AppSidebar`

---

## Critérios de Aceite Globais
- Toda página responde a "resultado", "eficiência" e "risco" sem ambiguidade de fórmula.
- Nenhum card ou gráfico redundante no mesmo contexto de viewport.
- Nenhum filtro visível sem impacto real nos dados.
- Todo KPI primário exibe baseline.
- Daily Readout em estado neutro é omitido.
- Toda tabela/ranking executivo expõe ação inline navegável.
- Valores monetários no nível primário não truncam.
- Sidebar comunica hierarquia de zoom.
