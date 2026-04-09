import { useEffect, useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import { type ModuleConfig, type DatabaseOption, apiFetch } from "@/config/api";
import { AlertTriangle } from "lucide-react";

const BAR_COLORS = [
  "hsl(217, 71%, 53%)",
  "hsl(210, 60%, 50%)",
  "hsl(200, 55%, 48%)",
  "hsl(190, 50%, 45%)",
  "hsl(180, 45%, 42%)",
  "hsl(170, 40%, 40%)",
  "hsl(160, 38%, 38%)",
  "hsl(150, 35%, 36%)",
];

const BAR_LABELS = [
  "Valor",
  "Valor Atualizado da Dívida",
  "Valor Total do Acordo",
  "Desconto Concedido",
  "Valor da Parcela",
  "Quantidade de Parcelas",
  "Número da Parcela",
];

interface DashboardModuleProps {
  config: ModuleConfig;
  db: DatabaseOption;
}

export default function DashboardModule({ config, db }: DashboardModuleProps) {
  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch<unknown>(`${config.endpoint}/${db}`)
      .then((res) => {
        if (cancelled) return;
        const arr = Array.isArray(res) ? res : [res];
        setData(arr as Record<string, unknown>[]);
        if (arr.length > 0) {
          setVisibleCols(new Set(Object.keys(arr[0] as object)));
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [config.endpoint, db]);

  const allColumns = useMemo(() => {
    if (!data || data.length === 0) return [];
    return Object.keys(data[0]);
  }, [data]);

  const numericColumns = useMemo(() => {
    if (!data || data.length === 0) return [];
    return allColumns.filter((col) => {
      const val = data[0][col];
      return typeof val === "number";
    });
  }, [data, allColumns]);

  const chartData = useMemo(() => {
    if (!data || data.length === 0 || numericColumns.length === 0) return [];

    if (data.length === 1) {
      return numericColumns.map((col, i) => ({
        name: BAR_LABELS[i] || col,
        value: Number(data[0][col]) || 0,
      }));
    }

    const sums: Record<string, number> = {};
    numericColumns.forEach((col) => {
      sums[col] = data.reduce((acc, row) => acc + (Number(row[col]) || 0), 0);
    });

    return numericColumns.map((col, i) => ({
      name: BAR_LABELS[i] || col,
      value: sums[col],
    }));
  }, [data, numericColumns]);

  const toggleCol = (col: string) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>{config.title}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader><CardTitle>{config.title}</CardTitle></CardHeader>
        <CardContent>
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
        <CardHeader><CardTitle>{config.title}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Nenhum dado disponível.</p>
        </CardContent>
      </Card>
    );
  }

  const displayedCols = allColumns.filter((c) => visibleCols.has(c));
  const maxValue = Math.max(...chartData.map((d) => d.value), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{config.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Horizontal Bar Chart - centered */}
        {chartData.length > 0 && (
          <div style={{ height: chartData.length * 50 + 40 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 60, left: 160, bottom: 5 }}
              >
                <XAxis
                  type="number"
                  domain={[0, maxValue]}
                  hide
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  tick={{ fill: "hsl(210, 20%, 80%)", fontSize: 13 }}
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
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={30}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="insideRight"
                    fill="hsl(0, 0%, 100%)"
                    fontSize={12}
                    fontWeight={600}
                    formatter={(v: number) => v.toLocaleString("pt-BR")}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Column selector */}
        <div className="flex flex-wrap gap-3">
          {allColumns.map((col) => (
            <label key={col} className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
              <Checkbox
                checked={visibleCols.has(col)}
                onCheckedChange={() => toggleCol(col)}
              />
              {col}
            </label>
          ))}
        </div>

        {/* Data table */}
        <div className="overflow-auto max-h-80">
          <Table>
            <TableHeader>
              <TableRow>
                {displayedCols.map((col) => (
                  <TableHead key={col}>{col}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i}>
                  {displayedCols.map((col) => (
                    <TableCell key={col}>
                      {row[col] != null ? String(row[col]) : "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
