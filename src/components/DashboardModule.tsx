import { useEffect, useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { FunnelChart, Funnel, LabelList, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { type ModuleConfig, type DatabaseOption, apiFetch } from "@/config/api";
import { AlertTriangle } from "lucide-react";

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
        // Default: show all columns
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

  // Build funnel data from the first row's numeric fields (summary view)
  // or aggregate if multiple rows
  const funnelData = useMemo(() => {
    if (!data || data.length === 0 || numericColumns.length === 0) return [];

    // If single row, use its numeric fields as funnel stages
    if (data.length === 1) {
      return numericColumns
        .map((col) => ({
          name: col,
          value: Number(data[0][col]) || 0,
        }))
        .sort((a, b) => b.value - a.value);
    }

    // Multiple rows: sum each numeric column
    const sums: Record<string, number> = {};
    numericColumns.forEach((col) => {
      sums[col] = data.reduce((acc, row) => acc + (Number(row[col]) || 0), 0);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{config.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
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
