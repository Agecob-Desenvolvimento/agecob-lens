import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtPct } from "@/lib/metrics";

export interface BuEfficiencyDatum {
  name: "AUTOS" | "CONSUMER";
  cpc: number;
  conversao: number;
}

interface BuEfficiencyChartProps {
  title: string;
  data: BuEfficiencyDatum[];
  cpcAverage?: number;
  conversaoAverage?: number;
  loading?: boolean;
  empty?: boolean;
}

export function BuEfficiencyChart({
  title,
  data,
  cpcAverage,
  conversaoAverage,
  loading,
  empty,
}: BuEfficiencyChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-base font-semibold leading-snug">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">Eixo Y: % de acionamentos (0–100%)</p>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading ? (
          <Skeleton className="h-72 w-full" />
        ) : empty || !data.length ? (
          <p className="text-sm text-muted-foreground">Sem dados.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: 12,
                }}
                formatter={(value: number) => fmtPct(value)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {typeof cpcAverage === "number" && cpcAverage > 0 ? (
                <ReferenceLine y={cpcAverage} stroke="hsl(38, 92%, 50%)" strokeDasharray="4 4" label={{ value: `Média CPC ${fmtPct(cpcAverage)}`, position: "insideTopRight", fontSize: 10 }} />
              ) : null}
              {typeof conversaoAverage === "number" && conversaoAverage > 0 ? (
                <ReferenceLine y={conversaoAverage} stroke="hsl(24, 95%, 53%)" strokeDasharray="4 4" label={{ value: `Média Conv. ${fmtPct(conversaoAverage)}`, position: "insideBottomRight", fontSize: 10 }} />
              ) : null}
              <Bar dataKey="cpc" name="CPC %" fill="hsl(38, 92%, 50%)" barSize={36} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="cpc" position="top" formatter={(v: number) => fmtPct(v)} style={{ fontSize: 11, fontWeight: 600 }} />
              </Bar>
              <Bar dataKey="conversao" name="Conversão %" fill="hsl(38, 92%, 70%)" barSize={36} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="conversao" position="top" formatter={(v: number) => fmtPct(v)} style={{ fontSize: 11, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default BuEfficiencyChart;
