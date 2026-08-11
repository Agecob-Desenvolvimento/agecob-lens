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
  fetchQuebradosPorPortfolio,
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
  type QuebradosPorPortfolioRow,
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
  portfolioExcecoes: Array<{ nome: string; valor: number }>;
  portfolioRejeitados: Array<{ nome: string; valor: number }>;
  /** Boletos quebrados por portfólio — valor total */
  boletosQuebradosValor: Array<{ nome: string; valor: number }>;
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

function efResumoToKpis(kpis: EfResumoKpis | undefined, worstDay: EfResumoDayRow | null): BoletoKpi[] {
  if (!kpis) return [];
  return [
    { label: "Boletos a Vencer", value: kpis.to_mature, color: "hsl(var(--chart-ink))", unit: "count", sub: kpis.generated > 0 ? `${((kpis.to_mature / kpis.generated) * 100).toFixed(1).replace(".", ",")}% em aberto` : undefined },
    { label: "Em Carência", value: kpis.em_carencia, color: "#f59e0b", unit: "count", sub: kpis.generated > 0 ? `${((kpis.em_carencia / kpis.generated) * 100).toFixed(1).replace(".", ",")}% no prazo` : undefined },
    { label: "Vencidos não Pagos", value: kpis.overdue_unpaid, color: "#dc2626", unit: "count", sub: kpis.generated > 0 ? `${((kpis.overdue_unpaid / kpis.generated) * 100).toFixed(1).replace(".", ",")}% perdido` : undefined },
    { label: "Valor Boletos Vencendo", value: `R$ ${kpis.amount_maturing.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, color: "hsl(var(--chart-ink))", unit: "BRL" },
    { label: "Pagos no Prazo", value: kpis.paid_on_time, color: "hsl(var(--chart-ink))", unit: "count" },
    { label: "Boletos Quebrados", value: kpis.broken, color: "#dc2626", unit: "count", sub: kpis.generated > 0 ? `${((kpis.broken / kpis.generated) * 100).toFixed(1).replace(".", ",")}%` : undefined },
    { label: "% Conversão", value: `${kpis.conversion_pct.toFixed(2).replace(".", ",")}%`, color: "#f59e0b", unit: "percent" },
    { label: "Efetividade", value: `${kpis.effectiveness_pct.toFixed(2).replace(".", ",")}%`, color: "#f59e0b", unit: "percent" },
    { label: "Valor Recebido", value: `R$ ${kpis.amount_received.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, color: "#16a34a", unit: "BRL" },
    { label: "Boletos Gerados", value: kpis.generated, color: "hsl(var(--chart-ink))", unit: "count" },
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

  // Boletos quebrados — por portfólio (qtd + valor)
  const quebradosQuery = useQuery({
    queryKey: ["efetividade", "quebrados-portfolio", selectedDatabase, dateFrom, dateTo] as const,
    queryFn: () => fetchQuebradosPorPortfolio(selectedDatabase, dateFrom, dateTo).then((e) => e.data as QuebradosPorPortfolioRow[]),
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
  const boletosQuebradosValor = useMemo(() => {
    const rows = quebradosQuery.data ?? [];
    return rows
      .filter((r) => Number(r.valor_quebrados || 0) > 0)
      .sort((a, b) => Number(b.valor_quebrados || 0) - Number(a.valor_quebrados || 0))
      .slice(0, 8)
      .map((r) => ({ nome: r.portfolio_name, valor: Number(r.valor_quebrados || 0) }));
  }, [quebradosQuery.data]);

  const totalQuebrados = useMemo(
    () => (quebradosQuery.data ?? []).reduce((s, r) => s + Number(r.qtd_quebrados || 0), 0),
    [quebradosQuery.data],
  );

  const kpis = useMemo(
    () => efResumoToKpis(resumoData?.kpis, resumoData?.worst_day ?? null),
    [resumoData],
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
      .filter((r) => Number(r.valor_excecoes || 0) > 0)
      .sort((a, b) => Number(b.valor_excecoes || 0) - Number(a.valor_excecoes || 0))
      .slice(0, 8)
      .map((r) => ({ nome: r.portfolio_name, valor: Number(r.valor_excecoes || 0) }));
  }, [excecoesQ.data]);

  const portfolioRejeitados = useMemo(() => {
    const rows = rejeitadosQ.data?.data ?? [];
    return rows
      .filter((r) => Number(r.valor_rejeitados || 0) > 0)
      .sort((a, b) => Number(b.valor_rejeitados || 0) - Number(a.valor_rejeitados || 0))
      .slice(0, 8)
      .map((r) => ({ nome: r.portfolio_name, valor: Number(r.valor_rejeitados || 0) }));
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
    boletosQuebradosValor,
    totalQuebrados,
    loadingPortfolio,
    loadingRanking,
    loadingQuebrados,
  };
}