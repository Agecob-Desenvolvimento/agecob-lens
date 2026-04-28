import { useEffect, useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import { type ModuleConfig } from "@/config/api";
import { AlertTriangle } from "lucide-react";
import {
  type ApiEnvelope,
  type AcordoRow,
  type DatabaseOption,
  fetchAcordos,
} from "@/services/api";

const MAX_TABLE_ROWS = 150;
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

/** Apenas colunas monetárias no gráfico — somar acordo/qtd/parcela distorce a escala. */
const CHART_MONEY_COLUMNS_ORDER = [
  "valor_atualizado_divida",
  "valor_total_acordo",
  "desconto_concedido",
  "valor_parcela",
] as const;

const CHART_MONEY_LABEL: Partial<Record<(typeof CHART_MONEY_COLUMNS_ORDER)[number], string>> = {
  valor_atualizado_divida: "Valor atualizado da dívida",
  valor_total_acordo: "Valor total do acordo",
  desconto_concedido: "Desconto concedido",
  valor_parcela: "Valor das parcelas (soma)",
};

interface DashboardModuleProps {
  config: ModuleConfig;
  db: DatabaseOption;
}

export default function DashboardModule({ config, db }: DashboardModuleProps) {
  const [envelope, setEnvelope] = useState<ApiEnvelope<AcordoRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchAcordos(db)
      .then((res) => {
        if (cancelled) return;
        setEnvelope(res);
        const arr = res.data;
        if (arr.length > 0) {
          setVisibleCols(new Set(Object.keys(arr[0])));
        } else {
          setVisibleCols(new Set());
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [db]);

  const rawData = envelope?.data ?? [];
  const data = useMemo(() => {
    if (rawData.length === 0) return [];
    if (rawData[0].banco_origem) return rawData;
    // Quando a consulta e por banco especifico, garante a coluna de origem na tabela.
    const sourceName = db === "todos" ? "consolidado" : db;
    return rawData.map((row) => ({ ...row, banco_origem: sourceName }));
  }, [rawData, db]);
  const groupedData = useMemo(() => {
    const byAcordo = new Map<string, AcordoRow & { parcelas_no_acordo?: number }>();
    for (const row of data) {
      const key = `${row.banco_origem ?? "sem_origem"}|${row.acordo}`;
      const existing = byAcordo.get(key);
      if (!existing) {
        byAcordo.set(key, { ...row, parcelas_no_acordo: 1 });
      } else {
        byAcordo.set(key, { ...existing, parcelas_no_acordo: (existing.parcelas_no_acordo ?? 1) + 1 });
      }
    }
    return Array.from(byAcordo.values());
  }, [data]);
  const tableData = useMemo(() => groupedData.slice(0, MAX_TABLE_ROWS), [groupedData]);

  const allColumns = useMemo(() => {
    if (data.length === 0) return [];
    const cols = Object.keys(data[0]);
    // Mantem banco_origem sempre como primeira coluna.
    if (cols.includes("banco_origem")) {
      return ["banco_origem", ...cols.filter((c) => c !== "banco_origem")];
    }
    return cols;
  }, [data]);

  const chartMoneyColumns = useMemo(() => {
    if (data.length === 0) return [] as string[];
    return CHART_MONEY_COLUMNS_ORDER.filter((col) => {
      if (!allColumns.includes(col)) return false;
      return typeof data[0][col as keyof AcordoRow] === "number";
    });
  }, [data, allColumns]);

  const chartData = useMemo(() => {
    if (!data || data.length === 0 || chartMoneyColumns.length === 0) return [];

    if (data.length === 1) {
      return chartMoneyColumns.map((col) => ({
        name: CHART_MONEY_LABEL[col as keyof typeof CHART_MONEY_LABEL] ?? col,
        value: Number(data[0][col as keyof AcordoRow]) || 0,
      }));
    }

    const sums: Record<string, number> = {};
    chartMoneyColumns.forEach((col) => {
      sums[col] = data.reduce((acc, row) => acc + (Number(row[col as keyof AcordoRow]) || 0), 0);
    });

    return chartMoneyColumns.map((col) => ({
      name: CHART_MONEY_LABEL[col as keyof typeof CHART_MONEY_LABEL] ?? col,
      value: sums[col],
    }));
  }, [data, chartMoneyColumns]);

  const kpiValorTotalAcordos = useMemo(() => {
    return groupedData.reduce((acc, row) => acc + (Number(row.valor_total_acordo) || 0), 0);
  }, [groupedData]);

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

  if (data.length === 0) {
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Registros retornados</p>
            <p className="text-2xl font-semibold tabular-nums">{rawData.length.toLocaleString("pt-BR")}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Acordos únicos</p>
            <p className="text-2xl font-semibold tabular-nums">{groupedData.length.toLocaleString("pt-BR")}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Valor total em acordos</p>
            <p className="text-2xl font-semibold tabular-nums">
              {kpiValorTotalAcordos.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          </div>
        </div>

        {chartData.length > 0 && (
          <div style={{ height: chartData.length * 56 + 48 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 8, right: 88, left: 168, bottom: 8 }}
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
                  formatter={(value: number) =>
                    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                  }
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={32}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="right"
                    fill="hsl(210, 20%, 82%)"
                    fontSize={11}
                    fontWeight={600}
                    formatter={(v: number) =>
                      v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
                    }
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
        <div className="overflow-auto max-h-80 border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                {displayedCols.map((col) => (
                  <TableHead
                    key={col}
                    className={
                      col === "banco_origem"
                        ? "sticky top-0 left-0 z-30 bg-background"
                        : "sticky top-0 z-20 bg-background"
                    }
                  >
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.map((row, i) => (
                <TableRow key={i}>
                  {displayedCols.map((col) => (
                    <TableCell key={col} className={col === "banco_origem" ? "sticky left-0 z-10 bg-background" : ""}>
                      {row[col as keyof AcordoRow] != null ? String(row[col as keyof AcordoRow]) : "—"}
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
