import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import {
  fetchExcecoesDetalheAgente,
  fetchRejeitadosDetalheAgente,
  fetchQuebradosDetalheAgente,
  type ExcecaoSemPortfolioRow,
  type QuebradoDetalheRow,
} from "@/services/api";

export interface AgenteAcordoItem {
  id: string;
  devedor: string;
  dataAcordo: string;
  dataVencimento: string;
  valor: number;
  cpf: string;
  diasAtraso: number;
  motivo: string;
}

export interface AgenteDetalheViewModel {
  loading: boolean;
  excecoes: AgenteAcordoItem[];
  rejeitados: AgenteAcordoItem[];
  quebrados: AgenteAcordoItem[];
}

function daysSince(iso: string | null, today: Date): number | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const ref = new Date(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}T00:00:00`);
  return Math.round((ref.getTime() - d.getTime()) / 86_400_000);
}

function mapRows(rows: ExcecaoSemPortfolioRow[], today: Date): AgenteAcordoItem[] {
  return rows.map((r) => {
    const dVenc = r.data_vencimento ?? null;
    const dias = daysSince(dVenc, today) ?? 0;
    return {
      id: `${r.NR_RECEBIMENTO}/${r.ID_CARTEIRA}`,
      devedor: r.nome_devedor,
      dataAcordo: r.data_acordo ?? "—",
      dataVencimento: dVenc ?? "—",
      valor: Number(r.valor_total) || 0,
      cpf: r.cpf_mask,
      diasAtraso: dias,
      motivo: dias >= 30 ? `Atraso de ${dias} dias, alto risco.` : `Atraso de ${dias} dias desde o vencimento.`,
    };
  });
}

export function useAgenteDetalheViewModel(agente: string | null): AgenteDetalheViewModel {
  const { selectedDatabase, dateFrom, dateTo } = useGlobalFilters();

  const queries = useQueries({
    queries: [
      {
        queryKey: ["agente-detalhe", "excecoes", selectedDatabase, agente, dateFrom, dateTo] as const,
        queryFn: () => fetchExcecoesDetalheAgente(selectedDatabase, agente!, dateFrom, dateTo),
        enabled: !!agente,
        staleTime: 120_000,
      },
      {
        queryKey: ["agente-detalhe", "rejeitados", selectedDatabase, agente, dateFrom, dateTo] as const,
        queryFn: () => fetchRejeitadosDetalheAgente(selectedDatabase, agente!, dateFrom, dateTo),
        enabled: !!agente,
        staleTime: 120_000,
      },
      {
        queryKey: ["agente-detalhe", "quebrados", selectedDatabase, agente, dateFrom, dateTo] as const,
        queryFn: () => fetchQuebradosDetalheAgente(selectedDatabase, agente!, dateFrom, dateTo),
        enabled: !!agente,
        staleTime: 120_000,
      },
    ],
  });

  const today = useMemo(() => new Date(), []);

  return {
    loading: queries.some((q) => q.isLoading),
    excecoes: useMemo(() => mapRows((queries[0].data?.data ?? []) as ExcecaoSemPortfolioRow[], today), [queries[0].data, today]),
    rejeitados: useMemo(() => mapRows((queries[1].data?.data ?? []) as ExcecaoSemPortfolioRow[], today), [queries[1].data, today]),
    quebrados: useMemo(() => mapRows((queries[2].data?.data ?? []) as ExcecaoSemPortfolioRow[], today), [queries[2].data, today]),
  };
}
