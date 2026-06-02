import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TendenciaMensal } from "./analiseMocks";

interface EfetividadeHistoricaChartProps {
  data: TendenciaMensal[];
}

const W = 460;
const H = 220;
const PAD = { l: 36, r: 24, t: 24, b: 28 };

export function EfetividadeHistoricaChart({ data }: EfetividadeHistoricaChartProps) {
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const gap = data.length > 1 ? plotW / (data.length - 1) : plotW / 2;
  const toY = (v: number) => PAD.t + plotH - (v / 100) * plotH;

  const points = data.map((d, i) => {
    const x = data.length === 1 ? PAD.l + plotW / 2 : PAD.l + i * gap;
    const y = toY(d.conversao);
    return { x, y, ...d };
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Série Histórica da Efetividade</CardTitle>
        <CardDescription className="text-xs">
          Estamos melhorando ou piorando? Tendência mensal de conversão.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} data-testid="efetividade-historica-svg" style={{ display: "block" }}>
          {/* Y-axis gridlines */}
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={toY(v)} y2={toY(v)} stroke="#f1f5f9" strokeWidth={1} />
              <text x={PAD.l - 4} y={toY(v) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">{v}%</text>
            </g>
          ))}

          {/* Line connecting data points */}
          <polyline
            fill="none"
            stroke="#0ea5e9"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points.map((p) => `${p.x},${p.y}`).join(" ")}
            data-testid="efetividade-historica-line"
          />

          {/* Data points and labels */}
          {points.map((d) => (
            <g key={d.mes}>
              <circle
                cx={d.x}
                cy={d.y}
                r={4}
                fill="#0ea5e9"
                stroke="#fff"
                strokeWidth={2}
                data-testid="efetividade-historica-dot"
              />
              <text
                x={d.x}
                y={d.y - 10}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill={d.color}
              >
                {d.conversao}%
              </text>
              <text
                x={d.x}
                y={H - 6}
                textAnchor="middle"
                fontSize={9}
                fill="#64748b"
              >
                {d.mes}
              </text>
            </g>
          ))}
        </svg>
      </CardContent>
    </Card>
  );
}

export default EfetividadeHistoricaChart;
