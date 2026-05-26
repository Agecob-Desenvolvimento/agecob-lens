import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRLCompact } from "@/lib/metrics";
import type { ScatterPoint } from "./regressionMocks";

export interface ImprovedScatterPlotProps {
  points: ScatterPoint[];
  highlightId?: string;
}

const W = 720;
const H = 320;
const PAD = { l: 60, r: 24, t: 16, b: 44 };

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function dotColor(excPct: number): string {
  if (excPct > 15) return "#ef4444"; // rose-500
  if (excPct >= 5) return "#f59e0b"; // amber-500
  return "#22c55e"; // emerald-500
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
    return {
      maxEff: Math.max(...effs) * 1.1 || 1,
      maxY: Math.max(...vals) * 1.1 || 1,
      medEff: median(effs),
      medY: median(vals),
    };
  }, [points]);

  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const toX = (v: number) => PAD.l + (v / maxEff) * plotW;
  const toY = (v: number) => PAD.t + plotH - (v / maxY) * plotH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => maxY * f);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => maxEff * f);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Eficiência × Resultado × Qualidade</CardTitle>
        <CardDescription className="text-xs">
          X: CPC×Conversão (eficiência) · Y: Valor Acordos · Cor: % exceções · Tamanho: qtd acordos
        </CardDescription>
        <div className="mt-1 flex gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#22c55e" }} />
            exc &lt;5%
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
                <text x={PAD.l - 6} y={toY(v) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
                  {v < 1000 ? "R$ 0" : `R$ ${(v / 1000).toFixed(0)}k`}
                </text>
              </g>
            ))}
            {xTicks.map((v, i) => (
              <g key={`x${i}`}>
                <line x1={toX(v)} x2={toX(v)} y1={PAD.t} y2={H - PAD.b} stroke="#f1f5f9" strokeWidth={1} />
                <text x={toX(v)} y={H - PAD.b + 14} textAnchor="middle" fontSize={9} fill="#94a3b8">
                  {v.toFixed(2)}
                </text>
              </g>
            ))}
            <line
              x1={toX(medEff)}
              x2={toX(medEff)}
              y1={PAD.t}
              y2={H - PAD.b}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="4 4"
              data-testid="median-x"
            />
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={toY(medY)}
              y2={toY(medY)}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="4 4"
              data-testid="median-y"
            />
            <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={10} fill="#64748b">
              Eficiência (CPC × Conversão)
            </text>
            <text
              x={10}
              y={H / 2}
              textAnchor="middle"
              fontSize={10}
              fill="#64748b"
              transform={`rotate(-90, 10, ${H / 2})`}
            >
              Valor Acordos
            </text>
            {points.map((d, i) => {
              const isHov = hov === i;
              const isHl = highlightId !== undefined && d.id === highlightId;
              const r = dotRadius(d.acordos) + (isHov ? 2 : 0);
              return (
                <circle
                  key={d.id}
                  data-testid="scatter-dot"
                  data-color={dotColor(d.excPct)}
                  cx={toX(d.eficiencia)}
                  cy={toY(d.valor)}
                  r={r}
                  fill={dotColor(d.excPct)}
                  opacity={isHov ? 1 : 0.78}
                  stroke={isHov || isHl ? "#0f172a" : "none"}
                  strokeWidth={2}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHov(i)}
                  onMouseLeave={() => setHov(null)}
                />
              );
            })}
            {hov !== null && points[hov] && (() => {
              const d = points[hov];
              const tx = Math.min(toX(d.eficiencia) + 12, W - 200);
              const ty = Math.max(toY(d.valor) - 44, PAD.t);
              return (
                <g data-testid="scatter-tooltip">
                  <rect x={tx} y={ty} width={188} height={40} rx={4} fill="#0f172a" opacity={0.92} />
                  <text x={tx + 8} y={ty + 14} fontSize={11} fill="#e2e8f0">
                    {d.nome.substring(0, 26)}
                  </text>
                  <text x={tx + 8} y={ty + 28} fontSize={10} fill="#94a3b8">
                    eff: {d.eficiencia.toFixed(2)} · {formatBRLCompact(d.valor)} · exc: {d.excPct.toFixed(1)}%
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
