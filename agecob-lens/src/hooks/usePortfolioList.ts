import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { type DatabaseOption, fetchPortfolios, type PortfolioRow } from "@/services/api";

interface UsePortfolioListResult {
  portfolios: PortfolioRow[];
  loading: boolean;
}

function dbTargets(db: DatabaseOption): Exclude<DatabaseOption, "todos">[] {
  if (db === "todos") return ["COBwebRCBAUTOS", "COBwebRCBCONSUMER"];
  return [db];
}

export function usePortfolioList(db: DatabaseOption): UsePortfolioListResult {
  const targets = useMemo(() => dbTargets(db), [db]);

  const queries = useQueries({
    queries: targets.map((target) => ({
      queryKey: ["portfolios", target] as const,
      queryFn: () => fetchPortfolios(target),
      staleTime: 5 * 60_000,
    })),
  });

  const loading = queries.some((q) => q.isLoading);

  const portfolios = useMemo<PortfolioRow[]>(() => {
    const seen = new Map<number, PortfolioRow>();
    queries.forEach((q) => {
      if (q.data?.data) {
        q.data.data.forEach((row) => {
          if (!seen.has(row.id)) seen.set(row.id, row);
        });
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [queries]);

  return { portfolios, loading };
}
