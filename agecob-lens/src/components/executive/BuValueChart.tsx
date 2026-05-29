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
import { ChartShell } from "@/components/executive/ChartShell";
import { fmtBRL } from "@/lib/metrics";

export interface BuValueDatum {
  name: "AUTOS" | "CONSUMER";
  valor_acordos: number;
  valor_primeira_parcela: number;
}

interface BuValueChartProps {
  title: string;
  data: BuValueDatum[];
  loading?: boolean;
  empty?: boolean;
}

export function BuValueChart({ title, data, loading, empty }: BuValueChartProps) {
  return (
    <ChartShell
      title={title}
      loading={loading}
      empty={empty || !data.length}
      height={288}
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(v: number) => fmtBRL(v, { compact: true })}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={70}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.5rem",
              fontSize: 12,
            }}
            formatter={(value: number) => fmtBRL(value)}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="valor_acordos" name="Valor Acordos" fill="hsl(142, 71%, 38%)" barSize={36} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="valor_acordos" position="top" formatter={(v: number) => fmtBRL(v, { compact: true })} style={{ fontSize: 11, fontWeight: 600 }} />
          </Bar>
          <Bar dataKey="valor_primeira_parcela" name="1ª Parcela" fill="hsl(142, 65%, 65%)" barSize={36} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="valor_primeira_parcela" position="top" formatter={(v: number) => fmtBRL(v, { compact: true })} style={{ fontSize: 11, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export default BuValueChart;
