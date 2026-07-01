/**
 * Home ViewModel hook — composes useProdutividadeData + selectors + queries
 * into a single HomeViewModel shape consumed by Index.tsx.
 */

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { useProdutividadeData } from "@/hooks/useProdutividadeData";
import {
  fetchBenchmarks,
  fetchPrimeiraParcelaDia,
  fetchPrimeiraParcelaPorAgente,
  fetchPrimeiraParcelaPorPortfolio,
  fetchAcordosPorPortfolio,
  fetchExcecoesPorPortfolio,
  fetchRejeitadosPorPortfolio,
  fetchQuebradosPorPortfolio,
} from "@/services/api";
import type { BenchmarkData } from "@/services/api";
import {
  aggregateTotals,
  calcConversao,
  calcCpc,
  calcTicketMedio,
} from "@/lib/metrics";
import { generateDailyReadout } from "@/lib/insightEngine";
import { countBusinessDays, firstOfMonthStr, lastOfMonthStr, previousPeriod, todayStr } from "@/lib/dates";
import {
  selectEficienciaHandoffData,
  selectFinanceiroHandoffData,
  selectFunnelData,
  selectGapDePerformance,
  selectPeriodDelta,
  selectTopAgentesPorPrimeiraParcela,
  selectTopPortfolioPorExcecoes,
  selectTopPortfolioPorRejeitados,
  selectTopPortfolioPorExcecoesValor,
  selectTopPortfolioPorRejeitadosValor,
  selectTopPortfolioPorQuebrados,
  selectTopPortfolioPorValor,
} from "@/selectors/homeSelectors";
import type { HomeViewModel, PortfolioRiskEntry } from "@/types/viewModels";

export function useHomeViewModel(): HomeViewModel {
  const { selectedDatabase, dateFrom, dateTo } = useGlobalFilters();
  const { rows, loading, error: loadError, warnings, refresh } = useProdutividadeData(
    selectedDatabase,
    { dateFrom, dateTo },
  );

  // previous equal-length window for period-over-period baselines
  const prev = useMemo(() => previousPeriod(dateFrom, dateTo), [dateFrom, dateTo]);
  const { rows: prevRows } = useProdutividadeData(selectedDatabase, {
    dateFrom: prev.from,
    dateTo: prev.to,
  });

  // primeiraParcela queries (ex-useState)
  const { data: ppDiaEnv } = useQuery({
    queryKey: ["home", "primeira-parcela-dia", selectedDatabase, dateFrom, dateTo] as const,
    queryFn: () => fetchPrimeiraParcelaDia(selectedDatabase, undefined, dateFrom, dateTo),
  });
  const primeiraParcelaDia = useMemo(() => {
    const row = ppDiaEnv?.data?.[0];
    if (!row) return null;
    return { total_valor: Number(row.total_valor) || 0, total_acordos: Number(row.total_acordos) || 0 };
  }, [ppDiaEnv]);

  const { data: ppDiaPrevEnv } = useQuery({
    queryKey: ["home", "primeira-parcela-dia", selectedDatabase, prev.from, prev.to] as const,
    queryFn: () => fetchPrimeiraParcelaDia(selectedDatabase, undefined, prev.from, prev.to),
  });
  const primeiraParcelaDiaPrev = useMemo(() => {
    const row = ppDiaPrevEnv?.data?.[0];
    return row ? Number(row.total_valor) || 0 : null;
  }, [ppDiaPrevEnv]);

  const { data: ppMesEnv } = useQuery({
    queryKey: ["home", "primeira-parcela-mes", selectedDatabase] as const,
    queryFn: () => fetchPrimeiraParcelaDia(selectedDatabase, undefined, firstOfMonthStr(), todayStr()),
  });
  const primeiraParcelaMes = useMemo(() => {
    const row = ppMesEnv?.data?.[0];
    return row ? Number(row.total_valor) || 0 : null;
  }, [ppMesEnv]);

  // Internal benchmarks (top-10 historical mean) — per bank, long cache.
  const { data: benchAutosEnv } = useQuery({
    queryKey: ["benchmarks", "COBwebRCBAUTOS"] as const,
    queryFn: () => fetchBenchmarks("COBwebRCBAUTOS"),
    staleTime: 3_600_000,
  });
  const { data: benchConsumerEnv } = useQuery({
    queryKey: ["benchmarks", "COBwebRCBCONSUMER"] as const,
    queryFn: () => fetchBenchmarks("COBwebRCBCONSUMER"),
    staleTime: 3_600_000,
  });
  const bench = useMemo(() => {
    const benchAutos = benchAutosEnv?.data as BenchmarkData | undefined;
    const benchConsumer = benchConsumerEnv?.data as BenchmarkData | undefined;
    interface BenchMetric { top10: number | null; mean: number | null }
    const pickBench = (b?: BenchmarkData): Record<string, BenchMetric> | undefined => {
      if (!b) return undefined;
      const pick = (q?: { top10_mean?: number | null; mean?: number | null }): BenchMetric => ({
        top10: q?.top10_mean ?? null,
        mean: q?.mean ?? null,
      });
      return {
        taxa_contato: pick(b.taxa_contato),
        taxa_conversao: pick(b.taxa_conversao),
        efetividade_caixa: pick(b.efetividade_caixa),
        pct_excecoes: pick(b.pct_excecoes),
      };
    };
    if (selectedDatabase === "COBwebRCBAUTOS") return pickBench(benchAutos);
    if (selectedDatabase === "COBwebRCBCONSUMER") return pickBench(benchConsumer);
    if (!benchAutos || !benchConsumer) return undefined;
    const avg = (a: number | null, b: number | null) =>
      a != null && b != null ? (a + b) / 2 : a ?? b ?? null;
    const avgMetric = (qA?: { top10_mean?: number | null; mean?: number | null }, qB?: { top10_mean?: number | null; mean?: number | null }): BenchMetric => ({
      top10: avg(qA?.top10_mean ?? null, qB?.top10_mean ?? null),
      mean: avg(qA?.mean ?? null, qB?.mean ?? null),
    });
    return {
      taxa_contato: avgMetric(benchAutos.taxa_contato, benchConsumer.taxa_contato),
      taxa_conversao: avgMetric(benchAutos.taxa_conversao, benchConsumer.taxa_conversao),
      efetividade_caixa: avgMetric(benchAutos.efetividade_caixa, benchConsumer.efetividade_caixa),
      pct_excecoes: avgMetric(benchAutos.pct_excecoes, benchConsumer.pct_excecoes),
    };
  }, [selectedDatabase, benchAutosEnv, benchConsumerEnv]);

  // Derived totals
  const totals = useMemo(() => aggregateTotals(rows), [rows]);
  const prevTotals = useMemo(() => aggregateTotals(prevRows), [prevRows]);
  const periodLabel = dateFrom === dateTo ? "dia útil ant." : "período anterior";
  const diasUteisPeriodo = useMemo(() => countBusinessDays(dateFrom, dateTo), [dateFrom, dateTo]);
  const gapDePerformance = useMemo(() => selectGapDePerformance(rows), [rows]);

  // Projecao mes
  const projecaoMes = useMemo(() => {
    if (primeiraParcelaMes == null || primeiraParcelaMes <= 0) return undefined;
    const monthStart = firstOfMonthStr();
    const monthEnd = lastOfMonthStr();
    const today = todayStr();
    const diasDecorridos = countBusinessDays(monthStart, today);
    const diasTotais = countBusinessDays(monthStart, monthEnd);
    if (diasDecorridos <= 0) return undefined;
    return (primeiraParcelaMes / diasDecorridos) * diasTotais;
  }, [primeiraParcelaMes]);

  // KPI primaries
  const kpiPrimary = useMemo(() => {
    const ppValor = primeiraParcelaDia?.total_valor ?? totals.valor_primeira_parcela;
    const ppValorPrev = primeiraParcelaDiaPrev ?? prevTotals.valor_primeira_parcela;
    const dAcordos = selectPeriodDelta(totals.valor_acordos, prevTotals.valor_acordos);
    const dPp = selectPeriodDelta(ppValor, ppValorPrev);
    return [
      {
        label: "Valor de Acordos",
        value: totals.valor_acordos,
        unit: "BRL" as const,
        baseline: dAcordos != null
          ? { value: dAcordos, label: periodLabel, betterWhen: "up" as const, baselineValue: prevTotals.valor_acordos }
          : undefined,
      },
      {
        label: "1ª Parcela",
        value: ppValor,
        unit: "BRL" as const,
        baseline: dPp != null
          ? { value: dPp, label: periodLabel, betterWhen: "up" as const, baselineValue: ppValorPrev }
          : undefined,
      },
    ];
  }, [totals, prevTotals, primeiraParcelaDia, primeiraParcelaDiaPrev, periodLabel]);

  // Cash conversion index: 1ª Parcela Recebida (VR_PAGO) / 1ª Parcela Emitida (VALOR) * 100
  const ppValorEmitida = primeiraParcelaDia?.total_valor ?? totals.valor_primeira_parcela;
  const ppValorRecebida = totals.valor_primeira_parcela_recebida;
  const ppValorEmitidaPrev = primeiraParcelaDiaPrev ?? prevTotals.valor_primeira_parcela;
  const ppValorRecebidaPrev = prevTotals.valor_primeira_parcela_recebida;
  const indiceConversaoCaixa = useMemo(() =>
    ppValorEmitida > 0 ? (ppValorRecebida * 100) / ppValorEmitida : null,
  [totals.valor_primeira_parcela_recebida, ppValorEmitida]);
  const indiceConversaoCaixaPrev = useMemo(() =>
    ppValorEmitidaPrev > 0 ? (ppValorRecebidaPrev * 100) / ppValorEmitidaPrev : null,
  [prevTotals.valor_primeira_parcela_recebida, ppValorEmitidaPrev]);

  // KPI secondaries
  const kpiSecondary = useMemo(() => {
    const conv = calcConversao(totals);
    const mk = (value: number, prevValue: number, betterWhen: "up" | "down") => {
      const d = selectPeriodDelta(value, prevValue);
      return d != null ? { value: d, label: periodLabel, betterWhen } : undefined;
    };
    // Conversão (pagos/CPC) tende a ser baixa no grão diário (boletos de hoje ainda
    // não foram pagos); comparar período-a-período não faz sentido. Baseline vs benchmark.
    const mkBench = (value: number, mean: number | null | undefined, betterWhen: "up" | "down") => {
      if (mean == null || mean <= 0) return undefined;
      return { value: (value - mean) / mean, label: "média do escritório", betterWhen, baselineValue: mean };
    };
    const bm = (b?: { top10: number | null; mean: number | null }) => {
      const result: { value: number; label: string }[] = [];
      if (b?.mean != null) result.push({ value: b.mean, label: "Média do escritório" });
      return result.length ? result : undefined;
    };
    return [
      { label: "Efetividade de Caixa", value: indiceConversaoCaixa ?? 0, unit: "percent" as const, baseline: mk(indiceConversaoCaixa ?? 0, indiceConversaoCaixaPrev ?? 0, "up"), benchmarks: bm(bench?.efetividade_caixa), base: { num: ppValorRecebida, den: ppValorEmitida, noun: "1ª parcela", unit: "value" } },
      { label: "CPC", value: totals.qtd_contatos, unit: "count" as const, baseline: mk(totals.qtd_contatos, prevTotals.qtd_contatos, "up"), base: { num: totals.qtd_contatos, den: totals.qtd_alo, noun: "alôs" } },
      { label: "Conversão %", value: conv, unit: "percent" as const, baseline: mkBench(conv, bench?.taxa_conversao?.mean, "up"), base: { num: totals.qtd_boletos_pagos, den: totals.qtd_contatos, noun: "CPC" } },
      { label: "Rejeitados", value: totals.qtd_rejeitados, unit: "count" as const, baseline: mk(totals.qtd_rejeitados, prevTotals.qtd_rejeitados, "down"), caption: "acordos rejeitados" },
      { label: "Exceções", value: totals.qtd_excecoes, unit: "count" as const, baseline: mk(totals.qtd_excecoes, prevTotals.qtd_excecoes, "down"), caption: "acordos em exceção" },
      { label: "Qtd Acordos", value: totals.qtd_acordos, unit: "count" as const, caption: `${diasUteisPeriodo} dias úteis` },
      { label: "Gap de Performance", value: gapDePerformance, unit: "BRL" as const, caption: "Top agente vs piso da equipe" },
      { label: "Qtd Acionamentos", value: totals.qtd_acionamentos, unit: "count" as const, baseline: mk(totals.qtd_acionamentos, prevTotals.qtd_acionamentos, "up") },
    ];
  }, [totals, prevTotals, diasUteisPeriodo, gapDePerformance, periodLabel, indiceConversaoCaixa, indiceConversaoCaixaPrev, bench, ppValorRecebida, ppValorEmitida]);

  // Insight
  const readout = useMemo(() => generateDailyReadout(rows, projecaoMes), [rows, projecaoMes]);
  const insight = useMemo(() => {
    if (readout.empty) return { variant: "neutral" as const };
    const slot = readout.insight1 ?? readout.insight2;
    if (!slot) return { variant: "neutral" as const };
    const variant = slot.severity === "positive" ? "positive" as const : "critical" as const;
    return {
      variant,
      metric: slot.headline ? { value: slot.headline, label: "" } : undefined,
      description: slot.text,
      cta: readout.action ? { label: readout.action.headline ?? readout.action.text } : undefined,
    };
  }, [readout]);

  // Charts
  const financeiroData = useMemo(() => selectFinanceiroHandoffData(rows), [rows]);
  const eficienciaData = useMemo(() => selectEficienciaHandoffData(rows), [rows]);
  const cpcAvg = useMemo(() => calcCpc(totals), [totals]);
  const convAvg = useMemo(() => calcConversao(totals), [totals]);
  const funnelData = useMemo(() => selectFunnelData(rows), [rows]);

  // Portfolio / ranking sub-queries
  const [qPpAgente, qAcdPort, qExcPort, qRejPort, qQbrPort] = useQueries({
    queries: [
      { queryKey: ["home", "primeira-parcela-por-agente", selectedDatabase, dateFrom, dateTo] as const, queryFn: () => fetchPrimeiraParcelaPorAgente(selectedDatabase, undefined, dateFrom, dateTo) },
      { queryKey: ["home", "acordos-por-portfolio", selectedDatabase, dateFrom, dateTo] as const, queryFn: () => fetchAcordosPorPortfolio(selectedDatabase, dateFrom, dateTo) },
      { queryKey: ["home", "excecoes-por-portfolio", selectedDatabase, dateFrom, dateTo] as const, queryFn: () => fetchExcecoesPorPortfolio(selectedDatabase, dateFrom, dateTo) },
      { queryKey: ["home", "rejeitados-por-portfolio", selectedDatabase, dateFrom, dateTo] as const, queryFn: () => fetchRejeitadosPorPortfolio(selectedDatabase, dateFrom, dateTo) },
      { queryKey: ["home", "quebrados-por-portfolio", selectedDatabase, dateFrom, dateTo] as const, queryFn: () => fetchQuebradosPorPortfolio(selectedDatabase, dateFrom, dateTo) },
    ],
  });

  const top10PrimeiraParcela = useMemo(() => selectTopAgentesPorPrimeiraParcela(qPpAgente.data?.data ?? []), [qPpAgente.data]);
  const portfolio1aParcela = useMemo(() => selectTopPortfolioPorValor(qAcdPort.data?.data ?? []), [qAcdPort.data]);
  const excecoesPorPortfolio = useMemo(() => selectTopPortfolioPorExcecoes(qExcPort.data?.data ?? []), [qExcPort.data]);
  const rejeitadosPorPortfolio = useMemo(() => selectTopPortfolioPorRejeitados(qRejPort.data?.data ?? []), [qRejPort.data]);
  const quebradosPorPortfolio = useMemo(() => selectTopPortfolioPorQuebrados(qQbrPort.data?.data ?? []), [qQbrPort.data]);
  const excecoesPorPortfolioValor = useMemo(() => selectTopPortfolioPorExcecoesValor(qExcPort.data?.data ?? []), [qExcPort.data]);
  const rejeitadosPorPortfolioValor = useMemo(() => selectTopPortfolioPorRejeitadosValor(qRejPort.data?.data ?? []), [qRejPort.data]);

  // Portfolio 1ª parcela (rentabilidade + risco)
  const { data: ppPortfolioEnv, isLoading: loadingPpPortfolio } = useQuery({
    queryKey: ["home", "primeira-parcela-por-portfolio", selectedDatabase, dateFrom, dateTo] as const,
    queryFn: () => fetchPrimeiraParcelaPorPortfolio(selectedDatabase, dateFrom, dateTo),
  });
  const ppPortfolioRows = ppPortfolioEnv?.data ?? [];

  // Per-BU benchmark map for diagnostic cards
  const benchByBu = useMemo(() => {
    const map = new Map<string, { cpc: number | null; conversao: number | null }>();
    const autosB = benchAutosEnv?.data as BenchmarkData | undefined;
    const consumerB = benchConsumerEnv?.data as BenchmarkData | undefined;
    map.set("AUTOS", {
      cpc: autosB?.taxa_contato?.top10_mean ?? null,
      conversao: autosB?.taxa_conversao?.top10_mean ?? null,
    });
    map.set("CONSUMER", {
      cpc: consumerB?.taxa_contato?.top10_mean ?? null,
      conversao: consumerB?.taxa_conversao?.top10_mean ?? null,
    });
    return map;
  }, [benchAutosEnv, benchConsumerEnv]);

  // Risk map: portfolio_name → { excecoes, quebrados, rejeitados }
  const portfolioRiskMap = useMemo(() => {
    const map = new Map<string, PortfolioRiskEntry>();
    const rawExcecoes = qExcPort.data?.data ?? [];
    const rawQuebrados = qQbrPort.data?.data ?? [];
    const rawRejeitados = qRejPort.data?.data ?? [];
    for (const row of rawExcecoes) {
      const entry = map.get(row.portfolio_name) ?? { excecoes: 0, quebrados: 0, rejeitados: 0 };
      entry.excecoes = Number(row.valor_excecoes || 0);
      map.set(row.portfolio_name, entry);
    }
    for (const row of rawQuebrados) {
      const entry = map.get(row.portfolio_name) ?? { excecoes: 0, quebrados: 0, rejeitados: 0 };
      entry.quebrados = Number(row.valor_quebrados || 0);
      map.set(row.portfolio_name, entry);
    }
    for (const row of rawRejeitados) {
      const entry = map.get(row.portfolio_name) ?? { excecoes: 0, quebrados: 0, rejeitados: 0 };
      entry.rejeitados = Number(row.valor_rejeitados || 0);
      map.set(row.portfolio_name, entry);
    }
    return map;
  }, [qExcPort.data, qQbrPort.data, qRejPort.data]);

  return {
    loading,
    error: loadError,
    warnings,
    refresh,
    kpiPrimary,
    kpiSecondary,
    indiceConversaoCaixa,
    insight,
    financeiroData,
    eficienciaData,
    funnelData,
    cpcAvg,
    convAvg,
    produtividadeRows: rows,
    top10PrimeiraParcela,
    portfolio1aParcela,
    excecoesPorPortfolio,
    rejeitadosPorPortfolio,
    excecoesPorPortfolioValor,
    rejeitadosPorPortfolioValor,
    quebradosPorPortfolio,
    loadingPpAgente: qPpAgente.isLoading,
    loadingAcdPort: qAcdPort.isLoading,
    loadingExcPort: qExcPort.isLoading,
    loadingRejPort: qRejPort.isLoading,
    loadingQbrPort: qQbrPort.isLoading,
    ppPortfolioRows,
    portfolioRiskMap,
    loadingPpPortfolio,
    benchByBu,
  };
}