/**
 * Efetividade ViewModel hook — composes real efetividade API endpoints
 * into a single shape consumed by EfetividadeBoletos.tsx.
 *
 * Replaces all MOCK_* imports in analiseMocks.ts with live data.
 */

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import {
  fetchEfResumo,
  fetchEfMensalPrimeira,
  fetchEfMensalColchao,
  fetchEfAgentePrimeira,
  fetchEfAgenteColchao,
  fetchEfAgenteColchaoVencimento,
  fetchEfCurvaQuebra,
  fetchAcordosPorPortfolio,
  fetchExcecoesPorPortfolio,
  fetchRejeitadosPorPortfolio,
  type EfResumoDayRow,
  type EfResumoKpis,
  type EfMensalRow,
  type EfMensalColchaoRow,
  type EfAgenteRow,
  type EfAgenteColchaoRow,
  type EfAgenteColchaoVencimentoRow,
  type EfCurvaQuebraRow,
  type AcordosPorPortfolioRow,
  type ExcecoesPorPortfolioRow,
  type RejeitadosPorPortfolioRow,
} from "@/services/api";
import type { BoletoKpi, EfetividadeDiaria, TendenciaMensal, RankingAgenteBoleto } from "@/components/analise/analiseMocks";
import type { QuebraFaixa } from "@/components/analise/CurvaQuebraAtrasoChart";

export type TipoParcela = "primeira" | "colchao";

export interface EfetividadeViewModel {
  tipo: TipoParcela;
  loading: boolean;
  /** Raw KPIs from API for chart consumption */
  resumoKpis: EfResumoKpis | undefined;
  error: string | null;
  /** KPI strip */
  kpis: BoletoKpi[];
  /** Daily chart */
  diaria: EfetividadeDiaria[];
  /** Monthly trend */
  tendencia: TendenciaMensal[];
  /** Agent ranking */
  rankingAgentes: RankingAgenteBoleto[];
  /** Portfolio sections */
  portfolioValor: Array<{ nome: string; valor: number }>;
  portfolioExcecoes: Array<{ nome: string; qtd: number }>;
  portfolioRejeitados: Array<{ nome: string; qtd: number }>;
  /** Boletos quebrados — derived from colchão-vencimento agent data */
  boletosQuebrados: Array<{ nome: string; qtd: number }>;
  /** Total broken count for KPI */
  totalQuebrados: number;
  loadingPortfolio: boolean;
  loadingRanking: boolean;
  loadingQuebrados: boolean;
  /** Curva de quebra por faixa de atraso */
  curvaQuebra: QuebraFaixa[];
  loadingCurvaQuebra: boolean;
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function efResumoToKpis(kpis: EfResumoKpis | undefined, bestDay: EfResumoDayRow | null, worstDay: EfResumoDayRow | null, totalBroken: number): BoletoKpi[] {
  if (!kpis) return [];
  return [
    { label: "Boletos Gerados", value: kpis.generated, color: "#0f172a" },
    { label: "Pagos no Prazo", value: kpis.paid_on_time, color: "#0f172a" },
    { label: "Boletos Quebrados", value: totalBroken, color: "#dc2626", sub: totalBroken > 0 ? `${((totalBroken / kpis.generated) * 100).toFixed(1).replace(".", ",")}%` : undefined },
    { label: "% Conversão", value: `${kpis.conversion_pct.toFixed(2).replace(".", ",")}%`, color: "#f59e0b" },
    { label: "Efetividade", value: `${kpis.effectiveness_pct.toFixed(2).replace(".", ",")}%`, color: "#f59e0b" },
    { label: "Valor Boletos Vencendo", value: `R$ ${kpis.amount_maturing.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, color: "#0f172a" },
    { label: "Valor Recebido", value: `R$ ${kpis.amount_received.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, color: "#16a34a" },
    { label: "Melhor Dia", value: bestDay ? `${bestDay.dia.slice(5)} – ${bestDay.effectiveness_pct}%` : "—", color: "#16a34a" },
  ];
}

function efResumoDailyToDiaria(daily: EfResumoDayRow[]): EfetividadeDiaria[] {
  return daily.map((d) => ({
    dia: d.dia.slice(5),
    boletos: d.generated,
    efetividade: d.effectiveness_pct,
  }));
}

function efMensalToTendencia(rows: EfMensalRow[] | EfMensalColchaoRow[]): TendenciaMensal[] {
  return rows.map((r) => ({
    mes: `${MESES[(r.Mes || 1) - 1]}/${String(r.Ano || 2026).slice(2)}`,
    conversao: (r as EfMensalRow).Conversao_Prazo_5d ?? (r as EfMensalColchaoRow).Conversao_Colchao ?? 0,
    color: ((r as EfMensalRow).Conversao_Prazo_5d ?? (r as EfMensalColchaoRow).Conversao_Colchao ?? 0) >= 45 ? "#22c55e" : "#dc2626",
  }));
}

function efAgenteToRanking(rows: EfAgenteRow[] | EfAgenteColchaoRow[]): RankingAgenteBoleto[] {
  return [...rows]
    .sort((a, b) => {
      const convA = (a as EfAgenteRow).Conversao_Prazo_5d ?? (a as EfAgenteColchaoRow).Conversao_Colchao ?? 0;
      const convB = (b as EfAgenteRow).Conversao_Prazo_5d ?? (b as EfAgenteColchaoRow).Conversao_Colchao ?? 0;
      return convB - convA;
    })
    .slice(0, 8)
    .map((r) => ({
      nome: r.Agente,
      pct: (r as EfAgenteRow).Conversao_Prazo_5d ?? (r as EfAgenteColchaoRow).Conversao_Colchao ?? 0,
    }));
}

/** Derive boletos quebrados (generated - paid) from colchão-vencimento agent data. */
function efAgenteToQuebrados(rows: EfAgenteColchaoVencimentoRow[]): { nome: string; qtd: number }[] {
  return [...rows]
    .map((r) => ({
      nome: r.Agente,
      qtd: Math.max(0, (r.Boletos_Gerados_Colchao || 0) - (r.Pagos_No_Prazo || 0)),
    }))
    .filter((r) => r.qtd > 0)
    .sort((a, b) => b.qtd - a.qtd);
}

export function useEfetividadeViewModel(tipo: TipoParcela): EfetividadeViewModel {
  const { selectedDatabase, dateFrom, dateTo } = useGlobalFilters();
  const dbParam = selectedDatabase === "todos" ? undefined : selectedDatabase;

  // KPIs + daily chart
  const resumoQuery = useQuery({
    queryKey: ["efetividade", "resumo", selectedDatabase, dateFrom, dateTo, tipo] as const,
    queryFn: () => fetchEfResumo(dateFrom, dateTo, dbParam, tipo),
  });

  // Monthly trend
  const mensalQuery = useQuery<EfMensalRow[] | EfMensalColchaoRow[]>({
    queryKey: ["efetividade", "mensal", selectedDatabase, tipo] as const,
    queryFn: () =>
      tipo === "primeira"
        ? fetchEfMensalPrimeira(dbParam).then((e) => e.data as EfMensalRow[])
        : fetchEfMensalColchao(dbParam).then((e) => e.data as EfMensalColchaoRow[]),
  });

  // Agent ranking
  const agenteQuery = useQuery<EfAgenteRow[] | EfAgenteColchaoRow[]>({
    queryKey: ["efetividade", "agente", selectedDatabase, tipo] as const,
    queryFn: () =>
      tipo === "primeira"
        ? fetchEfAgentePrimeira(dbParam).then((e) => e.data as EfAgenteRow[])
        : fetchEfAgenteColchao(dbParam).then((e) => e.data as EfAgenteColchaoRow[]),
  });

  // Boletos quebrados — colchão-vencimento agent data
  const quebradosQuery = useQuery({
    queryKey: ["efetividade", "agente-colchao-vencimento", selectedDatabase] as const,
    queryFn: () => fetchEfAgenteColchaoVencimento(dbParam).then((e) => e.data as EfAgenteColchaoVencimentoRow[]),
    staleTime: 120_000,
  });

  // Portfolio
  const [portfolioQ, excecoesQ, rejeitadosQ] = useQueries({
    queries: [
      { queryKey: ["efetividade", "acordos-portfolio", selectedDatabase, dateFrom, dateTo] as const, queryFn: () => fetchAcordosPorPortfolio(selectedDatabase, dateFrom, dateTo) },
      { queryKey: ["efetividade", "excecoes-portfolio", selectedDatabase, dateFrom, dateTo] as const, queryFn: () => fetchExcecoesPorPortfolio(selectedDatabase, dateFrom, dateTo) },
      { queryKey: ["efetividade", "rejeitados-portfolio", selectedDatabase, dateFrom, dateTo] as const, queryFn: () => fetchRejeitadosPorPortfolio(selectedDatabase, dateFrom, dateTo) },
    ],
  });

  // Curva de quebra por faixa de atraso
  const curvaQuery = useQuery({
    queryKey: ["efetividade", "curva-quebra", selectedDatabase, dateFrom, dateTo] as const,
    queryFn: () => fetchEfCurvaQuebra(dateFrom, dateTo, dbParam).then((e) => e.data as EfCurvaQuebraRow[]),
    staleTime: 300_000,
  });

  const loading = resumoQuery.isLoading;
  const loadingPortfolio = portfolioQ.isLoading || excecoesQ.isLoading || rejeitadosQ.isLoading;
  const loadingRanking = agenteQuery.isLoading;
  const loadingQuebrados = quebradosQuery.isLoading;
  const loadingCurvaQuebra = curvaQuery.isLoading;

  const resumoData = resumoQuery.data?.data;

  // Derive broken totals
  const boletosQuebrados = useMemo(() => {
    if (!quebradosQuery.data) return [];
    return efAgenteToQuebrados(quebradosQuery.data);
  }, [quebradosQuery.data]);

  const totalQuebrados = useMemo(
    () => boletosQuebrados.reduce((s, r) => s + r.qtd, 0),
    [boletosQuebrados],
  );

  const kpis = useMemo(
    () => efResumoToKpis(resumoData?.kpis, resumoData?.best_day ?? null, resumoData?.worst_day ?? null, totalQuebrados),
    [resumoData, totalQuebrados],
  );
  const diaria = useMemo(() => (resumoData?.daily ? efResumoDailyToDiaria(resumoData.daily) : []), [resumoData]);

  const tendencia = useMemo(() => {
    if (!mensalQuery.data) return [];
    return efMensalToTendencia(mensalQuery.data);
  }, [mensalQuery.data]);

  const rankingAgentes = useMemo(() => {
    if (!agenteQuery.data) return [];
    return efAgenteToRanking(agenteQuery.data);
  }, [agenteQuery.data]);

  const portfolioValor = useMemo(() => {
    const rows = portfolioQ.data?.data ?? [];
    return [...rows]
      .sort((a, b) => Number(b.valor_acordos || 0) - Number(a.valor_acordos || 0))
      .slice(0, 8)
      .map((r) => ({ nome: r.portfolio_name, valor: Number(r.valor_acordos || 0) }));
  }, [portfolioQ.data]);

  const portfolioExcecoes = useMemo(() => {
    const rows = excecoesQ.data?.data ?? [];
    return rows
      .filter((r) => Number(r.qtd_excecoes || 0) > 0)
      .sort((a, b) => Number(b.qtd_excecoes || 0) - Number(a.qtd_excecoes || 0))
      .slice(0, 8)
      .map((r) => ({ nome: r.portfolio_name, qtd: Number(r.qtd_excecoes || 0) }));
  }, [excecoesQ.data]);

  const portfolioRejeitados = useMemo(() => {
    const rows = rejeitadosQ.data?.data ?? [];
    return rows
      .filter((r) => Number(r.qtd_rejeitados || 0) > 0)
      .sort((a, b) => Number(b.qtd_rejeitados || 0) - Number(a.qtd_rejeitados || 0))
      .slice(0, 8)
      .map((r) => ({ nome: r.portfolio_name, qtd: Number(r.qtd_rejeitados || 0) }));
  }, [rejeitadosQ.data]);

  const curvaQuebra = useMemo(() => {
    if (!curvaQuery.data) return [];
    return curvaQuery.data
      .map((r) => ({ faixa: r.faixa, taxaQuebra: Number(r.taxa_quebra) || 0, total: Number(r.total) || 0 }))
      .sort((a, b) => {
        const order: Record<string, number> = { "0-5 dias": 0, "6-15 dias": 1, "16-30 dias": 2, "31-60 dias": 3, "60+ dias": 4 };
        return (order[a.faixa] ?? 99) - (order[b.faixa] ?? 99);
      });
  }, [curvaQuery.data]);

  const error = resumoQuery.isError ? (resumoQuery.error as Error)?.message ?? "Erro ao carregar efetividade" : null;

  return {
    tipo,
    loading,
    error,
    resumoKpis: resumoData?.kpis,
    kpis,
    diaria,
    curvaQuebra,
    loadingCurvaQuebra,
    tendencia,
    rankingAgentes,
    portfolioValor,
    portfolioExcecoes,
    portfolioRejeitados,
    boletosQuebrados,
    totalQuebrados,
    loadingPortfolio,
    loadingRanking,
    loadingQuebrados,
  };
}