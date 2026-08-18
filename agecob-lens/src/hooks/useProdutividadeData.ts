import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  type DatabaseOption,
  fetchHealth,
  fetchProdutividade,
  type ProdutividadeFilters,
  type ProdutividadeRow,
} from "@/services/api";

export interface ProdutividadeRowWithSource extends ProdutividadeRow {
  source: Exclude<DatabaseOption, "todos">;
}

interface UseProdutividadeDataResult {
  rows: ProdutividadeRowWithSource[];
  loading: boolean;
  error: string | null;
  warnings: string[];
  refresh: () => Promise<void>;
}

function dbTargets(db: DatabaseOption): Exclude<DatabaseOption, "todos">[] {
  if (db === "todos") return ["COBwebRCBAUTOS", "COBwebRCBCONSUMER"];
  return [db];
}

export function useProdutividadeData(
  db: DatabaseOption,
  filters?: ProdutividadeFilters,
  /** false segura o fetch — usado para escalonar janelas secundárias (baseline). */
  enabled = true,
): UseProdutividadeDataResult {
  const dateFrom = filters?.dateFrom ?? "";
  const dateTo = filters?.dateTo ?? "";
  const portfolio = filters?.portfolio;
  const targets = useMemo(() => dbTargets(db), [db]);

  const prodQueries = useQueries({
    queries: targets.map((target) => ({
      queryKey: ["produtividade", target, dateFrom, dateTo, portfolio] as const,
      queryFn: () => {
        const f: ProdutividadeFilters = {};
        if (dateFrom) f.dateFrom = dateFrom;
        if (dateTo) f.dateTo = dateTo;
        if (portfolio) f.portfolio = portfolio;
        return fetchProdutividade(target, Object.keys(f).length ? f : undefined);
      },
      enabled,
    })),
  });

  const healthQueries = useQueries({
    queries: targets.map((target) => ({
      queryKey: ["health", target] as const,
      queryFn: () => fetchHealth(target),
      staleTime: 30_000,
      enabled,
    })),
  });

  const loading =
    prodQueries.some((q) => q.isLoading) || healthQueries.some((q) => q.isLoading);

  const rows = useMemo<ProdutividadeRowWithSource[]>(() => {
    const acc: ProdutividadeRowWithSource[] = [];
    prodQueries.forEach((q, i) => {
      const source = targets[i];
      if (q.data?.data) q.data.data.forEach((row) => acc.push({ ...row, source }));
    });
    return acc;
  }, [prodQueries, targets]);

  const warnings = useMemo<string[]>(() => {
    const acc: string[] = [];
    prodQueries.forEach((q, i) => {
      if (q.isError) acc.push(`${targets[i]}: productivity failed (${(q.error as Error)?.message ?? "unknown error"})`);
    });
    healthQueries.forEach((q, i) => {
      if (q.isError) acc.push(`${targets[i]}: health check failed (${(q.error as Error)?.message ?? "unknown error"})`);
    });
    return acc;
  }, [prodQueries, healthQueries, targets]);

  const allProdFailed = prodQueries.length > 0 && prodQueries.every((q) => q.isError);
  const error = rows.length === 0 && allProdFailed ? warnings[0] ?? "No data sources available" : null;

  const refresh = async () => {
    await Promise.all([
      ...prodQueries.map((q) => q.refetch()),
      ...healthQueries.map((q) => q.refetch()),
    ]);
  };

  return { rows, loading, error, warnings, refresh };
}