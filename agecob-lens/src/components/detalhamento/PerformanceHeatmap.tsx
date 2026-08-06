import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRLCompact, fmtNum } from "@/lib/metrics";
import { cn } from "@/lib/utils";

export interface AgentRow {
  id: string;
  nome: string;
  mat?: string;
  acionamentos: number;
  /** Contato = Alô (alguém atendeu, ALO=1) */
  alo?: number;
  /** taxa CPC (legado; coluna CPC agora usa `contatos` = RPC count) */
  cpc?: number;
  conversao: number;
  valorAcordos: number;
  /** CPC = contato com pessoa certa (RPC) = qtd_contatos */
  contatos: number;
  /** Quantidade de acordos aprovados */
  qtdAcordos: number;
  /** 1ª parcela dos acordos aprovados */
  primeiraParcela: number;
  /** Quantidade de exceções (ID_REC_STATUS = 5) */
  qtdExcecoes: number;
  /** Valor total das exceções */
  valorExcecoes: number;
  /** 1ª parcela das exceções */
  excPrimeiraParcela: number;
  /** Quantidade de rejeitados (ID_REC_STATUS = 7) */
  qtdRejeitados: number;
  /** Valor total dos rejeitados */
  valorRejeitados: number;
  /** 1ª parcela dos rejeitados (pendente no backend) */
  rejPrimeiraParcela: number;
}

type MetricKey =
  | "acionamentos" | "alo" | "cpc" | "conversao" | "valorAcordos" | "contatos"
  | "qtdAcordos" | "primeiraParcela"
  | "qtdExcecoes" | "valorExcecoes" | "excPrimeiraParcela"
  | "qtdRejeitados" | "valorRejeitados" | "rejPrimeiraParcela";

type SortDir = "desc" | "asc";
/** Coluna ordenável: métricas numéricas + a coluna Agente (alfabética). */
type SortKey = MetricKey | "nome";

interface MetricDef {
  key: MetricKey;
  label: string;
  invert?: boolean;
  fmt: (v: number) => string;
}

const METRICS: MetricDef[] = [
  { key: "acionamentos", label: "Acionam.", fmt: (v) => fmtNum(v) },
  { key: "alo", label: "Contato", fmt: (v) => fmtNum(v) },
  { key: "contatos", label: "CPC", fmt: (v) => fmtNum(v) },
  { key: "conversao", label: "Conv. %", fmt: (v) => `${v.toFixed(1)}%` },
  { key: "qtdAcordos", label: "Acordos", fmt: (v) => fmtNum(v) },
  { key: "valorAcordos", label: "Vlr Acordos", fmt: (v) => formatBRLCompact(v) },
  { key: "primeiraParcela", label: "1ª Parc.", fmt: (v) => formatBRLCompact(v) },
  { key: "qtdExcecoes", label: "Exc. qtd", invert: true, fmt: (v) => fmtNum(v) },
  { key: "valorExcecoes", label: "Vlr Exc.", invert: true, fmt: (v) => formatBRLCompact(v) },
  { key: "excPrimeiraParcela", label: "Exc. 1ª Parc.", invert: true, fmt: (v) => formatBRLCompact(v) },
  { key: "qtdRejeitados", label: "Rej. qtd", invert: true, fmt: (v) => fmtNum(v) },
  { key: "valorRejeitados", label: "Vlr Rej.", invert: true, fmt: (v) => formatBRLCompact(v) },
  { key: "rejPrimeiraParcela", label: "Rej. 1ª Parc.", invert: true, fmt: (v) => formatBRLCompact(v) },
];

export function classifyCell(percentile: number, invert = false): "good" | "warn" | "bad" {
  const p = invert ? 100 - percentile : percentile;
  if (p >= 80) return "good";
  if (p >= 40) return "warn";
  return "bad";
}

/**
 * Build a lookup: raw value → percentile rank (0–100) for a set of numbers.
 * Uses percentile-rank formula: (# below + 0.5 × # equal) / n × 100.
 */
export function buildPercentileMap(allValues: number[]): Map<number, number> {
  if (allValues.length === 0) return new Map();
  // NaN nunca é === a si mesmo: sem sanitizar, o loop de ranking abaixo não avança e trava a UI.
  const sorted = allValues.map((v) => (Number.isFinite(v) ? v : 0)).sort((a, b) => a - b);
  const n = sorted.length;
  const map = new Map<number, number>();
  let i = 0;
  while (i < n) {
    const v = sorted[i];
    let j = i;
    while (j < n && sorted[j] === v) j++;
    const count = j - i;
    const below = i;
    const rank = ((below + 0.5 * count) / n) * 100;
    map.set(v, Math.round(rank));
    i = j;
  }
  return map;
}

const CELL_CLASS: Record<"good" | "warn" | "bad", string> = {
  good: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300",
  warn: "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300",
  bad: "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300",
};

interface PerformanceHeatmapProps {
  agents: AgentRow[];
  highlightId?: string;
}

export function PerformanceHeatmap({ agents, highlightId }: PerformanceHeatmapProps) {
  const [sortCol, setSortCol] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [maximized, setMaximized] = useState(false);

  const toggleSort = (key: SortKey) => {
    if (sortCol !== key) {
      setSortCol(key);
      // Nome começa A→Z (asc); métricas começam do maior (desc).
      setSortDir(key === "nome" ? "asc" : "desc");
      return;
    }
    // Agente: só A→Z; o próximo clique remove o filtro (sem passo desc).
    if (key === "nome") {
      setSortCol(null);
      setSortDir("desc");
      return;
    }
    if (sortDir === "desc") {
      setSortDir("asc");
    } else {
      setSortCol(null);
      setSortDir("desc");
    }
  };

  const sortedAgents = useMemo(() => {
    const copy = [...agents];
    if (sortCol === "nome") {
      copy.sort((a, b) => {
        const cmp = a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
        return sortDir === "asc" ? cmp : -cmp;
      });
    } else if (sortCol) {
      copy.sort((a, b) => {
        const va = a[sortCol] ?? 0;
        const vb = b[sortCol] ?? 0;
        return sortDir === "desc" ? vb - va : va - vb;
      });
    } else {
      copy.sort((a, b) => (b.valorAcordos ?? 0) - (a.valorAcordos ?? 0));
    }
    return copy;
  }, [agents, sortCol, sortDir]);

  const displayAgents = useMemo(
    () => (maximized ? sortedAgents : sortedAgents.slice(0, 10)),
    [sortedAgents, maximized],
  );

  const columnPercentile = useMemo(() => {
    const result = {} as Record<MetricKey, Map<number, number>>;
    for (const m of METRICS) {
      result[m.key] = buildPercentileMap(agents.map((a) => a[m.key] ?? 0));
    }
    return result;
  }, [agents]);

  const card = (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">Heatmap de Performance</CardTitle>
            <CardDescription className="text-xs">
              Agentes x Metricas. Cor por percentil na distribuicao do periodo. Rejeitados: ID_REC_STATUS = 7.
            </CardDescription>
          </div>
          {!maximized && (
            <button
              type="button"
              data-testid="heatmap-maximize"
              onClick={() => setMaximized(true)}
              className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-[10px] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
            >
              Tela cheia
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px] tabular-nums">
            <thead className="sticky top-0 z-10 bg-background">
              <tr>
                <th
                  className={cn(
                    "sticky left-0 z-20 bg-background px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider border border-slate-400 dark:border-slate-600",
                    sortCol === "nome" ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort("nome")}
                    className="inline-flex items-center gap-1 select-none hover:text-foreground"
                    data-testid="sort-nome"
                    aria-label="Ordenar por Agente (alfabético)"
                  >
                    <span>Agente</span>
                    {sortCol === "nome" && (
                      <span aria-hidden="true" data-testid="sort-indicator-nome">
                        {sortDir === "desc" ? "↓" : "↑"}
                      </span>
                    )}
                  </button>
                </th>
                {METRICS.map((m) => {
                  const active = sortCol === m.key;
                  return (
                    <th
                      key={m.key}
                      className={cn(
                        "px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider border border-slate-400 dark:border-slate-600",
                        active ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(m.key)}
                        className="inline-flex items-center justify-center gap-1 select-none hover:text-foreground"
                        data-testid={`sort-${m.key}`}
                        aria-label={`Ordenar por ${m.label}`}
                      >
                        <span>{m.label}</span>
                        {active && (
                          <span aria-hidden="true" data-testid={`sort-indicator-${m.key}`}>
                            {sortDir === "desc" ? "↓" : "↑"}
                          </span>
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayAgents.map((agent) => {
                const isHighlight = highlightId && agent.id === highlightId;
                return (
                  <tr
                    key={agent.id}
                    data-testid={`heatmap-row-${agent.id}`}
                    className={cn(
                      "group transition-colors hover:bg-muted/20",
                      isHighlight && "ring-2 ring-primary",
                    )}
                  >
                    <td className="sticky left-0 z-10 bg-background px-2 py-1.5 text-left font-medium text-foreground border border-slate-400 dark:border-slate-600">
                      <div className="max-w-[160px] truncate">{agent.nome}</div>
                      {agent.mat && (
                        <div className="text-[10px] text-muted-foreground">{agent.mat}</div>
                      )}
                    </td>
                    {METRICS.map((m) => {
                      const raw = agent[m.key] ?? 0;
                      const pct = columnPercentile[m.key].get(raw) ?? 0;
                      const cls = classifyCell(pct, m.invert);
                      return (
                        <td
                          key={m.key}
                          data-testid={`cell-${agent.id}-${m.key}`}
                          data-tone={cls}
                          className={cn(
                            "px-2 py-1.5 text-center font-semibold border border-slate-400 dark:border-slate-600",
                            CELL_CLASS[cls],
                          )}
                          style={{ padding: "6px 8px" }}
                        >
                          {m.fmt(raw)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-100 dark:bg-emerald-950/60" />
            top 20% (percentil &ge;80)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-100 dark:bg-amber-950/60" />
            mediano (40–79)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-100 dark:bg-rose-950/60" />
            inferior (&lt;40)
          </span>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <>
      {maximized && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-card flex flex-col" data-testid="heatmap-overlay">
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-border">
            <span className="text-sm font-semibold">Heatmap de Performance · Tela cheia</span>
            <button
              type="button"
              data-testid="heatmap-minimize"
              onClick={() => setMaximized(false)}
              className="rounded border border-slate-300 dark:border-slate-700 px-3 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
            {card}
          </div>
        </div>
      )}
      {!maximized && card}
    </>
  );
}

export default PerformanceHeatmap;
