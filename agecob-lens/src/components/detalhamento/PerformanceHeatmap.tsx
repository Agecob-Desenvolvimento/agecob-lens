import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRLCompact, fmtNum } from "@/lib/metrics";
import { cn } from "@/lib/utils";

export interface AgentRow {
  id: string;
  nome: string;
  mat?: string;
  cpc: number;
  conversao: number;
  valorAcordos: number;
  contatos: number;
  excecoesPct: number;
  primeiraParcela: number;
}

type MetricKey = "cpc" | "conversao" | "valorAcordos" | "contatos" | "excecoesPct" | "primeiraParcela";
type SortDir = "desc" | "asc";

interface MetricDef {
  key: MetricKey;
  label: string;
  invert?: boolean;
  fmt: (v: number) => string;
}

const METRICS: MetricDef[] = [
  { key: "cpc", label: "CPC %", fmt: (v) => `${v.toFixed(1)}%` },
  { key: "conversao", label: "Conv. %", fmt: (v) => `${v.toFixed(1)}%` },
  { key: "valorAcordos", label: "Valor Acordos", fmt: (v) => formatBRLCompact(v) },
  { key: "contatos", label: "Contatos", fmt: (v) => fmtNum(v) },
  { key: "excecoesPct", label: "Exc. %", invert: true, fmt: (v) => `${v.toFixed(1)}%` },
  { key: "primeiraParcela", label: "1ª Parc.", fmt: (v) => formatBRLCompact(v) },
];

export function classifyCell(value: number, max: number, invert = false): "good" | "warn" | "bad" {
  if (max <= 0) return "bad";
  if (invert) {
    // lower = better. score = 1 - value/max (clamped 0..1)
    const score = 1 - value / max;
    if (score >= 0.9) return "good";
    if (score >= 0.7) return "warn";
    return "bad";
  }
  const score = value / max;
  if (score >= 0.9) return "good";
  if (score >= 0.7) return "warn";
  return "bad";
}

const CELL_CLASS: Record<"good" | "warn" | "bad", string> = {
  good: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-800",
  bad: "bg-rose-100 text-rose-800",
};

interface PerformanceHeatmapProps {
  agents: AgentRow[];
  highlightId?: string;
}

export function PerformanceHeatmap({ agents, highlightId }: PerformanceHeatmapProps) {
  const [sortCol, setSortCol] = useState<MetricKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: MetricKey) => {
    if (sortCol !== key) {
      setSortCol(key);
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
    if (!sortCol) return agents;
    const copy = [...agents];
    copy.sort((a, b) => {
      const va = a[sortCol] ?? 0;
      const vb = b[sortCol] ?? 0;
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return copy;
  }, [agents, sortCol, sortDir]);

  const columnMax = useMemo(() => {
    const result = {} as Record<MetricKey, number>;
    for (const m of METRICS) {
      result[m.key] = agents.reduce((acc, a) => Math.max(acc, a[m.key] ?? 0), 0);
    }
    return result;
  }, [agents]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Heatmap de Performance</CardTitle>
        <CardDescription className="text-xs">
          Agentes x Metricas. Cor por desempenho relativo ao maximo da coluna. Clique no cabecalho para ordenar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-1 text-[11px] tabular-nums">
            <thead className="sticky top-0 z-10 bg-background">
              <tr>
                <th className="sticky left-0 z-20 bg-background px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Agente
                </th>
                {METRICS.map((m) => {
                  const active = sortCol === m.key;
                  return (
                    <th
                      key={m.key}
                      className={cn(
                        "px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider",
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
              {sortedAgents.map((agent) => {
                const isHighlight = highlightId && agent.id === highlightId;
                return (
                  <tr
                    key={agent.id}
                    data-testid={`heatmap-row-${agent.id}`}
                    className={cn(
                      "group transition-transform duration-100 hover:scale-[1.02]",
                      isHighlight && "ring-2 ring-primary",
                    )}
                  >
                    <td className="sticky left-0 z-10 bg-background px-2 py-1.5 text-left font-medium text-foreground">
                      <div className="max-w-[160px] truncate">{agent.nome}</div>
                      {agent.mat && (
                        <div className="text-[10px] text-muted-foreground">{agent.mat}</div>
                      )}
                    </td>
                    {METRICS.map((m) => {
                      const raw = agent[m.key] ?? 0;
                      const cls = classifyCell(raw, columnMax[m.key], m.invert);
                      return (
                        <td
                          key={m.key}
                          data-testid={`cell-${agent.id}-${m.key}`}
                          data-tone={cls}
                          className={cn(
                            "px-2 py-1.5 text-center font-semibold",
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
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-100" />
            &ge;90% do maximo
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-100" />
            70-90%
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-100" />
            &lt;70%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default PerformanceHeatmap;
