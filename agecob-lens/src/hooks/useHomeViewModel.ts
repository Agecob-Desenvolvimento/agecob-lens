/**
 * Home ViewModel hook — composes useProdutividadeData + selectors + queries
 * into a single HomeViewModel shape consumed by Index.tsx.
 */

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { useProdutividadeData } from "@/hooks/useProdutividadeData";
import {
  fetchPrimeiraParcelaDia,
  fetchPrimeiraParcelaPorAgente,
  fetchAcordosPorPortfolio,
  fetchExcecoesPorPortfolio,
  fetchRejeitadosPorPortfolio,
} from "@/services/api";
import {
  aggregateTotals,
  calcConversao,
  calcCpc,
  calcTicketMedio,
} from "@/lib/metrics";
import { generateDailyReadout } from "@/lib/insightEngine";
import { firstOfMonthStr, lastOfMonthStr, todayStr } from "@/lib/dates";
import {
  selectEficienciaHandoffData,
  selectFinanceiroHandoffData,
  selectGapDePerformance,
  selectTopAgentesPorPrimeiraParcela,
  selectTopPortfolioPorExcecoes,
  selectTopPortfolioPorRejeitados,
  selectTopPortfolioPorValor,
} from "@/selectors/homeSelectors";
import type { HomeViewModel } from "@/types/viewModels";

function countBusinessDays(fromIso: string, toIso: string): number {
  const start = new Date(`${fromIso}T00:00:00`);
  const end = new Date(`${toIso}T00:00:00`);
  let n = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

export function useHomeViewModel(): HomeViewModel {
  const { selectedDatabase, dateFrom, dateTo } = useGlobalFilters();
  const { rows, loading, error: loadError, warnings, refresh } = useProdutividadeData(
    selectedDatabase,
    { dateFrom, dateTo },
  );

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

  const { data: ppMesEnv } = useQuery({
    queryKey: ["home", "primeira-parcela-mes", selectedDatabase] as const,
    queryFn: () => fetchPrimeiraParcelaDia(selectedDatabase, undefined, firstOfMonthStr(), todayStr()),
  });
  const primeiraParcelaMes = useMemo(() => {
    const row = ppMesEnv?.data?.[0];
    return row ? Number(row.total_valor) || 0 : null;
  }, [ppMesEnv]);

  // Derived totals
  const totals = useMemo(() => aggregateTotals(rows), [rows]);
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
  const kpiPrimary = useMemo(() => [
    { label: "Valor de Acordos", value: totals.valor_acordos, unit: "BRL" as const },
    {
      label: "1ª Parcela",
      value: primeiraParcelaDia?.total_valor ?? totals.valor_primeira_parcela,
      unit: "BRL" as const,
    },
  ], [totals, primeiraParcelaDia]);

  // KPI secondaries
  const kpiSecondary = useMemo(() => {
    const cpc = calcCpc(totals);
    const conv = calcConversao(totals);
    const ticket = calcTicketMedio(totals);
    const excecoesPct = totals.valor_acordos > 0 ? (totals.valor_excecoes * 100) / totals.valor_acordos : 0;
    return [
      { label: "CPC %", value: cpc, unit: "percent" as const },
      { label: "Conversão %", value: conv, unit: "percent" as const },
      { label: "Ticket Médio", value: ticket, unit: "BRL" as const },
      { label: "Exceções %", value: excecoesPct, unit: "percent" as const },
      { label: "Qtd Acordos", value: totals.qtd_acordos, unit: "count" as const, baseline: { value: 0, label: `${diasUteisPeriodo} dias úteis`, betterWhen: "flat" as const } },
      { label: "Gap de Performance", value: gapDePerformance, unit: "BRL" as const, baseline: { value: 0, label: "Top agente vs piso da equipe", betterWhen: "flat" as const } },
      { label: "Qtd Acionamentos", value: totals.qtd_acionamentos, unit: "count" as const },
    ];
  }, [totals, diasUteisPeriodo, gapDePerformance]);

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

  // Portfolio / ranking sub-queries
  const [qPpAgente, qAcdPort, qExcPort, qRejPort] = useQueries({
    queries: [
      { queryKey: ["home", "primeira-parcela-por-agente", selectedDatabase, dateFrom, dateTo] as const, queryFn: () => fetchPrimeiraParcelaPorAgente(selectedDatabase, undefined, dateFrom, dateTo) },
      { queryKey: ["home", "acordos-por-portfolio", selectedDatabase, dateFrom, dateTo] as const, queryFn: () => fetchAcordosPorPortfolio(selectedDatabase, dateFrom, dateTo) },
      { queryKey: ["home", "excecoes-por-portfolio", selectedDatabase, dateFrom, dateTo] as const, queryFn: () => fetchExcecoesPorPortfolio(selectedDatabase, dateFrom, dateTo) },
      { queryKey: ["home", "rejeitados-por-portfolio", selectedDatabase, dateFrom, dateTo] as const, queryFn: () => fetchRejeitadosPorPortfolio(selectedDatabase, dateFrom, dateTo) },
    ],
  });

  const top10PrimeiraParcela = useMemo(() => selectTopAgentesPorPrimeiraParcela(qPpAgente.data?.data ?? []), [qPpAgente.data]);
  const portfolio1aParcela = useMemo(() => selectTopPortfolioPorValor(qAcdPort.data?.data ?? []), [qAcdPort.data]);
  const excecoesPorPortfolio = useMemo(() => selectTopPortfolioPorExcecoes(qExcPort.data?.data ?? []), [qExcPort.data]);
  const rejeitadosPorPortfolio = useMemo(() => selectTopPortfolioPorRejeitados(qRejPort.data?.data ?? []), [qRejPort.data]);

  return {
    loading,
    error: loadError,
    warnings,
    refresh,
    kpiPrimary,
    kpiSecondary,
    insight,
    financeiroData,
    eficienciaData,
    cpcAvg,
    convAvg,
    top10PrimeiraParcela,
    portfolio1aParcela,
    excecoesPorPortfolio,
    rejeitadosPorPortfolio,
    loadingPpAgente: qPpAgente.isLoading,
    loadingAcdPort: qAcdPort.isLoading,
    loadingExcPort: qExcPort.isLoading,
    loadingRejPort: qRejPort.isLoading,
  };
}
