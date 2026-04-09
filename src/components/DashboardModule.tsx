import { useEffect, useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { FunnelChart, Funnel, LabelList, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { type ModuleConfig } from "@/config/api";
import { AlertTriangle } from "lucide-react";
import {
  type ApiEnvelope,
  type AcordoRow,
  type DatabaseOption,
  fetchAcordos,
} from "@/services/api";

const MAX_TABLE_ROWS = 150;
const FUNNEL_COLORS = [
  "hsl(210, 60%, 50%)",
  "hsl(180, 50%, 45%)",
  "hsl(150, 45%, 50%)",
  "hsl(270, 40%, 55%)",
  "hsl(330, 50%, 50%)",
  "hsl(40, 60%, 50%)",
  "hsl(0, 50%, 50%)",
  "hsl(200, 55%, 55%)",
];

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
        // Default: show all columns
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

  const numericColumns = useMemo(() => {
    if (data.length === 0) return [];
    return allColumns.filter((col) => {
      const val = data[0][col as keyof AcordoRow];
      return typeof val === "number";
    });
  }, [data, allColumns]);

  // Build funnel data from the first row's numeric fields (summary view)
  // or aggregate if multiple rows
  const funnelData = useMemo(() => {
    if (data.length === 0 || numericColumns.length === 0) return [];

    // If single row, use its numeric fields as funnel stages
    if (data.length === 1) {
      return numericColumns
        .map((col) => ({
          name: col,
          value: Number(data[0][col as keyof AcordoRow]) || 0,
        }))
        .sort((a, b) => b.value - a.value);
    }

    // Multiple rows: sum each numeric column
    const sums: Record<string, number> = {};
    numericColumns.forEach((col) => {
      sums[col] = data.reduce((acc, row) => acc + (Number(row[col as keyof AcordoRow]) || 0), 0);
    });

    return numericColumns
      .map((col) => ({ name: col, value: sums[col] }))
      .sort((a, b) => b.value - a.value);
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
  const totalAcordos = new Set(data.map((row) => row.acordo)).size;
  const totalValorParcelas = data.reduce((sum, row) => sum + Number(row.valor_parcela || 0), 0);
  const paidCount = data.filter((row) => row.situacao_pagamento === "PAGO").length;
  const openCount = data.length - paidCount;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{config.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total de linhas</p>
              <p className="text-xl font-semibold">{envelope?.meta.total_rows ?? data.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Acordos únicos</p>
              <p className="text-xl font-semibold">{totalAcordos}</p>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Parcelas pagas</p>
              <p className="text-xl font-semibold">{paidCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Parcelas em aberto</p>
              <p className="text-xl font-semibold">{openCount}</p>
            </CardContent>
          </Card>
        </div>

        <div className="text-sm text-muted-foreground">
          Total de valor de parcelas:{" "}
          <span className="font-medium text-foreground">
            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalValorParcelas)}
          </span>
        </div>
        <div className="text-sm text-muted-foreground">
          Exibindo <span className="font-medium text-foreground">{Math.min(groupedData.length, MAX_TABLE_ROWS)}</span> de{" "}
          <span className="font-medium text-foreground">{groupedData.length}</span> acordos agrupados.
        </div>

        {/* Funnel Chart */}
        {funnelData.length > 0 && (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <FunnelChart>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(220, 18%, 13%)",
                    border: "1px solid hsl(220, 15%, 20%)",
                    borderRadius: "0.5rem",
                    color: "hsl(210, 20%, 90%)",
                  }}
                />
                <Funnel dataKey="value" data={funnelData} isAnimationActive>
                  {funnelData.map((_, i) => (
                    <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                  ))}
                  <LabelList
                    position="right"
                    fill="hsl(210, 20%, 90%)"
                    stroke="none"
                    dataKey="name"
                    fontSize={12}
                  />
                </Funnel>
              </FunnelChart>
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
