import { useEffect, useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
  PieChart, Pie,
} from "recharts";
import { type DatabaseOption, apiFetch } from "@/config/api";
import { AlertTriangle } from "lucide-react";

const BAR_COLOR = "hsl(210, 60%, 50%)";
const DONUT_COLORS = [
  "hsl(210, 60%, 50%)",
  "hsl(180, 50%, 45%)",
  "hsl(150, 45%, 50%)",
  "hsl(270, 40%, 55%)",
  "hsl(330, 50%, 50%)",
];

// Metrics available for the bar chart dropdown
const METRIC_OPTIONS = [
  { value: "qtd_contatos", label: "Qtd Contatos" },
  { value: "qtd_acionamentos", label: "Qtd Acionamentos" },
  { value: "qtd_acordos", label: "Qtd Acordos" },
  { value: "valor_acordos", label: "Valor Acordos" },
  { value: "tempo_trabalhado", label: "Tempo Trabalhado" },
];

// Vital columns for the simplified table
const TABLE_COLUMNS = [
  { key: "agente", label: "Agente" },
  { key: "tempo_trabalhado", label: "Tempo Trabalhado" },
  { key: "qtd_acionamentos", label: "Qtd Acionamentos" },
  { key: "qtd_contatos", label: "Qtd Contatos" },
  { key: "valor_acordos", label: "Valor Acordos" },
];

interface AgentComparisonDashboardProps {
  db: DatabaseOption;
}

export default function AgentComparisonDashboard({ db }: AgentComparisonDashboardProps) {
  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState("qtd_contatos");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch<unknown>(`/dashboard/acordos-hoje/${db}`)
      .then((res) => {
        if (cancelled) return;
        const arr = Array.isArray(res) ? res : [res];
        setData(arr as Record<string, unknown>[]);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [db]);

  // Detect actual column keys from data
  const columnMap = useMemo(() => {
    if (!data || data.length === 0) return {};
    const keys = Object.keys(data[0]);
    // Try to map known concepts to actual keys (case-insensitive partial match)
    const find = (patterns: string[]) =>
      keys.find((k) => patterns.some((p) => k.toLowerCase().includes(p))) || "";
    return {
      agente: find(["agente", "nome", "name", "operador"]),
      qtd_contatos: find(["contato"]),
      qtd_acionamentos: find(["acionamento"]),
      qtd_acordos: find(["acordo", "deals"]),
      valor_acordos: find(["valor_acordo", "valor acordo", "value"]),
      tempo_trabalhado: find(["tempo_trabalhado", "tempo trabalhado", "worked"]),
    };
  }, [data]);

  // Top 5 agents by selected metric
  const top5Data = useMemo(() => {
    if (!data || !columnMap[metric as keyof typeof columnMap]) return [];
    const key = columnMap[metric as keyof typeof columnMap];
    if (!key) return [];
    return [...data]
      .sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0))
      .slice(0, 5)
      .map((row) => ({
        name: String(row[columnMap.agente] || "—").split(" ").slice(0, 2).join(" "),
        value: Number(row[key]) || 0,
      }));
  }, [data, metric, columnMap]);

  // Donut data: Tempo Trabalhado vs Tempo em Pausa (aggregated)
  const donutData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const keys = Object.keys(data[0]);
    const pausaKey = keys.find((k) => k.toLowerCase().includes("pausa")) || "";
    const trabKey = columnMap.tempo_trabalhado;
    if (!trabKey) return [];

    // Sum up values (could be time strings or numbers)
    const parseTime = (v: unknown): number => {
      if (typeof v === "number") return v;
      if (typeof v === "string" && v.includes(":")) {
        const parts = v.split(":").map(Number);
        return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
      }
      return Number(v) || 0;
    };

    const totalTrab = data.reduce((acc, row) => acc + parseTime(row[trabKey]), 0);
    const totalPausa = pausaKey
      ? data.reduce((acc, row) => acc + parseTime(row[pausaKey]), 0)
      : 0;

    return [
      { name: "Trabalhado", value: Math.round(totalTrab / 60) },
      { name: "Pausa", value: Math.round(totalPausa / 60) },
    ].filter((d) => d.value > 0);
  }, [data, columnMap]);

  // Conditional formatting helper
  const getCellClass = (key: string, value: unknown): string => {
    const num = Number(value);
    if (isNaN(num)) return "";
    if (key === "qtd_contatos" || key === "qtd_acordos") {
      if (num === 0) return "bg-destructive/20 text-destructive";
      if (num >= 5) return "bg-green-500/20 text-green-400";
    }
    if (key === "valor_acordos") {
      if (num === 0) return "bg-destructive/20 text-destructive";
      if (num > 0) return "bg-green-500/20 text-green-400";
    }
    return "";
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>Erro ao carregar dados: {error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-muted-foreground">Nenhum dado disponível.</p>
        </CardContent>
      </Card>
    );
  }

  const selectedMetricLabel = METRIC_OPTIONS.find((m) => m.value === metric)?.label || metric;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-center text-foreground">Comparação Agentes</h2>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top 5 Bar Chart */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Top 5 Agentes — {selectedMetricLabel}
            </CardTitle>
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="Métrica" />
              </SelectTrigger>
              <SelectContent>
                {METRIC_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {top5Data.length > 0 ? (
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top5Data} layout="vertical" margin={{ top: 5, right: 50, left: 10, bottom: 5 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={100}
                      tick={{ fill: "hsl(210, 20%, 80%)", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(220, 18%, 13%)",
                        border: "1px solid hsl(220, 15%, 20%)",
                        borderRadius: "0.5rem",
                        color: "hsl(210, 20%, 90%)",
                      }}
                      formatter={(value: number) => value.toLocaleString("pt-BR")}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={28}>
                      {top5Data.map((_, i) => (
                        <Cell key={i} fill={BAR_COLOR} />
                      ))}
                      <LabelList
                        dataKey="value"
                        position="right"
                        fill="hsl(210, 20%, 80%)"
                        fontSize={12}
                        fontWeight={600}
                        formatter={(v: number) => v.toLocaleString("pt-BR")}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sem dados para esta métrica.</p>
            )}
          </CardContent>
        </Card>

        {/* Donut Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tempo Trabalhado vs. Pausa (min)</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {donutData.length > 0 ? (
              <div style={{ height: 260, width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={4}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}min`}
                    >
                      {donutData.map((_, i) => (
                        <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(220, 18%, 13%)",
                        border: "1px solid hsl(220, 15%, 20%)",
                        borderRadius: "0.5rem",
                        color: "hsl(210, 20%, 90%)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sem dados de tempo.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Simplified Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Detalhamento por Agente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  {TABLE_COLUMNS.map((col) => (
                    <TableHead key={col.key}>{col.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i}>
                    {TABLE_COLUMNS.map((col) => {
                      const actualKey = columnMap[col.key as keyof typeof columnMap] || "";
                      const val = actualKey ? row[actualKey] : undefined;
                      return (
                        <TableCell
                          key={col.key}
                          className={getCellClass(col.key, val)}
                        >
                          {val != null ? String(val) : "—"}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
