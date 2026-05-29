import { useMemo } from "react";
import {
  CartesianGrid,
  Label,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartShell } from "@/components/executive/ChartShell";
import { fmtPct } from "@/lib/metrics";
import type { HandoffEficienciaDatum } from "@/components/executive/HandoffEficienciaGroupedBar";

interface HandoffActionMatrixProps {
  data: HandoffEficienciaDatum[];
  title?: string;
  loading?: boolean;
  empty?: boolean;
}

interface QuadrantPoint {
  bu: string;
  x: number; // Taxa de Conversão %
  y: number; // Taxa de Contato %
  insight: string;
}

const BU_DOT_COLORS: Record<string, string> = {
  AUTOS: "#6366f1",
  CONSUMER: "#06b6d4",
};

const QUADRANT_LABELS = {
  topRight: { text: "Alta Performance", dy: -8 },
  topLeft: { text: "Foco em Negociação", dy: -8 },
  bottomRight: { text: "Foco em Contato", dy: 12 },
  bottomLeft: { text: "Revisão Completa", dy: 12 },
};

function quadrantInsight(
  yAboveMedian: boolean,
  xAboveMedian: boolean,
): string {
  if (yAboveMedian && xAboveMedian) return "Alta Performance — documentar e replicar práticas";
  if (yAboveMedian && !xAboveMedian) return "Foco em Negociação — consegue falar mas não fecha. Treinar argumentação.";
  if (!yAboveMedian && xAboveMedian) return "Foco em Contato — fecha bem mas fala pouco. Melhorar discagem e validação de telefones.";
  return "Revisão Completa — revisar qualidade da base e treinar equipe.";
}

export function HandoffActionMatrix({
  data,
  title = "Matriz de Ação",
  loading,
  empty,
}: HandoffActionMatrixProps) {
  const isEmpty = empty || data.length === 0;

  const { points, medianX, medianY, xDomain, yDomain } = useMemo(() => {
    if (data.length === 0) {
      return { points: [] as QuadrantPoint[], medianX: 0, medianY: 0, xDomain: [0, 10] as [number, number], yDomain: [0, 100] as [number, number] };
    }
    const xs = data.map((d) => d.conversao);
    const ys = data.map((d) => d.cpc);
    const sortedX = [...xs].sort((a, b) => a - b);
    const sortedY = [...ys].sort((a, b) => a - b);
    const mx = data.length >= 2
      ? (sortedX[Math.floor(sortedX.length / 2)] + sortedX[Math.ceil(sortedX.length / 2)]) / 2
      : sortedX[0] ?? 4;
    const my = data.length >= 2
      ? (sortedY[Math.floor(sortedY.length / 2)] + sortedY[Math.ceil(sortedY.length / 2)]) / 2
      : sortedY[0] ?? 40;

    const points: QuadrantPoint[] = data.map((d) => ({
      bu: d.bu,
      x: d.conversao,
      y: d.cpc,
      insight: quadrantInsight(d.cpc >= my, d.conversao >= mx),
    }));

    const xMax = Math.max(...xs, mx * 1.1, 5);
    const yMax = Math.max(...ys, my * 1.1, 50);
    const xMin = 0;
    const yMin = 0;

    return {
      points,
      medianX: mx,
      medianY: my,
      xDomain: [xMin, Math.ceil(xMax * 1.2)] as [number, number],
      yDomain: [yMin, Math.min(100, Math.ceil(yMax * 1.15))] as [number, number],
    };
  }, [data]);

  return (
    <ChartShell
      title={title}
      description="Taxa de Contato × Taxa de Conversão. Quadrantes indicam ação prioritária."
      loading={loading}
      empty={isEmpty}
      height={320}
    >
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 16, right: 24, left: 8, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            type="number"
            dataKey="x"
            name="Conversão %"
            domain={xDomain}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          >
            <Label value="Taxa de Conversão %" offset={-10} position="insideBottom" fontSize={11} fill="hsl(var(--muted-foreground))" />
          </XAxis>
          <YAxis
            type="number"
            dataKey="y"
            name="Taxa de Contato %"
            domain={yDomain}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
          >
            <Label value="Taxa de Contato %" angle={-90} offset={0} position="insideLeft" fontSize={11} fill="hsl(var(--muted-foreground))" style={{ textAnchor: "middle" }} />
          </YAxis>
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.5rem",
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [fmtPct(value), name]}
            labelFormatter={(label: string) => label}
          />

          {/* Median divider lines */}
          {medianX > 0 && (
            <ReferenceLine
              x={medianX}
              stroke="hsl(var(--muted-foreground) / 0.4)"
              strokeDasharray="6 4"
              strokeWidth={1}
            />
          )}
          {medianY > 0 && (
            <ReferenceLine
              y={medianY}
              stroke="hsl(var(--muted-foreground) / 0.4)"
              strokeDasharray="6 4"
              strokeWidth={1}
            />
          )}

          {/* Quadrant labels */}
          {medianX > 0 && medianY > 0 && (
            <>
              <text
                x={`${((medianX + xDomain[1]) / 2 / xDomain[1]) * 90}%`}
                y="12%"
                textAnchor="middle"
                fontSize={9}
                fill="hsl(var(--muted-foreground) / 0.5)"
                className="uppercase tracking-wider"
              >
                {QUADRANT_LABELS.topRight.text}
              </text>
              <text
                x={`${(medianX / 2 / xDomain[1]) * 90}%`}
                y="12%"
                textAnchor="middle"
                fontSize={9}
                fill="hsl(var(--muted-foreground) / 0.5)"
                className="uppercase tracking-wider"
              >
                {QUADRANT_LABELS.topLeft.text}
              </text>
              <text
                x={`${((medianX + xDomain[1]) / 2 / xDomain[1]) * 90}%`}
                y="95%"
                textAnchor="middle"
                fontSize={9}
                fill="hsl(var(--muted-foreground) / 0.5)"
                className="uppercase tracking-wider"
              >
                {QUADRANT_LABELS.bottomRight.text}
              </text>
              <text
                x={`${(medianX / 2 / xDomain[1]) * 90}%`}
                y="95%"
                textAnchor="middle"
                fontSize={9}
                fill="hsl(var(--muted-foreground) / 0.5)"
                className="uppercase tracking-wider"
              >
                {QUADRANT_LABELS.bottomLeft.text}
              </text>
            </>
          )}

          {points.map((p) => {
            const color = BU_DOT_COLORS[p.bu] ?? "#6b7280";
            return (
              <Scatter
                key={p.bu}
                name={p.bu}
                data={[p]}
                fill={color}
                shape={(shapeProps: { cx?: number; cy?: number }) => {
                  const { cx = 0, cy = 0 } = shapeProps;
                  return (
                    <g>
                      <circle cx={cx} cy={cy} r={8} fill={color} fillOpacity={0.25} />
                      <circle cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={2} />
                      <text
                        x={cx}
                        y={cy - 14}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={700}
                        fill={color}
                      >
                        {p.bu}
                      </text>
                    </g>
                  );
                }}
              />
            );
          })}
        </ScatterChart>
      </ResponsiveContainer>

      {/* Insight legend below chart */}
      <div className="mt-2 space-y-1">
        {points.map((p) => (
          <p key={p.bu} className="text-[10px] text-muted-foreground leading-relaxed">
            <span className="font-semibold" style={{ color: BU_DOT_COLORS[p.bu] ?? "#6b7280" }}>
              {p.bu}
            </span>
            {": "}{p.insight}
          </p>
        ))}
      </div>
    </ChartShell>
  );
}

export default HandoffActionMatrix;
