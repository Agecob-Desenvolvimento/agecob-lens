/**
 * Drill-down detail for a clicked portfolio bar (exceções / rejeitados).
 * Server state stays in TanStack Query; fetch fires only when a portfolio is selected.
 */

import { useQuery } from "@tanstack/react-query";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import {
  fetchAcordosDetalhe,
  fetchExcecoesDetalhe,
  fetchRejeitadosDetalhe,
  type ExcecaoSemPortfolioRow,
} from "@/services/api";

export type DetalheTipo = "valor" | "excecoes" | "rejeitados";

const FETCHERS = {
  valor: fetchAcordosDetalhe,
  excecoes: fetchExcecoesDetalhe,
  rejeitados: fetchRejeitadosDetalhe,
} as const;

export interface PortfolioDetalheResult {
  rows: ExcecaoSemPortfolioRow[];
  loading: boolean;
  error: string | null;
}

export function usePortfolioDetalhe(tipo: DetalheTipo, portfolio: string | null): PortfolioDetalheResult {
  const { selectedDatabase, dateFrom, dateTo } = useGlobalFilters();

  const query = useQuery({
    queryKey: ["portfolio-detalhe", tipo, selectedDatabase, portfolio, dateFrom, dateTo] as const,
    queryFn: () => FETCHERS[tipo](selectedDatabase, portfolio as string, dateFrom, dateTo),
    enabled: !!portfolio,
  });

  return {
    rows: query.data?.data ?? [],
    loading: query.isLoading && !!portfolio,
    error: query.isError ? (query.error as Error)?.message ?? "Erro ao carregar detalhe" : null,
  };
}
