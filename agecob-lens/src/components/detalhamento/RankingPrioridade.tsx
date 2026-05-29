import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface RankingEntry {
  id: string;
  nome: string;
  mat?: string;
  cpc: number;
  conversao: number;
  reprov: number;
  acordos: number;
  trend7d: number[];
}

export interface RankingPrioridadeProps {
  entries: RankingEntry[];
  topN?: number;
  /** Selected agent's ID — shows rank row at bottom if not in top N */
  highlightAgentId?: string;
  /** Selected agent's rank position (1-based; 0 = unknown) */
  highlightRank?: number;
  /** Total number of agents */
  totalAgents?: number;
}

interface ScoredEntry extends RankingEntry {
  score: number;
}

type RiskLevel = "alto" | "medio" | "baixo";

function riskLevel(score: number): RiskLevel {
  if (score >= 50) return "alto";
  if (score >= 35) return "medio";
  return "baixo";
}

const RISK_STYLE: Record<RiskLevel, { badge: string; rank: string; label: string }> = {
  alto: { badge: "bg-rose-100 text-rose-700", rank: "bg-rose-500 text-white", label: "Alto" },
  medio: { badge: "bg-amber-100 text-amber-700", rank: "bg-amber-500 text-white", label: "Médio" },
  baixo: { badge: "bg-slate-100 text-slate-600", rank: "bg-slate-400 text-white", label: "Baixo" },
};

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 72;
  const h = 20;
  const step = w / (values.length - 1);
  const pts = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`)
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  const color = up ? "#22c55e" : "#ef4444";
  return (
    <svg width={w} height={h} data-testid="sparkline" data-trend={up ? "up" : "down"} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function RankingPrioridade({
  entries,
  topN = 10,
  highlightAgentId,
  highlightRank,
  totalAgents,
}: RankingPrioridadeProps) {
  const ranked = useMemo<ScoredEntry[]>(() => {
    if (!entries.length) return [];
    const maxCpc = Math.max(...entries.map((e) => e.cpc)) || 1;
    const maxConv = Math.max(...entries.map((e) => e.conversao)) || 1;
    return entries
      .map((e) => {
        const cpcNorm = e.cpc / maxCpc;
        const convNorm = e.conversao / maxConv;
        const reprovRate = e.acordos > 0 ? e.reprov / e.acordos : 1;
        const score =
          (1 - cpcNorm) * 35 + (1 - convNorm / 3) * 35 + Math.min(1, reprovRate) * 30;
        return { ...e, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }, [entries, topN]);

  // Check if highlighted agent is in the top N
  const hlInTopN = highlightAgentId
    ? ranked.some((e) => e.id === highlightAgentId)
    : false;
  const showHlRow = highlightAgentId && !hlInTopN && (highlightRank ?? 0) > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Prioridade de Intervenção</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {ranked.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Sem dados.</div>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {ranked.map((e, idx) => {
                const level = riskLevel(e.score);
                const style = RISK_STYLE[level];
                const isHl = highlightAgentId && e.id === highlightAgentId;
                return (
                  <li
                    key={e.id}
                    className={cn(
                      "group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors",
                      isHl && "bg-sky-50 ring-1 ring-sky-200",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                        style.rank,
                      )}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{e.nome}</div>
                      {e.mat && <div className="font-mono text-[10px] text-muted-foreground">{e.mat}</div>}
                    </div>
                    <Sparkline values={e.trend7d} />
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", style.badge)}>
                      {style.label}
                    </span>
                    <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                      {Math.round(e.score)}
                    </span>
                    <div className="flex shrink-0 gap-1 opacity-40 transition-opacity group-hover:opacity-100">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs">Abrir Ficha</Button>
                      <Button size="sm" className="h-7 px-2 text-xs">Acionar</Button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Selected agent rank row (if outside top N) */}
            {showHlRow && (
              <div className="border-t-2 border-dashed border-sky-200 mt-1">
                <div className="px-4 py-2.5 flex items-center gap-3 bg-sky-50/50">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold bg-sky-500 text-white">
                    {highlightRank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-sky-700">
                      Seu agente
                    </div>
                    <div className="text-[10px] text-sky-500">
                      #{highlightRank} de {totalAgents ?? "?"} agentes
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default RankingPrioridade;
