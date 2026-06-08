import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRLCompact } from "@/lib/metrics";
import type { ScatterPoint } from "./regressionMocks";

export interface ImprovedScatterPlotProps {
  points: ScatterPoint[];
  highlightId?: string;
}

const W = 1200;
const H = 520;
const PAD = { l: 60, r: 24, t: 16, b: 44 };

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

// Decision boundary: median over active (>0) agents so it doesn't collapse to the
// axis when most agents have zero conversion (≈0 efficiency at daily grain).
function boundary(values: number[], axisMax: number): number {
  const positive = values.filter((v) => v > 0);
  return positive.length ? median(positive) : axisMax / 2;
}

function dotColor(excPct: number): string {
  if (excPct > 15) return "#ef4444";
  if (excPct >= 5) return "#f59e0b";
  return "#22c55e";
}

function dotRadius(acordos: number): number {
  return Math.max(4, Math.min(12, Math.sqrt(Math.max(0, acordos)) * 1.8));
}

export function ImprovedScatterPlot({ points, highlightId }: ImprovedScatterPlotProps) {
  const [hov, setHov] = useState<number | null>(null);

  const { maxEff, maxY, medEff, medY } = useMemo(() => {
    if (!points.length) {
      return { maxEff: 1, maxY: 1, medEff: 0, medY: 0 };
    }
    const effs = points.map((p) => p.eficiencia);
    const vals = points.map((p) => p.valor);
    const maxEff = Math.max(...effs) * 1.1 || 1;
    const maxY = Math.max(...vals) * 1.1 || 1;
    return {
      maxEff,
      maxY,
      medEff: boundary(effs, maxEff),
      medY: boundary(vals, maxY),
    };
  }, [points]);

  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const toX = (v: number) => PAD.l + (v / maxEff) * plotW;
  const toY = (v: number) => PAD.t + plotH - (v / maxY) * plotH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => maxY * f);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => maxEff * f);

  // Sort so highlighted dot renders last (on top)
  const sorted = useMemo(() => {
    if (!highlightId) return points;
    const hl = points.filter((d) => d.id === highlightId);
    const rest = points.filter((d) => d.id !== highlightId);
    return [...rest, ...hl];
  }, [points, highlightId]);
  const hasHighlight = highlightId && points.some((d) => d.id === highlightId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Matriz de Performance</CardTitle>
        <CardDescription className="text-sm text-slate-600">
          Correlação entre produtividade, recuperação financeira e incidência de exceções.
        </CardDescription>
        <div className="mt-1 flex gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#22c55e" }} />
            Taxa exc &lt;5%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#f59e0b" }} />
            5–15%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#ef4444" }} />
            &gt;15%
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Sem dados para o período.</div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height={H}
            role="img"
            aria-label="Scatter plot eficiência vs valor acordos"
            data-testid="scatter-svg"
            style={{ display: "block" }}
          >
            {yTicks.map((v, i) => (
              <g key={`y${i}`}>
                <line x1={PAD.l} x2={W - PAD.r} y1={toY(v)} y2={toY(v)} stroke="#f1f5f9" strokeWidth={1} />
                <text x={PAD.l - 6} y={toY(v) + 3} textAnchor="end" fontSize={11} fill="#475569">
                  {v < 1000 ? "R$ 0" : `R$ ${(v / 1000).toFixed(0)}k`}
                </text>
              </g>
            ))}
            {xTicks.map((v, i) => (
              <g key={`x${i}`}>
                <line x1={toX(v)} x2={toX(v)} y1={PAD.t} y2={H - PAD.b} stroke="#f1f5f9" strokeWidth={1} />
                <text x={toX(v)} y={H - PAD.b + 14} textAnchor="middle" fontSize={11} fill="#475569">
                  {v.toFixed(2)}
                </text>
              </g>
            ))}
            <line x1={toX(medEff)} x2={toX(medEff)} y1={PAD.t} y2={H - PAD.b} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 4" data-testid="median-x" />
            <line x1={PAD.l} x2={W - PAD.r} y1={toY(medY)} y2={toY(medY)} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 4" data-testid="median-y" />
            {/* Quadrant labels */}
            <text x={toX(medEff) - 6} y={toY(medY) - 10} textAnchor="end" fontSize={11} fill="#334155" opacity={0.85}>Potencial subutilizado</text>
            <text x={toX(medEff) + 6} y={toY(medY) - 10} textAnchor="start" fontSize={11} fill="#334155" opacity={0.85}>Elite operacional</text>
            <text x={toX(medEff) - 6} y={toY(medY) + 16} textAnchor="end" fontSize={11} fill="#334155" opacity={0.85}>Necessita intervenção</text>
            <text x={toX(medEff) + 6} y={toY(medY) + 16} textAnchor="start" fontSize={11} fill="#334155" opacity={0.85}>Resultado caro</text>
            <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={13} fill="#1e293b">Índice de Eficiência</text>
            <text x={10} y={H / 2} textAnchor="middle" fontSize={13} fill="#1e293b" transform={`rotate(-90, 10, ${H / 2})`}>Valor Recuperado</text>
            {sorted.map((d) => {
              const origIdx = points.findIndex((p) => p.id === d.id);
              const isHov = hov === origIdx;
              const isHl = highlightId !== undefined && d.id === highlightId;
              const baseR = dotRadius(d.acordos);
              const r = isHl ? baseR + 5 : isHov ? baseR + 2 : baseR;
              return (
                <g key={d.id}>
                  {isHl && (
                    <circle
                      cx={toX(d.eficiencia)}
                      cy={toY(d.valor)}
                      r={r + 3}
                      fill="none"
                      stroke="hsl(var(--foreground))"
                      strokeWidth={2.5}
                      opacity={0.9}
                    />
                  )}
                  <circle
                    data-testid="scatter-dot"
                    data-color={dotColor(d.excPct)}
                    cx={toX(d.eficiencia)}
                    cy={toY(d.valor)}
                    r={r}
                    fill={dotColor(d.excPct)}
                    opacity={isHov || isHl ? 1 : hasHighlight ? 0.45 : 0.78}
                    stroke={isHov || isHl ? "#0f172a" : "none"}
                    strokeWidth={isHl ? 2.5 : 2}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHov(origIdx)}
                    onMouseLeave={() => setHov(null)}
                  />
                </g>
              );
            })}
            {hov !== null && points[hov] && (() => {
              const d = points[hov];
              const tw = 260;
              const tx = Math.min(toX(d.eficiencia) + 12, W - tw - 8);
              const ty = Math.max(toY(d.valor) - 58, PAD.t);
              return (
                <g data-testid="scatter-tooltip">
                  <rect x={tx} y={ty} width={tw} height={54} rx={4} fill="#0f172a" opacity={0.92} />
                  <text x={tx + 10} y={ty + 15} fontSize={13} fontWeight="bold" fill="#e2e8f0">
                    {d.nome.substring(0, 32)}
                  </text>
                  <text x={tx + 10} y={ty + 30} fontSize={12} fill="#cbd5e1">
                    Eficiência {d.eficiencia.toFixed(2)} · {formatBRLCompact(d.valor)}
                  </text>
                  <text x={tx + 10} y={ty + 45} fontSize={12} fill="#cbd5e1">
                    Exceções {d.excPct.toFixed(1)}% · Acordos {d.acordos}
                  </text>
                </g>
              );
            })()}
          </svg>
        )}
      </CardContent>
    </Card>
  );
}