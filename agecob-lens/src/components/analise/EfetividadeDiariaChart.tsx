import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EfetividadeDiaria } from "./analiseMocks";

interface EfetividadeDiariaChartProps {
  data: EfetividadeDiaria[];
  title?: string;
}

const W = 900;
const H = 240;
const PAD = { l: 36, r: 36, t: 12, b: 28 };

export function EfetividadeDiariaChart({
  data,
  title = "Efetividade Diária por Data de Vencimento",
}: EfetividadeDiariaChartProps) {
  const [hov, setHov] = useState<number | null>(null);

  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const maxB = (Math.max(...data.map((d) => d.boletos), 1)) * 1.1;
  const step = data.length > 1 ? plotW / (data.length - 1) : plotW;
  const toX = (i: number) => PAD.l + i * step;
  const toYB = (v: number) => PAD.t + plotH - (v / maxB) * plotH;
  const toYE = (v: number) => PAD.t + plotH - (v / 100) * plotH;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Sem dados para o período.</div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} data-testid="efetividade-svg" style={{ display: "block" }}>
            {[0, 15, 30, 45, 60].map((v) => (
              <g key={`yb${v}`}>
                <line x1={PAD.l} x2={W - PAD.r} y1={toYB(v)} y2={toYB(v)} stroke="#f1f5f9" strokeWidth={1} />
                <text x={PAD.l - 4} y={toYB(v) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">{v}</text>
              </g>
            ))}
            {[0, 25, 50, 75, 100].map((v) => (
              <text key={`ye${v}`} x={W - PAD.r + 4} y={toYE(v) + 3} textAnchor="start" fontSize={9} fill="#94a3b8">{v}%</text>
            ))}
            {data.map((d, i) => {
              const bw = Math.max(step * 0.6, 8);
              const bh = (d.boletos / maxB) * plotH;
              return (
                <rect
                  key={`bar${i}`}
                  data-testid="efetividade-bar"
                  x={toX(i) - bw / 2}
                  y={PAD.t + plotH - bh}
                  width={bw}
                  height={bh}
                  rx={2}
                  fill={hov === i ? "#93c5fd" : "#bfdbfe"}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHov(i)}
                  onMouseLeave={() => setHov(null)}
                />
              );
            })}
            <polyline
              points={data.map((d, i) => `${toX(i)},${toYE(d.efetividade)}`).join(" ")}
              fill="none"
              stroke="#16a34a"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {data.map((d, i) => (
              <circle
                key={`pt${i}`}
                cx={toX(i)}
                cy={toYE(d.efetividade)}
                r={hov === i ? 5 : 3}
                fill="#16a34a"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHov(i)}
                onMouseLeave={() => setHov(null)}
              />
            ))}
            {data.map((d, i) =>
              i % 2 === 0 ? (
                <text key={`xl${i}`} x={toX(i)} y={H - 4} textAnchor="middle" fontSize={9} fill="#94a3b8">{d.dia}</text>
              ) : null,
            )}
            {hov !== null && data[hov] && (
              <g data-testid="efetividade-tooltip">
                <rect x={Math.min(Math.max(toX(hov) - 56, 0), W - 112)} y={PAD.t - 2} width={112} height={30} rx={4} fill="#0f172a" opacity={0.92} />
                <text x={Math.min(Math.max(toX(hov), 56), W - 56)} y={PAD.t + 12} textAnchor="middle" fontSize={10} fill="#e2e8f0">
                  {data[hov].dia} · {data[hov].boletos} bol.
                </text>
                <text x={Math.min(Math.max(toX(hov), 56), W - 56)} y={PAD.t + 24} textAnchor="middle" fontSize={10} fill="#6ee7b7">
                  efet: {data[hov].efetividade}%
                </text>
              </g>
            )}
          </svg>
        )}
      </CardContent>
    </Card>
  );
}

export default EfetividadeDiariaChart;
