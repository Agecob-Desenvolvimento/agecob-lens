import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtBRL, fmtNum } from "@/lib/metrics";
import { linearRegression, residual, type Point } from "@/lib/regression";

export interface RegressionDatum {
  agente: string;
  x: number;
  y: number;
}

interface AgentRegressionScatterProps {
  title: string;
  data: RegressionDatum[];
  xLabel?: string;
  yLabel?: string;
  loading?: boolean;
  empty?: boolean;
  highlightAgent?: string;
}

const POSITIVE = "hsl(142, 71%, 45%)";
const NEGATIVE = "hsl(0, 72%, 51%)";
const HIGHLIGHT = "hsl(43, 95%, 56%)";

export function AgentRegressionScatter({
  title,
  data,
  xLabel = "Esforço",
  yLabel = "Resultado",
  loading,
  empty,
  highlightAgent,
}: AgentRegressionScatterProps) {
  const { lineData, bandData, scatter, fit } = useMemo(() => {
    const points: Point[] = data.map((d) => ({ x: d.x, y: d.y }));
    const f = linearRegression(points);
    const xs = points.map((p) => p.x);
    const minX = xs.length ? Math.min(...xs) : 0;
    const maxX = xs.length ? Math.max(...xs) : 0;
    const steps = 24;
    const stride = steps > 0 && maxX > minX ? (maxX - minX) / steps : 0;
    const line = Array.from({ length: steps + 1 }, (_, i) => {
      const x = minX + i * stride;
      const y = f.predict(x);
      return { x, y, upper: y + f.se, lower: y - f.se };
    });
    const sc = data.map((d) => ({
      ...d,
      residual: residual({ x: d.x, y: d.y }, f),
    }));
    return { lineData: line, bandData: line, scatter: sc, fit: f };
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-base font-semibold leading-snug">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">
          Regressão linear · R² = <span className="tabular-nums">{fit.r2.toFixed(2)}</span>. Verde = acima da linha (excede expectativa), vermelho = abaixo.
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading ? (
          <Skeleton className="h-80 w-full" />
        ) : empty || !data.length ? (
          <p className="text-sm text-muted-foreground">Sem dados.</p>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart margin={{ top: 16, right: 24, left: 8, bottom: 24 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" />
              <XAxis
                type="number"
                dataKey="x"
                name={xLabel}
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => fmtNum(v)}
                label={{ value: xLabel, position: "insideBottom", offset: -10, fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={yLabel}
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => fmtBRL(v, { compact: true })}
                label={{ value: yLabel, angle: -90, position: "insideLeft", fontSize: 11 }}
                width={80}
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload.find((q) => q.payload && "agente" in q.payload);
                  if (!p) return null;
                  const d = p.payload as RegressionDatum & { residual: number };
                  return (
                    <div className="rounded-md border bg-background p-2 text-xs space-y-1 shadow-md">
                      <p className="font-semibold">{d.agente}</p>
                      <p>{xLabel}: <span className="tabular-nums font-semibold">{fmtNum(d.x)}</span></p>
                      <p>{yLabel}: <span className="tabular-nums font-semibold">{fmtBRL(d.y)}</span></p>
                      <p className={d.residual >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        Resíduo: <span className="tabular-nums font-semibold">{fmtBRL(d.residual)}</span>
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                data={bandData}
                dataKey="upper"
                stroke="none"
                fill="hsl(217, 91%, 55%)"
                fillOpacity={0.08}
                isAnimationActive={false}
                legendType="none"
              />
              <Area
                data={bandData}
                dataKey="lower"
                stroke="none"
                fill="hsl(var(--background))"
                fillOpacity={1}
                isAnimationActive={false}
                legendType="none"
              />
              <Line
                data={lineData}
                dataKey="y"
                stroke="hsl(217, 91%, 45%)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                legendType="none"
              />
              <Scatter data={scatter} fill={POSITIVE}>
                {scatter.map((d, i) => {
                  const color =
                    highlightAgent && d.agente === highlightAgent
                      ? HIGHLIGHT
                      : d.residual >= 0
                        ? POSITIVE
                        : NEGATIVE;
                  return <Cell key={i} fill={color} />;
                })}
              </Scatter>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default AgentRegressionScatter;
