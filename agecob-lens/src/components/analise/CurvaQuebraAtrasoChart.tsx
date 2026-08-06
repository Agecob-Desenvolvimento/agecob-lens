import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Maximize2, Minimize2 } from "lucide-react";

export interface QuebraFaixa {
  faixa: string;
  taxaQuebra: number;
  /** População em risco na faixa (acordos que chegaram vivos até aqui) */
  total: number;
}

interface CurvaQuebraAtrasoChartProps {
  data: QuebraFaixa[];
}

const W = 520;
const H = 260;
const W_FULL = 960;
const H_FULL = 440;
const PAD = { l: 48, r: 24, t: 16, b: 56 };
const PAD_FULL = { l: 56, r: 32, t: 24, b: 64 };

function barColor(i: number, total: number): string {
  const frac = total <= 1 ? 0 : i / (total - 1);
  if (frac <= 0.5) {
    const t = frac / 0.5;
    const r = Math.round(16 + (245 - 16) * t);
    const g = Math.round(185 + (158 - 185) * t);
    const b = Math.round(129 + (11 - 129) * t);
    return `rgb(${r},${g},${b})`;
  }
  const t = (frac - 0.5) / 0.5;
  const r = Math.round(245 + (244 - 245) * t);
  const g = Math.round(158 + (63 - 158) * t);
  const b = Math.round(11 + (94 - 11) * t);
  return `rgb(${r},${g},${b})`;
}

export function CurvaQuebraAtrasoChart({ data }: CurvaQuebraAtrasoChartProps) {
  const [expanded, setExpanded] = useState(false);

  const curW = expanded ? W_FULL : W;
  const curH = expanded ? H_FULL : H;
  const curPad = expanded ? PAD_FULL : PAD;
  const plotW = curW - curPad.l - curPad.r;
  const plotH = curH - curPad.t - curPad.b;
  const gap = data.length > 0 ? plotW / data.length : plotW;
  const barW = data.length > 0 ? gap * 0.6 : plotW * 0.6;
  const toY = (v: number) => curPad.t + plotH - (v / 100) * plotH;

  return (
    <Card className={expanded ? "fixed inset-4 z-50 flex flex-col shadow-2xl" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">Curva de Quebra por Atraso</CardTitle>
            <CardDescription className="text-xs">
              Probabilidade de quebra em cada faixa, dado que o acordo sobreviveu às faixas anteriores (taxa de hazard).
            </CardDescription>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={expanded ? "Minimizar" : "Maximizar"}
            aria-label={expanded ? "Minimizar gráfico" : "Maximizar gráfico"}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </CardHeader>
      <CardContent className={expanded ? "flex-1 overflow-auto" : ""}>
        {data.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-6 text-center">Sem dados no período</p>
        ) : (
          <svg
            viewBox={`0 0 ${curW} ${curH}`}
            width="100%"
            height={expanded ? "100%" : curH}
            data-testid="curva-quebra-svg"
            style={{ display: "block" }}
          >
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map((v) => (
              <g key={`grid-${v}`}>
                <line
                  x1={curPad.l}
                  x2={curW - curPad.r}
                  y1={toY(v)}
                  y2={toY(v)}
                  stroke="hsl(var(--chart-grid))"
                  strokeWidth={1}
                />
                <text
                  x={curPad.l - 6}
                  y={toY(v) + 3}
                  textAnchor="end"
                  fontSize={9}
                  fill="hsl(var(--chart-label))"
                >
                  {v}%
                </text>
              </g>
            ))}

            {/* Dashed reference line at 50% */}
            <line
              data-testid="curva-quebra-ref"
              x1={curPad.l}
              x2={curW - curPad.r}
              y1={toY(50)}
              y2={toY(50)}
              stroke="hsl(var(--chart-label))"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <text
              x={curW - curPad.r + 2}
              y={toY(50) + 3}
              fontSize={9}
              fill="hsl(var(--chart-label))"
            >
              50%
            </text>

            {/* Bars */}
            {data.map((d, i) => {
              const x = curPad.l + i * gap + (gap - barW) / 2;
              const h = Math.max((d.taxaQuebra / 100) * plotH, 0);
              const color = barColor(i, data.length);

              return (
                <g key={d.faixa}>
                  <rect
                    data-testid="curva-quebra-bar"
                    x={x}
                    y={curPad.t + plotH - h}
                    width={barW}
                    height={h || 0}
                    rx={3}
                    fill={color}
                  />
                  {/* Taxa de quebra above bar */}
                  <text
                    x={x + barW / 2}
                    y={curPad.t + plotH - h - 6}
                    textAnchor="middle"
                    fontSize={expanded ? 12 : 10}
                    fontWeight={600}
                    fill={color}
                  >
                    {d.taxaQuebra}%
                  </text>
                  {/* At-risk count below the % label */}
                  <text
                    x={x + barW / 2}
                    y={curPad.t + plotH - h - (expanded ? 20 : 17)}
                    textAnchor="middle"
                    fontSize={expanded ? 10 : 8}
                    fontWeight={500}
                    fill="hsl(var(--chart-label-strong))"
                  >
                    Em risco: {d.total}
                  </text>
                  {/* Faixa label at bottom */}
                  <text
                    x={x + barW / 2}
                    y={curH - 6}
                    textAnchor="middle"
                    fontSize={expanded ? 10 : 8}
                    fill="hsl(var(--chart-label-strong))"
                  >
                    {d.faixa}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </CardContent>
    </Card>
  );
}

export default CurvaQuebraAtrasoChart;
