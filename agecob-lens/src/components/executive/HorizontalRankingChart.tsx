import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MetricUnit } from "@/types/executive";
import { fmtByUnit } from "@/lib/metrics";

export interface HorizontalRankingDatum {
  name: string;
  value: number;
  /** Optional secondary value rendered next to the bar (same unit as value if not provided) */
  secondaryValue?: number;
  secondaryUnit?: MetricUnit;
  /** Optional categorical color tag (e.g. BU). When provided, color overrides default. */
  color?: string;
}

interface HorizontalRankingChartProps {
  title: string;
  data: HorizontalRankingDatum[];
  unit: MetricUnit;
  defaultColor?: string;
  loading?: boolean;
  empty?: boolean;
  height?: number;
}

export function HorizontalRankingChart({
  title,
  data,
  unit,
  defaultColor = "hsl(142, 71%, 38%)",
  loading,
  empty,
  height,
}: HorizontalRankingChartProps) {
  const chartHeight = height ?? Math.max(240, data.length * 36);
  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-base font-semibold leading-snug">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading ? (
          <Skeleton className="h-72 w-full" />
        ) : empty || !data.length ? (
          <p className="text-sm text-muted-foreground">Sem dados.</p>
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 96, top: 8, bottom: 8 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={170}
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 22)}…` : v)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: 12,
                }}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload as HorizontalRankingDatum;
                  return (
                    <div className="rounded-md border bg-background p-2 text-xs space-y-0.5 shadow-md">
                      <p className="font-semibold truncate max-w-[220px]">{d.name}</p>
                      <p>{fmtByUnit(d.value, unit)}</p>
                      {d.secondaryValue != null && d.secondaryUnit ? (
                        <p className="text-muted-foreground">{fmtByUnit(d.secondaryValue, d.secondaryUnit)}</p>
                      ) : null}
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={26}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.color ?? defaultColor} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  fontSize={11}
                  fontWeight={600}
                  formatter={(v: number) => fmtByUnit(v, unit)}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default HorizontalRankingChart;
