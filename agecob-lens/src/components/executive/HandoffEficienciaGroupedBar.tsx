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
import { ChartShell } from "@/components/executive/ChartShell";
import { fmtPct } from "@/lib/metrics";

export interface HandoffEficienciaDatum {
  bu: string;
  cpc: number;
  conversao: number;
}

export interface HandoffEficienciaSummary {
  cpcAvg: number;
  conversaoAvg: number;
}

interface HandoffEficienciaGroupedBarProps {
  data: HandoffEficienciaDatum[];
  summary: HandoffEficienciaSummary;
  title?: string;
  loading?: boolean;
  empty?: boolean;
  /** Horizontal reference line on the Y axis, e.g. 3 for 3% conversion target */
  metaConversao?: number;
}

const CPC_COLOR = "#f59e0b";
const CONVERSAO_COLOR = "#a3a300";

export function HandoffEficienciaGroupedBar({
  data,
  summary,
  title = "Taxa de contato % e Conversão % por Unidade de Negócio",
  loading,
  empty,
  metaConversao = 3,
}: HandoffEficienciaGroupedBarProps) {
  const isEmpty = empty || data.length === 0;

  return (
    <ChartShell
      title={title}
      description="Eixo Y: % de acionamentos (0–100%)"
      loading={loading}
      empty={isEmpty}
      height={288}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="bu"
            tick={{ fontSize: 12, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />
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
          {metaConversao != null && metaConversao > 0 && (
            <ReferenceLine
              y={metaConversao}
              stroke="#6b7280"
              strokeDasharray="5 5"
              strokeWidth={1.5}
              label={{ value: `Meta ${metaConversao}%`, position: "right", fontSize: 11, fill: "#6b7280" }}
              ifOverflow="extendDomain"
            />
          )}
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="cpc" name="Taxa de contato %" fill={CPC_COLOR} barSize={32} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList
              dataKey="cpc"
              position="top"
              formatter={(v: number) => fmtPct(v)}
              style={{ fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
          <Bar
            dataKey="conversao"
            name="Conversão %"
            fill={CONVERSAO_COLOR}
            barSize={32}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="conversao"
              position="top"
              formatter={(v: number) => fmtPct(v)}
              style={{ fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs font-medium text-slate-600 tabular-nums">
        Média taxa de contato: {fmtPct(summary.cpcAvg)} · Média Conv.: {fmtPct(summary.conversaoAvg)}
      </p>
    </ChartShell>
  );
}

export default HandoffEficienciaGroupedBar;