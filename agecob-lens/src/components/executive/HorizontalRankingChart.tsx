import { useState } from "react";
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
import { Maximize2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MetricUnit } from "@/types/executive";
import { fmtByUnit } from "@/lib/metrics";

export interface HorizontalRankingDatum {
  name: string;
  value: number;
  secondaryValue?: number;
  secondaryUnit?: MetricUnit;
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

interface RankingBarChartProps {
  data: HorizontalRankingDatum[];
  unit: MetricUnit;
  defaultColor: string;
  height: number;
  yAxisWidth: number;
  truncateChars?: number;
  barSize: number;
}

function RankingBarChart({
  data,
  unit,
  defaultColor,
  height,
  yAxisWidth,
  truncateChars,
  barSize,
}: RankingBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 110, top: 8, bottom: 8 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={yAxisWidth}
          tick={{ fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) =>
            truncateChars && v.length > truncateChars ? `${v.slice(0, truncateChars)}…` : v
          }
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
                <p className="font-semibold max-w-[420px] whitespace-normal">{d.name}</p>
                <p>{fmtByUnit(d.value, unit)}</p>
                {d.secondaryValue != null && d.secondaryUnit ? (
                  <p className="text-muted-foreground">{fmtByUnit(d.secondaryValue, d.secondaryUnit)}</p>
                ) : null}
              </div>
            );
          }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={barSize}>
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
  );
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
  const [expanded, setExpanded] = useState(false);
  const chartHeight = height ?? Math.max(240, data.length * 36);
  const canExpand = !loading && !empty && data.length > 0;
  const expandedHeight = Math.max(420, data.length * 44);

  return (
    <>
      <Card>
        <CardHeader className="pb-2 pt-3 px-4 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold leading-snug">{title}</CardTitle>
          {canExpand ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setExpanded(true)}
              aria-label="Ampliar gráfico"
              title="Ampliar gráfico"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {loading ? (
            <Skeleton className="h-72 w-full" />
          ) : empty || !data.length ? (
            <p className="text-sm text-muted-foreground">Sem dados.</p>
          ) : (
            <RankingBarChart
              data={data}
              unit={unit}
              defaultColor={defaultColor}
              height={chartHeight}
              yAxisWidth={170}
              truncateChars={22}
              barSize={26}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-[95vw] w-[95vw] sm:max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto pr-2">
            <RankingBarChart
              data={data}
              unit={unit}
              defaultColor={defaultColor}
              height={expandedHeight}
              yAxisWidth={420}
              barSize={28}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default HorizontalRankingChart;
