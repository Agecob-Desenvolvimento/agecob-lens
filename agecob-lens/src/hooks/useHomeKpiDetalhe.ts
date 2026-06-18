/**
 * Drill-down detail para os KPIs de Rejeitados / Exceções da Home (todas as
 * carteiras). Fetch só dispara quando a sidebar abre (kind != null).
 */

import { useQuery } from "@tanstack/react-query";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import {
  fetchAcordosDetalheGlobal,
  fetchExcecoesDetalheGlobal,
  fetchRejeitadosDetalheGlobal,
  type QuebradoDetalheRow,
} from "@/services/api";

// "acordos" e "primeira_parcela" listam as mesmas linhas (acordos gerados,
// PARCELA=0); diferem só no valor somado no header da sidebar.
export type HomeKpiDetalheKind = "excecoes" | "rejeitados" | "acordos" | "primeira_parcela";

const FETCHERS = {
  excecoes: fetchExcecoesDetalheGlobal,
  rejeitados: fetchRejeitadosDetalheGlobal,
  acordos: fetchAcordosDetalheGlobal,
  primeira_parcela: fetchAcordosDetalheGlobal,
} as const;

export interface HomeKpiDetalheResult {
  rows: QuebradoDetalheRow[];
  loading: boolean;
  error: string | null;
}

export function useHomeKpiDetalhe(kind: HomeKpiDetalheKind | null): HomeKpiDetalheResult {
  const { selectedDatabase, dateFrom, dateTo } = useGlobalFilters();

  const query = useQuery({
    queryKey: ["home-kpi-detalhe", kind, selectedDatabase, dateFrom, dateTo] as const,
    queryFn: () => FETCHERS[kind as HomeKpiDetalheKind](selectedDatabase, dateFrom, dateTo),
    enabled: !!kind,
    staleTime: 120_000,
  });

  return {
    rows: query.data?.data ?? [],
    loading: query.isLoading && !!kind,
    error: query.isError ? (query.error as Error)?.message ?? "Erro ao carregar detalhe" : null,
  };
}
