/**
 * Drill-down detail para os KPIs de boletos (a vencer / vencidos não pagos /
 * quebrados). Espelha o filtro do KPI no período. Fetch só dispara quando a
 * sidebar abre (kind != null).
 */

import { useQuery } from "@tanstack/react-query";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { fetchBoletosDetalhe, type BoletosDetalheKind, type QuebradoDetalheRow } from "@/services/api";
import type { TipoParcela } from "./useEfetividadeViewModel";

export interface BoletosDetalheResult {
  rows: QuebradoDetalheRow[];
  loading: boolean;
  error: string | null;
}

export function useBoletosDetalhe(
  kind: BoletosDetalheKind | null,
  tipo: TipoParcela,
): BoletosDetalheResult {
  const { selectedDatabase, dateFrom, dateTo } = useGlobalFilters();
  const dbParam = selectedDatabase === "todos" ? undefined : selectedDatabase;

  const query = useQuery({
    queryKey: ["boletos-detalhe", kind, tipo, selectedDatabase, dateFrom, dateTo] as const,
    queryFn: () => fetchBoletosDetalhe(kind as BoletosDetalheKind, dateFrom, dateTo, dbParam, tipo),
    enabled: !!kind,
    staleTime: 120_000,
  });

  return {
    rows: query.data?.data ?? [],
    loading: query.isLoading && !!kind,
    error: query.isError ? (query.error as Error)?.message ?? "Erro ao carregar boletos" : null,
  };
}
