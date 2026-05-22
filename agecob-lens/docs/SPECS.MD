0 · Tokens consolidados
Bloco para colar no CLAUDE.md
Dicionário visual mínimo para que qualquer agente que entre no projeto produza componentes consistentes sem reinterpretar a paleta. Apenas tokens com uso real nos 6 componentes abaixo.

Paleta semântica
Crítico · rose
rose-50
#fff1f2
rose-200
#fecdd3
rose-500
#f43f5e
rose-700
#be123c
Positivo · emerald
emerald-50
#ecfdf5
emerald-200
#a7f3d0
emerald-500
#10b981
emerald-700
#047857
Atenção · amber
amber-50
#fffbeb
amber-200
#fde68a
amber-500
#f59e0b
amber-700
#b45309
Neutro · slate
slate-50
#f8fafc
slate-200
#e2e8f0
slate-500
#64748b
slate-900
#0f172a
Acento sky-600 #0284c7 reservado para CTAs em estado "ação" (insight neutro de chamada para ação). Não usar em rotina de KPI.

Escala tipográfica
R$ 1,61 mi
text-4xl · font-bold · tabular-nums
KPI primário
R$ 4.526,90
text-2xl · font-semibold
KPI secundário
Top 10 por Valor
text-lg · font-semibold
Título de bloco
RITMO DO DIA
text-xs · tracking-wider · uppercase
Eyebrow / rótulo
Texto descritivo de seção
text-sm · text-slate-600
Body
Eixo Y: % de acionamentos
text-xs · text-slate-500
Caption / legenda
Espaçamento + radii
Card padding
p-5
20px
Card gap (row)
gap-3
12px
Section spacing
space-y-6
24px
Page gutters
px-6 / py-8
Radius (cards)
rounded-lg
8px
Radius (chip)
rounded-full
Borda padrão
border-slate-200
Hover linha
hover:bg-slate-50
Bloco markdown — copy & paste
## Design tokens — AgDash Executivo

### Paleta semântica (Tailwind 3.x)
- Crítico      → bg rose-50    · border rose-200    · text rose-700    · accent rose-500
- Positivo     → bg emerald-50 · border emerald-200 · text emerald-700 · accent emerald-500
- Atenção      → bg amber-50   · border amber-200   · text amber-700   · accent amber-500
- Neutro       → bg white      · border slate-200   · text slate-700   · muted slate-500
- CTA / Ação   → bg sky-50     · border sky-200     · text sky-700     · accent sky-600

### Tipografia
- font-family base: font-sans (Inter), números com tabular-nums
- KPI primário      → text-4xl font-bold tracking-tight tabular-nums
- KPI secundário    → text-2xl font-semibold tabular-nums
- Título de bloco   → text-lg font-semibold text-slate-900
- Eyebrow / rótulo  → text-xs uppercase tracking-[0.12em] font-semibold text-slate-500
- Body              → text-sm text-slate-600 leading-relaxed
- Caption           → text-xs text-slate-500
- Unidade (sub)     → text-sm font-medium text-slate-400

### Espaçamento
- Card padding      → p-5           (20px)
- Card gap          → gap-3         (12px)
- Section spacing   → space-y-6     (24px)
- Page gutters      → px-6 py-8
- Radius (cards)    → rounded-lg    (8px)
- Radius (chips)    → rounded-full
- Borda padrão      → border border-slate-200
- Hover linha       → hover:bg-slate-50
- Sombra (apenas hover de elementos clicáveis) → hover:shadow-sm

### Regras de uso
- Anti-truncamento monetário: valores primários NUNCA usam truncate. Formatar via formatBRLCompact() → "R$ 1,61 mi".
- Semântica fixa: rose=crítico, emerald=positivo, amber=atenção, slate=neutro, sky=ação.
- Sombras decorativas proibidas. Hierarquia por tipografia e tamanho, não por shadow.
- Estado neutro: componentes que devem ser OMITIDOS em neutro NUNCA renderizam placeholder visual.
0.5 · Mapeamento na stack — agecob-lens/
Onde cada componente se apoia
React 18 + Vite + Tailwind 3.4 + shadcn/ui sobre Radix + lucide-react + Recharts + React Query + React Router. Os componentes novos não inventam primitivas — eles compõem o que já está no projeto via shadcn pattern (CVA + utility classes + Radix).

Componente	Primitivas (shadcn/Radix)	Libs adicionais	Padrão
ExecutiveKpiStrip	Card · CardHeader · CardContent · Skeleton	—	Wrapper composto: <Card> com prop variant (primary / secondary) via CVA. Grid no host (className="grid grid-cols-6 gap-3").
KpiDeltaBadge	Badge (shadcn) — extender com CVA	lucide-react: ArrowUpRight, ArrowDownRight, Minus, AlertCircle	Variantes via cva(): positive | critical | attention | neutral | empty. Lógica betterWhen resolve a variante a partir do delta + impacto.
ExecutiveInsightCard	Alert · AlertTitle · AlertDescription · Button	lucide-react: AlertCircle, Check, ArrowRight	<Alert variant="critical|positive"> com CVA estendida. CTA usa <Button variant="default" size="sm"> em crítico, variant="link" em positivo. Neutro → componente retorna null.
SectionHeader	— (componente próprio, sem primitiva shadcn correspondente)	—	Componente leve. Tag de unidade pode reusar <Badge variant="outline"> com classes font-mono text-[10px].
ExecutiveRankingTable	Table · TableHeader · TableBody · TableRow · TableCell · Button (ghost+icon) · Tooltip · Skeleton	lucide-react: ExternalLink, ArrowLeftRight, Phone, AlertTriangle	Ações inline: <Button variant="ghost" size="icon" className="h-7 w-7"> envoltas em <Tooltip>. Deep link via useNavigate() + useSearchParams().
RitmoDiaHeatmap	Tooltip · TooltipTrigger · TooltipContent · Card	Não usar Recharts (sem suporte nativo a heatmap). Grid Tailwind custom + lucide Hourglass para hora atual.	Cada célula é um <TooltipTrigger asChild> envolvendo um <button> com classes semáforo. Recharts fica para os gráficos existentes (BU, scatter, barras).
Helper — formatBRL responsivo (anti-truncamento)
Util puro, sem dependência externa. Coloca em src/lib/format.ts. Usar em todos os KPIs primários — nunca formatar BRL inline.

// src/lib/format.ts

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 2,
});

/**
 * Formata BRL com fallback responsivo. Nunca trunca.
 *   formatBRLCompact(1611575.51)           → "R$ 1,61 mi"
 *   formatBRLCompact(1611575.51, "full")   → "R$ 1.611.575,51"
 *   formatBRLCompact(0)                    → "R$ 0,00"
 *   formatBRLCompact(null)                 → "—"
 */
export function formatBRLCompact(
  value: number | null | undefined,
  mode: "auto" | "full" | "compact" = "auto",
): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (mode === "full") return brl.format(value);
  if (mode === "compact") return brlCompact.format(value);
  // auto: compacto a partir de R$ 100k
  return Math.abs(value) >= 100_000 ? brlCompact.format(value) : brl.format(value);
}

/**
 * Formata percentual com sinal explícito.
 *   formatDelta(0.124, "up")  → "↑ 12%"
 *   formatDelta(0.041, "down") → "↓ 4%"
 */
export function formatDelta(value: number, direction: "up" | "down" | "flat"): string {
  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
  return `${arrow} ${Math.round(Math.abs(value) * 100)}%`;
}
Padrão CVA — exemplo (KpiDeltaBadge)
Forma canônica. Replicar a estrutura para ExecutiveKpiStrip (variant primary/secondary) e ExecutiveInsightCard (variant critical/positive).

// src/components/executive/KpiDeltaBadge.tsx
import { cva, type VariantProps } from "class-variance-authority";
import { ArrowUpRight, ArrowDownRight, Minus, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const badge = cva(
  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold tabular-nums",
  {
    variants: {
      tone: {
        positive:  "bg-emerald-50 text-emerald-700",
        critical:  "bg-rose-50 text-rose-700",
        attention: "bg-amber-50 text-amber-700",
        neutral:   "bg-slate-100 text-slate-600",
        empty:     "bg-slate-50 text-slate-400 border border-dashed border-slate-200 font-medium",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

type Props = {
  value: number | null;        // delta como fração (0.124 = 12,4%)
  direction: "up" | "down" | "flat";
  baseline: "meta" | "period" | "movavg" | null;
  betterWhen?: "up" | "down";   // default "up"
};

export function KpiDeltaBadge({ value, direction, baseline, betterWhen = "up" }: Props) {
  if (baseline === null || value === null) {
    return <span className={badge({ tone: "empty" })}>sem comparativo</span>;
  }
  const tone = direction === "flat" ? "neutral"
    : (direction === betterWhen ? "positive" : "critical");
  const Icon = direction === "up" ? ArrowUpRight
    : direction === "down" ? ArrowDownRight : Minus;
  const label = baseline === "meta" ? "vs meta"
    : baseline === "period" ? "vs ontem" : "vs média 14d";

  return (
    <span className="flex items-center gap-2">
      <span className={badge({ tone })}>
        <Icon size={12} strokeWidth={2.5} />
        {Math.round(Math.abs(value) * 100)}%
      </span>
      <span className="text-[12px] text-slate-500">{label}</span>
    </span>
  );
}
Deep link — useSearchParams
Hook utilitário para CTAs do ExecutiveInsightCard e ações inline do ExecutiveRankingTable. Estado URL-shareable.

// src/lib/deep-link.ts
import { useNavigate } from "react-router-dom";

export type DeepLink = {
  to: string;                              // "/agentes/detalhamento"
  params?: Record<string, string | number>;  // { agent: "63928", bu: "autos" }
};

export function useDeepLink() {
  const navigate = useNavigate();
  return ({ to, params }: DeepLink) => {
    const qs = params
      ? "?" + new URLSearchParams(
          Object.fromEntries(
            Object.entries(params).map(([k, v]) => [k, String(v)]),
          ),
        ).toString()
      : "";
    navigate(to + qs);
  };
}

/* Uso, dentro de uma ação inline da ranking table:
 *
 *   const goto = useDeepLink();
 *   <Button onClick={() => goto({ to: "/agentes/comparacao", params: { add: row.id } })} />
 */
0.6 · Integração no agecob-lens — checklist de adesão
O que ajustar antes de implementar
O spec acima usa nomes Tailwind (emerald-500, rose-500) por clareza visual. O projeto usa HSL tokens via CSS vars + dark mode, então o caminho real é: criar tokens semânticos no index.css, expor no tailwind.config.ts, e usar bg-success / bg-danger-soft em lugar de bg-emerald-50.

1 · Bridge de tokens semânticos
Adicionar ao src/index.css, dentro dos blocos :root e .dark já existentes. Mantenha o padrão HSL (sem hsl() no valor).

/* src/index.css — dentro de :root */
/* Semânticos executivos (HSL, sem hsl() wrapper) */
--success:        142 76% 36%;   /* emerald-600 */
--success-soft:   151 81% 96%;   /* emerald-50  */
--success-border: 152 76% 80%;   /* emerald-200 */
--success-fg:     160 84% 22%;   /* emerald-800 */

--danger:         347 89% 60%;   /* rose-500  */
--danger-soft:    355 100% 97%;  /* rose-50   */
--danger-border:  354 96% 89%;   /* rose-200  */
--danger-fg:      345 83% 41%;   /* rose-700  */

--warning:        38 92% 50%;    /* amber-500 */
--warning-soft:   48 100% 96%;   /* amber-50  */
--warning-border: 48 96% 76%;    /* amber-200 */
--warning-fg:     26 90% 37%;    /* amber-700 */

/* src/index.css — dentro de .dark, mantém matiz mas escurece os fundos: */
--success-soft:   151 70% 12%;
--success-border: 152 60% 22%;
--success-fg:     151 80% 70%;

--danger-soft:    355 70% 15%;
--danger-border:  354 60% 28%;
--danger-fg:      354 90% 78%;

--warning-soft:   38 70% 13%;
--warning-border: 38 60% 25%;
--warning-fg:     38 90% 72%;
2 · Expor no tailwind.config.ts
// tailwind.config.ts — extend.colors
success: {
  DEFAULT: "hsl(var(--success))",
  soft:    "hsl(var(--success-soft))",
  border:  "hsl(var(--success-border))",
  fg:      "hsl(var(--success-fg))",
},
danger: {
  DEFAULT: "hsl(var(--danger))",
  soft:    "hsl(var(--danger-soft))",
  border:  "hsl(var(--danger-border))",
  fg:      "hsl(var(--danger-fg))",
},
warning: {
  DEFAULT: "hsl(var(--warning))",
  soft:    "hsl(var(--warning-soft))",
  border:  "hsl(var(--warning-border))",
  fg:      "hsl(var(--warning-fg))",
},
A partir daí, bg-success-soft text-success-fg border-success-border substitui o trio bg-emerald-50 text-emerald-700 border-emerald-200 em todo o spec. Dark mode passa a funcionar automaticamente.

3 · Tabela de substituição (apply & replace)
No spec acima	No código real	Significado
bg-emerald-50	bg-success-soft	Fundo positivo
border-emerald-200	border-success-border	Borda positivo
text-emerald-700	text-success-fg	Texto positivo
bg-emerald-500	bg-success	Sólido positivo (heatmap)
bg-rose-50 / 200 / 500 / 700	bg-danger-soft / -border / DEFAULT / -fg	Crítico
bg-amber-50 / 200 / 400 / 700	bg-warning-soft / -border / DEFAULT / -fg	Atenção
bg-slate-50 / 100 / 200	bg-muted / bg-secondary / border-border	Neutro (já existem no projeto)
text-slate-500 / 700 / 900	text-muted-foreground / text-foreground	Texto neutro
bg-white	bg-card	Superfície de card
bg-slate-900 text-white (tooltip)	bg-popover text-popover-foreground	Tooltip / popover
4 · Infraestrutura existente — consumir, não duplicar
src/components/executive/
Diretório já existe. Antes de criar ExecutiveKpiStrip/ExecutiveInsightCard, conferir o que mora aí — pode haver base inicial para refatorar em vez de começar do zero.

src/lib/metrics.ts
Fonte oficial das fórmulas (CPC, conversão, ticket, exceções). Não criar fórmula concorrente dentro de componente. Adicionar formatBRLCompact/formatDelta aqui.

src/lib/insightEngine.ts
Gerador dos insights do Daily Readout. Refatorar para retornar {variant: 'critical' | 'positive' | null, ...} consumido pelo ExecutiveInsightCard. null → omissão automática.

src/contexts/GlobalFiltersContext
Período / BU / Carteira já centralizados. Componentes novos consomem via useGlobalFilters(). Nada de filtro paralelo. CTAs de deep link manipulam URL params; o context relê.

React Query — useProdutividadeData pattern
Para a Home nova: criar useExecutiveDashboard(filters) no mesmo padrão. Chamada via src/services/api.ts (que já fala com o proxy /api → FastAPI). Nada de fetch() solto.

src/components/ui/ — shadcn primitives
Compor em cima. Não duplicar Card/Badge/Alert/Table/Tooltip — já existem.

5 · Telemetria — PostHog em CTAs e deep links
Toda interação executiva (CTA do hero, ações inline do ranking, clique no heatmap) deve passar por src/services/analytics.ts. Versão evoluída do useDeepLink:

// src/lib/deep-link.ts
import { useNavigate } from "react-router-dom";
import { trackEvent } from "@/services/analytics";

export type DeepLink = {
  to: string;
  params?: Record<string, string | number>;
  source: string;        // "insight_card.critical" | "ranking.open_agent" …
};

export function useDeepLink() {
  const navigate = useNavigate();
  return ({ to, params, source }: DeepLink) => {
    trackEvent("executive_deep_link", { source, to, params });
    const qs = params
      ? "?" + new URLSearchParams(
          Object.fromEntries(
            Object.entries(params).map(([k, v]) => [k, String(v)]),
          ),
        ).toString()
      : "";
    navigate(to + qs);
  };
}
Eventos sugeridos: executive_deep_link (genérico), insight_cta_click, ranking_action (props: agent_id, action), heatmap_cell_hover (opcional, com debounce).

6 · Testes mínimos por componente (Vitest + Testing Library)
Componente	Cenários obrigatórios
formatBRLCompact	R$ 1.611.575,51 abaixo do threshold (full) · acima ("R$ 1,61 mi") · zero · null/undefined → "—" · negativo
KpiDeltaBadge	Direction up + betterWhen=down (Exceções crescendo → crítico) · baseline null → chip "sem comparativo" · |value| < 0.01 → neutro
ExecutiveInsightCard	variant=null → não renderiza nada (asserir queryByRole("status") = null) · crítico renderiza CTA · click no CTA navega + dispara trackEvent
ExecutiveRankingTable	Top 3 com rank pill emerald · estado vazio renderiza nota · ações ficam acessíveis por teclado
RitmoDiaHeatmap	Sem meta disponível → omitido com nota · célula pendente não abre tooltip numérico · hora atual recebe ring
ExecutiveKpiStrip	Anti-truncamento: valor maior que largura conténer usa formato compacto · estado empty renderiza "—" sem badge
7 · Ordem de execução recomendada
1
Tokens semânticos em index.css + tailwind.config.ts (light + dark). PR menor possível, isolado.
2
formatBRLCompact + formatDelta em src/lib/metrics.ts. Testes Vitest. Substituir formatações ad-hoc existentes (vai pegar alguns lugares além do redesign — cuidado com diff).
3
KpiDeltaBadge → ExecutiveKpiStrip → ExecutiveInsightCard → ExecutiveRankingTable. Cada um isolado, com testes mínimos da tabela acima.
4
Aplicar página a página, na ordem do plano: Home (referência visual) → Análise de Produtividade (remover Sinais do dia daqui) → Detalhamento → Comparação. Cada PR encerra uma rota.
5
RitmoDiaHeatmap isolado depois (depende de meta horária — validação de negócio).
6
Sidebar + deep linking por último. Mexer no AppSidebar.tsx e em roteamento aninhado React Router. Maior risco de regressão — deixa para o fim com tudo já testado.
8 · Pegadinhas a observar
HMR overlay desabilitado: erros runtime só aparecem no console, não na tela. Verificar antes de declarar pronto.
Proxy /api depende do FastAPI rodando em 127.0.0.1:8000. Sem ele, todos os hooks de dados quebram — use mocks no Vitest, não no dev.
lovable-tagger injeta atributos DOM em dev. Não assertar contagem ou ordem de atributos nos testes.
Recharts está em chunk separado — não importar libs grandes novas sem checar bundle. O Heatmap deliberadamente não usa Recharts.
__COMMIT_SHA__ global está disponível — opção de mostrar no rodapé do dashboard para rastrear versão quando alguém relata bug.
1 · Regras transversais
Antes de cada componente
Errado ou Agir
Todo componente abaixo passa pelo filtro: ele responde a "o que está errado?" ou "o que eu faço agora?" sem clique. Se a resposta é "não", o estado correto é omitido — não vazio.

Acessibilidade
Cor nunca é o único canal: combinada com ícone (CircleAlert / CheckCircle2 / ArrowUp / ArrowDown) e/ou rótulo textual. Contraste mínimo AA em todos os números.

Estado de loading
Skeleton com bg-slate-100 animate-pulse rounded, dimensão idêntica ao slot final. Sem spinners — preserva layout.

Estado vazio
Quando o dado existe mas é zero/nulo: texto curto em text-sm text-slate-400 italic dentro do mesmo container. Sem ilustração, sem CTA.

2 · Componente
components/executive/ExecutiveKpiStrip.tsx
ExecutiveKpiStrip
Faixa de KPIs com grid assimétrico — 2 primários largos (decisão) + 4 secundários estreitos (operacional). Substitui a faixa achatada de 10 cards idênticos. Cada primário carrega um KpiDeltaBadge.

Valor de Acordos
BRL
R$ 1,61 mi
12%
vs meta · R$ 1,44 mi
1ª Parcela
BRL
R$ 320 mil
4%
vs ontem
CPC %
43,5%
↑ acima do patamar
Conversão %
1,2%
↓ abaixo da meta
Ticket Médio
R$ 4,5k
vs média 14d
Exceções %
1,3%
3 acordos
Qtd Acordos
356
19 dias úteis
Concent. Top 3
34,5%
atenção
Qtd Acionamentos
30,2k
vs média 14d
Preview · grid de 6 colunas · 2 primários (col-span-2) + N secundários (col-span-1) · último slot mostra estado de loading

Atributo	Especificação
Container raiz	gridgrid-cols-6gap-3
Em viewport < 1280px: grid-cols-4; < 768px: grid-cols-2. Primários sempre col-span-2; secundários sempre col-span-1.
Card primário	
Layout
col-span-2bg-whiteborderborder-slate-200rounded-lgp-5
Tipografia
Eyebrow: text-xs uppercase tracking-[0.12em] font-semibold text-slate-500
Valor: text-4xl font-bold tracking-tight tabular-nums text-slate-900 leading-none
Unidade: text-xs font-medium text-slate-400
Spacing interno
mt-3 entre eyebrow → valor → badge. Sem divisores.
Card secundário	
Layout
col-span-1bg-whiteborderborder-slate-200rounded-lgp-4
Tipografia
Eyebrow: text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-500
Valor: text-2xl font-semibold tabular-nums text-slate-900 leading-none
Tag delta: text-[11px] font-medium + cor semântica
Spacing interno
mt-2 entre cada linha.
Proporção 1° × 2°	Card primário ocupa 2× a largura do secundário (col-span-2 vs col-span-1) e ~1,66× a altura tipográfica do valor (40px vs 24px). Hierarquia dimensional explícita; não usar a mesma escala para todos.
Estados — primário	
Neutro (default)
Borda border-slate-200, badge slate.
Crítico
Badge usa bg-rose-50 text-rose-700 com ícone ArrowDown. Não tinge fundo do card; cor concentrada no badge para preservar scan.
Positivo
Badge bg-emerald-50 text-emerald-700 com ícone ArrowUp.
Anti-truncamento	Função utilitária formatBRLCompact(value, width): usa R$ 1.611.575,51 quando cabe, R$ 1,61 mi caso contrário. Nunca aplicar truncate ao node do valor.
Loading	Manter container e padding; substituir conteúdo por 3 barras bg-slate-100 animate-pulse rounded nas larguras 20/24/16 (eyebrow / valor / delta).
Vazio (sem dado)	Render normal com valor = — em text-slate-300 e ausência de badge. Não esconder o card — preserva o ritmo do grid e indica explicitamente "métrica disponível, sem dado no período".
Omitido	Quando a métrica simplesmente não se aplica à rota, o componente não renderiza o slot (não usar visibility:hidden). O grid se redistribui.
Props mínimas	label · value · unit · variant: 'primary' | 'secondary' · delta?: {direction, value, baseline} · state: 'ok' | 'loading' | 'empty'
3 · Componente
components/executive/KpiDeltaBadge.tsx
KpiDeltaBadge
Pílula com direção + magnitude + baseline. É o que converte um KPI "descrição" em KPI "sinal de decisão". Aparece embutido nos cards primários de ExecutiveKpiStrip e dentro de células em ExecutiveRankingTable.

Positivo
12%
vs meta
Crítico
4%
vs ontem
Neutro
0,3%
estável
Atenção
8%
dentro de ±10%
Sem baseline
sem comparativo
Atributo	Especificação
Estrutura	inline-flexitems-centergap-1px-2 py-0.5rounded-fulltext-[12px]font-semibold
Composição: ícone 12px + número + (à direita do pill) descrição da baseline em text-[12px] text-slate-500.
Tipografia	Valor dentro do badge: text-[12px] font-semibold tabular-nums
Baseline label (fora do badge): text-[12px] text-slate-500
Estados	
Positivo
bg-emerald-50text-emerald-700 · ícone ArrowUpRight
Crítico
bg-rose-50text-rose-700 · ícone ArrowDownRight
Atenção
bg-amber-50text-amber-700 · ícone AlertCircle (usar quando delta está dentro de ±10% da meta mas a métrica é sensível)
Neutro
bg-slate-100text-slate-600 · ícone Minus (delta < 1% absoluto)
Sem baseline
bg-slate-50text-slate-400border border-dashed border-slate-200 · texto "sem comparativo", sem ícone, sem número
Lógica de baseline	Cascata: meta do período → mesmo período anterior (MoM/YoD) → média móvel N dias. O label exibido reflete qual baseline foi usado: "vs meta", "vs ontem", "vs média 14d".
Direção de cor	Cor segue impacto no negócio, não direção numérica: para "Exceções", crescer é crítico (rose ↑). Prop betterWhen: 'up' | 'down' controla a inversão.
Vazio / omitido	Quando baseline não existe e não pode ser calculada: render no estado "sem comparativo" (pílula dashed). Quando o componente é colocado em contexto onde delta não faz sentido (ex.: count absoluto sem histórico): não renderizar.
Props mínimas	value (delta em %) · direction: 'up' | 'down' | 'flat' · baseline: 'meta' | 'period' | 'movavg' | null · betterWhen: 'up' | 'down'
4 · Componente
components/executive/ExecutiveInsightCard.tsx
ExecutiveInsightCard (hero banner / Daily Readout)
Substitui o trio simétrico crítico/positivo/ação. Renderiza apenas um insight dominante, ocupando 100% da largura, com hierarquia visual proporcional à gravidade. Em estado neutro, não renderiza.

Estado crítico — peso visual máximo, CTA primário embutido
Crítico
·
Conversão de acordos
1,2%
48% vs meta
Conversão baixa com alto volume de acionamentos. Qualidade dos contatos precisa ser revista em CONSUMER.

Verificar qualidade dos contatos
Estado positivo — peso visual reduzido (altura ~64px), CTA secundário
Positivo
43,5% CPC
acima do patamar operacional.
Ver agentes do topo →
Estado neutro — componente NÃO renderiza. Espaço em branco ativo abaixo.
return null;  //  "Sem ação imediata recomendada" nunca é renderizado como card.
Atributo	Especificação
Container — crítico	w-fullbg-rose-50borderborder-rose-200rounded-lgpx-6 py-5flex items-start gap-4
Altura mínima
~96px (3 linhas de conteúdo + padding). Sem sombra.
Container — positivo	w-fullbg-emerald-50borderborder-emerald-200rounded-lgpx-6 py-3.5flex items-center gap-4
Altura
~64px (linha única). Sempre menor que o crítico — assimetria comunica que é informativo, não acionável urgente.
Container — neutro	Não renderiza. O componente retorna null. Regra de ouro: "Sem ação imediata recomendada" não é elemento visual permanente.
Ícone (esquerda)	Crítico: w-10 h-10 rounded-full bg-rose-100 border border-rose-200 · ícone AlertCircle 20px
Positivo: w-8 h-8 rounded-full bg-emerald-100 border border-emerald-200 · ícone Check 16px
Tipografia — crítico	Eyebrow: text-[10px] uppercase tracking-[0.14em] font-bold text-rose-700
Métrica afetada (sub-eyebrow): text-xs text-rose-700/70
Número dominante: text-[36px] font-bold tracking-tight tabular-nums text-rose-900 leading-none
Frase explicativa: text-[14.5px] text-rose-900/85 leading-relaxed · max-width max-w-[640px]
Delta inline: pílula bg-white border border-rose-200 text-rose-700
Tipografia — positivo	Eyebrow: text-[10px] uppercase tracking-[0.14em] font-bold text-emerald-700
Número inline: text-[20px] font-semibold tabular-nums text-emerald-900
Frase: text-[13.5px] text-emerald-900/85 (uma linha)
CTA — crítico	inline-flex items-center gap-1.5 px-4 py-2 rounded bg-rose-700 hover:bg-rose-800 text-white text-[13px] font-semibold + ícone ArrowRight 14px
Comportamento
Deep link com estado pré-carregado: navega para a rota de análise com filtros aplicados (ex.: ?bu=consumer&period=today&sort=cpc:desc).
CTA — positivo	Link textual: text-[13px] font-semibold text-emerald-800 hover:text-emerald-900 underline underline-offset-2 decoration-emerald-300. Sem botão sólido — peso visual reduzido.
Hierarquia entre estados	Crítico (96px+) > Positivo (64px) > Neutro (0px). Apenas um estado renderiza por vez: dominante é selecionado no host (Home), nunca dois cards simultâneos.
Acessibilidade	role="status" no crítico com aria-live="polite". CTA acessível por teclado, com label completo.
Props mínimas	variant: 'critical' | 'positive' | null (null = não renderiza) · metric · value · delta · description · cta: {label, href}
5 · Componente
components/executive/SectionHeader.tsx
SectionHeader
Cabeçalho padronizado de cada bloco analítico (Financeiro, Eficiência, Risco). Substitui os títulos heterogêneos atuais (uppercase tracking-wider sem padrão).

Default
Financeiro
BRL
Resultados em valor de acordos e entrada de caixa (1ª parcela).

2 visuais
Com ações inline
Eficiência
%
Volume de esforço (acionamentos/contatos) e taxas (CPC/Conversão) por unidade de negócio.

Exportar
·
Expandir detalhes
Mínimo — só título
Risco / Qualidade
Atributo	Especificação
Container	flex items-baseline justify-between gap-6 pb-3 border-b border-slate-200
Título	text-[11px] uppercase tracking-[0.14em] font-bold text-slate-900 — eyebrow forte, não h2/h3 visual.
Tag de unidade	inline-flex items-center px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600 text-[10px] font-mono font-medium
Valores aceitos: BRL, %, count, min. Garante leitura sem ambiguidade da fórmula.
Descrição	mt-1 text-[13px] text-slate-500 leading-relaxed max-w-[560px] · opcional — quando ausente, container colapsa a 1 linha.
Slot direito (actions)	Opcional. Links textuais text-[12px] text-slate-500 hover:text-slate-900 underline decoration-slate-300 underline-offset-2 separados por · em text-slate-300. Nunca botões sólidos.
Vazio	Quando a seção inteira não tem dado: SectionHeader continua renderizado, com opacity-50, seguido de uma linha text-sm italic text-slate-400 dizendo "Sem dados para o período selecionado." dentro do container da seção.
Props mínimas	title · unit? · description? · actions?
6 · Componente
components/executive/ExecutiveRankingTable.tsx
ExecutiveRankingTable
Ranking único e autoritativo por dimensão. Coluna primária + secundária + ações inline (abrir / comparar / acionar), todas deep-linkadas. Substitui os múltiplos rankings com mesma ordenação espalhados pelas rotas.

Top 10 Agentes por Valor de Acordos
Período: 01/05 → 19/05 · Categoria: Todas

Ver todos
#	Agente	Valor Acordos	Qtd Acordos	vs Mediana	Ações
1	
Wilton da Silva
mat. 63928 · AUTOS
R$ 193.152,72	40	284%	
2	
Andressa Magalhães
mat. 63003 · AUTOS
R$ 186.401,10	28	271%	


3	
Ronie Von Alves
mat. — · CONSUMER
R$ 176.419,00	9	251%	


4	
Jordana Oliveira
mat. 63123 · AUTOS
R$ 166.883,24	34	232%	


5	
Adriana Mattps Mourão
mat. 63120 · AUTOS · exceção 4%
R$ 86.166,55	25	71%	


Preview · ações ficam em opacity-60 em repouso, opacity-100 em hover da linha · ranks 1–3 em emerald, demais em slate

Atributo	Especificação
Container raiz	bg-whiteborder border-slate-200rounded-lgoverflow-hidden
Header do bloco	px-5 py-3.5 border-b border-slate-200 flex items-center justify-between
Título: text-[15px] font-semibold text-slate-900
Subtítulo (filtros aplicados): text-[12px] text-slate-500 mt-0.5
Link "Ver todos": text-[12px] text-slate-500 hover:text-slate-900 underline decoration-slate-300 underline-offset-2
Cabeçalho da tabela	bg-slate-50 · text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-500
Alinhamento: # à esquerda, métricas numéricas à direita (text-right).
Linhas	hover:bg-slate-50 group · separador divide-y divide-slate-100
Padding vertical: py-3. Padding horizontal: px-3 (primeira coluna pl-5 pr-3, última pl-3 pr-5).
Pílula de rank	inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] tabular-nums
Top 3
bg-emerald-100 text-emerald-800 font-bold
Demais
bg-slate-100 text-slate-700 font-semibold
Coluna "Agente"	Linha 1: font-medium text-slate-900 (nome)
Linha 2: text-[11px] text-slate-500 font-mono (matrícula + BU + atributo sensível, ex.: "exceção 4%")
Flag de risco inline: ícone AlertTriangle 13px em text-rose-600 ao lado do nome.
Coluna métrica primária	text-right tabular-nums font-semibold text-slate-900
Coluna métrica secundária	text-right tabular-nums text-slate-700 (peso reduzido)
Coluna "vs Mediana"	Usa KpiDeltaBadge compacto: pílula px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums + ícone 10px. Comparação contra mediana do conjunto exibido.
Coluna "Ações"	3 ícones-botão em opacity-60 group-hover:opacity-100 transition-opacity:
ExternalLink (abrir ficha · → DetalhamentoAgentes?agent=ID)
ArrowLeftRight (comparar · → ComparacaoAgentes?add=ID)
Phone (acionar · abre modal de contato)
Cada botão: p-1.5 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900 + title nativo para tooltip.
Densidade	Altura média de linha: ~52px (2 linhas de info + ações). Sem zebrado — separador é o divide-y sutil.
Loading	5 linhas com células substituídas por h-3 bg-slate-100 animate-pulse rounded de larguras variáveis (70/40/30/16/12 ch).
Vazio	Render o header normalmente; corpo substituído por uma célula única colspan="6" py-12 text-center text-sm text-slate-400 italic com texto: "Sem agentes com volume mínimo no período."
Omitido	Quando a rota não tem dimensão de ranking (ex.: Detalhamento individual sem comparação): componente não é montado no host. Não rebaixa para card vazio.
Props mínimas	title · filters · rows: RankingRow[] · columns: ColumnConfig[] · actions: ('open' | 'compare' | 'contact')[] · state
7 · Componente
components/executive/RitmoDiaHeatmap.tsx
RitmoDiaHeatmap
Substitui o bloco textual atual de "Ritmo do Dia" (4 linhas por hora, ilegível). Heatmap bidimensional horas × métrica com semáforo; números brutos restritos ao tooltip.

Ritmo do dia
vs meta horária
Acumulado atual: 6 · Projeção D+20 · Esperado total: 25

acima
±10%
abaixo
sem dado
8h
9h
10h
11h
12h
13h
14h
15h
16h
17h
18h
19h
Acionamentos
−50%
−50%
0%
+50%
0%
⏳
Contatos
+8%
−3%
+12%
+22%
−18%
⏳
Conversão
−42%
−38%
−51%
−9%
−31%
⏳
11h · Acionamentos
esperado
2
realizado
3
acumulado
6
delta
+50%
↑ tooltip aparece no hover de qualquer célula · números brutos só aqui

Atributo	Especificação
Container	bg-white border border-slate-200 rounded-lg p-5
Grid	grid gap-[3px]
grid-template-columns: 96px repeat(N, minmax(48px, 1fr)) onde N = nº de horas comerciais (tipicamente 12, de 8h a 19h).
Linhas: cabeçalho de horas + 1 linha por métrica (Acionamentos, Contatos, Conversão).
Célula	h-9 rounded-sm flex items-center justify-center text-[11px] tabular-nums font-semibold
Verde (acima da meta)
bg-emerald-500 text-white — delta > +10%
Amarelo (±10%)
bg-amber-400 text-amber-900
Vermelho (abaixo)
bg-rose-500 text-white — delta < −10%
Sem dado / pendente
bg-slate-100 border border-slate-200 — célula vazia
Em curso (hora atual)
qualquer cor + ring-2 ring-slate-900 ring-offset-1 · conteúdo ⏳ ou número parcial
Conteúdo da célula	Apenas o delta percentual (+12% / −18% / 0%) em text-[11px] font-semibold tabular-nums. Nunca os valores absolutos — estes ficam no tooltip.
Header de horas	text-center text-slate-500 font-medium pb-1 text-[11px]
Hora atual destacada: text-slate-700 font-bold + underline 2px bg-slate-900 rounded-full abaixo.
Label de linha	text-[10px] uppercase tracking-[0.08em] font-semibold text-slate-600
Legenda	No header do card, à direita: 4 chips de 12×12px alinhados horizontalmente, com label em text-[11px] text-slate-500. Ordem fixa: acima · ±10% · abaixo · sem dado.
Tooltip	bg-slate-900 text-white rounded-md px-3 py-2 text-[12px] shadow-lg
Conteúdo (4 linhas): esperado · realizado · acumulado · delta. Labels em text-slate-400, valores em tabular-nums font-semibold. Direção do delta (positivo/negativo) realça em text-emerald-300 / text-rose-300.
Hover	Célula recebe hover:ring-2 hover:ring-slate-900 hover:ring-offset-1 cursor-pointer. Tooltip aparece com delay de 200ms.
Cálculo da meta horária	Se o backend não fornecer, derivar no frontend: metaDiária / horasOperação distribuído uniformemente, com bandas de tolerância de ±10%.
Vazio (sem dia)	Quando ainda não há nenhuma hora com realizado (00:00–07:59): renderizar apenas a grade vazia (todas as células bg-slate-100 border border-slate-200) e nota textual abaixo: "Aguardando primeira hora operacional."
Vazio (sem meta)	Quando não é possível calcular meta horária nem por backend nem por divisão: omitir o heatmap inteiro e renderizar nota: "Meta horária não disponível para o período." em text-sm text-slate-400 italic.
Props mínimas	hours: Hour[] (cada hora carrega {expected, actual, accumulated} por métrica) · metrics: ('acionamentos' | 'contatos' | 'conversao')[] · currentHour · tolerance (default 0.1)
AgDash · Redesign Executivo
Spec de componentes pronta para handoff · Tailwind 3.x · Inter
