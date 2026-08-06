import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TendenciaMensal } from "./analiseMocks";

interface TendenciaMensalChartProps {
  data: TendenciaMensal[];
}

const W = 460;
const H = 220;
const PAD = { l: 36, r: 24, t: 12, b: 28 };

export function TendenciaMensalChart({ data }: TendenciaMensalChartProps) {
  const media = data.length
    ? Math.round(data.reduce((s, d) => s + d.conversao, 0) / data.length)
    : 0;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const gap = data.length ? plotW / data.length : plotW;
  const barW = gap * 0.65;
  const toY = (v: number) => PAD.t + plotH - (v / 100) * plotH;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Tendência Mensal · % Conversão</CardTitle>
      </CardHeader>
      <CardContent>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} data-testid="tendencia-svg" style={{ display: "block" }}>
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={toY(v)} y2={toY(v)} stroke="hsl(var(--chart-grid))" strokeWidth={1} />
              <text x={PAD.l - 4} y={toY(v) + 3} textAnchor="end" fontSize={9} fill="hsl(var(--chart-label))">{v}%</text>
            </g>
          ))}
          <line
            data-testid="tendencia-media"
            x1={PAD.l}
            x2={W - PAD.r}
            y1={toY(media)}
            y2={toY(media)}
            stroke="hsl(var(--chart-label))"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <text x={W - PAD.r + 2} y={toY(media) + 3} fontSize={9} fill="hsl(var(--chart-label))">Média {media}%</text>
          {data.map((d, i) => {
            const x = PAD.l + i * gap + (gap - barW) / 2;
            const h = (d.conversao / 100) * plotH;
            return (
              <g key={d.mes}>
                <rect data-testid="tendencia-bar" x={x} y={PAD.t + plotH - h} width={barW} height={h} rx={3} fill={d.color} />
                <text x={x + barW / 2} y={PAD.t + plotH - h - 6} textAnchor="middle" fontSize={10} fontWeight={600} fill={d.color}>
                  {d.conversao}%
                </text>
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="hsl(var(--chart-label-strong))">{d.mes}</text>
              </g>
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
}

export default TendenciaMensalChart;
