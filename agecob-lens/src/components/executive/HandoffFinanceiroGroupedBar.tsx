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

export interface HandoffFinanceiroDatum {
  bu: string;
  valorAcordos: number;
  primeiraParcela: number;
}

interface HandoffFinanceiroGroupedBarProps {
  title?: string;
  data: HandoffFinanceiroDatum[];
  loading?: boolean;
  empty?: boolean;
}

const COLOR_VALOR = "#10b981";
const COLOR_PRIMEIRA = "#34d399";

export function HandoffFinanceiroGroupedBar({
  title = "Valor por Unidade de Negócio",
  data,
  loading,
  empty,
}: HandoffFinanceiroGroupedBarProps) {
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
          <XAxis
            dataKey="bu"
            tick={{ fontSize: 12, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />
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
          <Bar
            dataKey="valorAcordos"
            name="Valor Acordos"
            fill={COLOR_VALOR}
            barSize={32}
            radius={[4, 4, 0, 0]}
          >
            <LabelList
              dataKey="valorAcordos"
              position="top"
              formatter={(v: number) => fmtBRL(v, { compact: true })}
              style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
            />
          </Bar>
          <Bar
            dataKey="primeiraParcela"
            name="1ª Parcela"
            fill={COLOR_PRIMEIRA}
            barSize={32}
            radius={[4, 4, 0, 0]}
          >
            <LabelList
              dataKey="primeiraParcela"
              position="top"
              formatter={(v: number) => fmtBRL(v, { compact: true })}
              style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export default HandoffFinanceiroGroupedBar;
