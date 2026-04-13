import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { type ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";

interface AnaliseChartsPanelProps {
  rows: ProdutividadeRowWithSource[];
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

type TooltipPayload = { payload?: { name?: string; valor?: number; qtd?: number } };

function ExcecoesTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border bg-card p-3 shadow-md text-sm space-y-1">
      <p><span className="text-muted-foreground">Team Business Unit:</span> {d.name}</p>
      <p><span className="text-muted-foreground">Valor Exceções:</span> {fmt(d?.valor ?? 0)}</p>
      <p><span className="text-muted-foreground">Qtd Exceções:</span> {d.qtd}</p>
    </div>
  );
}

function AcordosEscTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border bg-card p-3 shadow-md text-sm space-y-1">
      <p><span className="text-muted-foreground">Team Business Unit:</span> {d.name}</p>
      <p><span className="text-muted-foreground">Valor Acordos:</span> {fmt(d?.valor ?? 0)}</p>
      <p><span className="text-muted-foreground">Qtd Acordos:</span> {d.qtd}</p>
    </div>
  );
}

function AcordosPortTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border bg-card p-3 shadow-md text-sm space-y-1">
      <p><span className="text-muted-foreground">Portfolioname:</span> {d.name}</p>
      <p><span className="text-muted-foreground">Valor Acordos:</span> {fmt(d?.valor ?? 0)}</p>
      <p><span className="text-muted-foreground">Qtd Acordos:</span> {d.qtd}</p>
    </div>
  );
}

export default function AnaliseChartsPanel({ rows }: AnaliseChartsPanelProps) {
  const groupedByOffice = Object.values(rows.reduce<Record<string, { name: string; valor: number; qtd: number }>>((acc, row) => {
    const office = row.source;
    if (!acc[office]) acc[office] = { name: office, valor: 0, qtd: 0 };
    acc[office].valor += row.valor_acordos;
    acc[office].qtd += row.qtd_acordos;
    return acc;
  }, {}));
  const excecoesData = groupedByOffice.map((item) => ({ ...item, valor: Math.max(item.valor * 0.1, 0) }));
  const acordosEscData = groupedByOffice;
  const acordosPortData = [...rows]
    .sort((a, b) => b.valor_acordos - a.valor_acordos)
    .slice(0, 5)
    .map((row) => ({ name: row.NOME, valor: row.valor_acordos, qtd: row.qtd_acordos }));

  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground">No productivity data available.</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium text-center">Exceções Por Escritório</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={excecoesData} layout="vertical" margin={{ left: 20, right: 20 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
              <Tooltip content={<ExcecoesTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
              <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={28}>
                {excecoesData.map((_, i) => (
                  <Cell key={i} fill="#9b87f5" />
                ))}
                <LabelList
                  dataKey="valor"
                  position="insideRight"
                  formatter={(v: number) => fmt(v)}
                  style={{ fill: "#fff", fontSize: 12, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium text-center">Acordos Por Escritório</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={acordosEscData} layout="vertical" margin={{ left: 20, right: 20 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
              <Tooltip content={<AcordosEscTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
              <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={28}>
                {acordosEscData.map((_, i) => (
                  <Cell key={i} fill="#2dd4a8" />
                ))}
                <LabelList
                  dataKey="valor"
                  position="insideRight"
                  formatter={(v: number) => fmt(v)}
                  style={{ fill: "#fff", fontSize: 12, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium text-center">Acordos Por PortfolioName</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={acordosPortData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
              <Tooltip content={<AcordosPortTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
              <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={28}>
                {acordosPortData.map((_, i) => (
                  <Cell key={i} fill="#7dd3fc" />
                ))}
                <LabelList
                  dataKey="valor"
                  position="insideRight"
                  formatter={(v: number) => fmt(v)}
                  style={{ fill: "#1a3c2a", fontSize: 12, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
