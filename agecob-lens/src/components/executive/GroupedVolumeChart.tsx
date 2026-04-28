import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtNum } from "@/lib/metrics";

export interface GroupedVolumeDatum {
  name: "AUTOS" | "CONSUMER";
  qtd_acionamentos: number;
  qtd_contatos: number;
}

interface GroupedVolumeChartProps {
  title: string;
  data: GroupedVolumeDatum[];
  loading?: boolean;
  empty?: boolean;
}

export function GroupedVolumeChart({ title, data, loading, empty }: GroupedVolumeChartProps) {
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
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v: number) => fmtNum(v)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: 12,
                }}
                formatter={(value: number) => fmtNum(value)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="qtd_acionamentos" name="Acionamentos" fill="hsl(217, 91%, 45%)" barSize={36} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="qtd_acionamentos" position="top" formatter={(v: number) => fmtNum(v)} style={{ fontSize: 11, fontWeight: 600 }} />
              </Bar>
              <Bar dataKey="qtd_contatos" name="Contatos" fill="hsl(217, 91%, 70%)" barSize={36} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="qtd_contatos" position="top" formatter={(v: number) => fmtNum(v)} style={{ fontSize: 11, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default GroupedVolumeChart;
