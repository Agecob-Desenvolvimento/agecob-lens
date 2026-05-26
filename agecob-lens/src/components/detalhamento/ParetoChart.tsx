import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRLCompact } from "@/lib/metrics";

export interface ParetoPoint {
  nome: string;
  valor: number;
}

export interface ParetoChartProps {
  points: ParetoPoint[];
}

const W = 720;
const H = 300;
const PAD = { l: 56, r: 48, t: 16, b: 64 };

export function ParetoChart({ points }: ParetoChartProps) {
  const { sorted, total, cumPct, agentes80, top3Pct } = useMemo(() => {
    const s = [...points].sort((a, b) => b.valor - a.valor);
    const t = s.reduce((acc, p) => acc + p.valor, 0) || 1;
    let running = 0;
    const cp = s.map((p) => {
      running += p.valor;
      return running / t;
    });
    const a80 = cp.findIndex((c) => c >= 0.8) + 1;
    const top3 = s.slice(0, 3).reduce((acc, p) => acc + p.valor, 0) / t;
    return { sorted: s, total: t, cumPct: cp, agentes80: a80 || s.length, top3Pct: top3 };
  }, [points]);

  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const maxValor = sorted.length ? sorted[0].valor * 1.1 || 1 : 1;
  const n = sorted.length;
  const bandW = n > 0 ? plotW / n : plotW;
  const barW = bandW * 0.6;
  const toY = (v: number) => PAD.t + plotH - (v / maxValor) * plotH;
  const toYPct = (f: number) => PAD.t + plotH - f * plotH;
  const bandX = (i: number) => PAD.l + i * bandW;

  const linePts = cumPct.map((c, i) => `${(bandX(i) + bandW / 2).toFixed(1)},${toYPct(c).toFixed(1)}`).join(" ");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pareto de Resultado 80/20</CardTitle>
      </CardHeader>
      <CardContent>
        {n === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Sem dados.</div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width="100%"
              height={H}
              role="img"
              aria-label="Pareto de resultado"
              data-testid="pareto-svg"
              style={{ display: "block" }}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
                <g key={`g${i}`}>
                  <line x1={PAD.l} x2={W - PAD.r} y1={toYPct(f)} y2={toYPct(f)} stroke="#f1f5f9" strokeWidth={1} />
                  <text x={PAD.l - 6} y={toYPct(f) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
                    {`R$ ${((maxValor * f) / 1000).toFixed(0)}k`}
                  </text>
                  <text x={W - PAD.r + 6} y={toYPct(f) + 3} textAnchor="start" fontSize={9} fill="#94a3b8">
                    {`${(f * 100).toFixed(0)}%`}
                  </text>
                </g>
              ))}
              {/* 80% reference line */}
              <line
                data-testid="pareto-80line"
                x1={PAD.l}
                x2={W - PAD.r}
                y1={toYPct(0.8)}
                y2={toYPct(0.8)}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
              {sorted.map((p, i) => {
                const within80 = i < agentes80;
                return (
                  <g key={p.nome}>
                    <rect
                      data-testid="pareto-bar"
                      data-within80={within80 ? "true" : "false"}
                      x={bandX(i) + (bandW - barW) / 2}
                      y={toY(p.valor)}
                      width={barW}
                      height={PAD.t + plotH - toY(p.valor)}
                      fill={within80 ? "#3b82f6" : "#cbd5e1"}
                      rx={2}
                    />
                    <text
                      x={bandX(i) + bandW / 2}
                      y={H - PAD.b + 12}
                      fontSize={8}
                      fill="#64748b"
                      textAnchor="end"
                      transform={`rotate(-25, ${bandX(i) + bandW / 2}, ${H - PAD.b + 12})`}
                    >
                      {p.nome.split(" ")[0]}
                    </text>
                  </g>
                );
              })}
              <polyline points={linePts} fill="none" stroke="#f97316" strokeWidth={2} />
              {cumPct.map((c, i) => (
                <circle key={`m${i}`} cx={bandX(i) + bandW / 2} cy={toYPct(c)} r={2.5} fill="#f97316" />
              ))}
            </svg>
            <p className="mt-2 text-xs text-muted-foreground tabular-nums" data-testid="pareto-summary">
              <span className="font-semibold text-foreground">{agentes80}</span> agentes geram 80% do valor ·
              Concentração Top 3: <span className="font-semibold text-foreground">{(top3Pct * 100).toFixed(0)}%</span> ·
              Total {formatBRLCompact(total)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ParetoChart;
