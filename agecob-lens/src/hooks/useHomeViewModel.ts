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
  fetchPortfolioRollup,
} from "@/services/api";
import {
  deriveAcordosPorPortfolio,
  deriveExcecoesPorPortfolio,
  derivePrimeiraParcelaPorPortfolio,
  deriveQuebradosPorPortfolio,
  deriveRejeitadosPorPortfolio,
} from "@/lib/portfolioRollup";
import type { BenchmarkData } from "@/services/api";
import {
  aggregateTotals,
  calcConversao,
  calcCpc,
  calcEfetividadeCaixa,
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

  // previous equal-length window for period-over-period baselines.
  // Escalonado atrás de !loading (mesmo padrão dos benchmarks abaixo): produtividade-hoje
  // é a query mais cara da página e roda com MAXDOP 0. Disparar as 4 (2 bancos × período
  // atual/anterior) juntas fazia cada uma passar de ~1,1s para ~4,3s brigando pelo mesmo
  // SQL Server, e prendia 4 dos 6 sockets HTTP/1.1 do browser, serializando o resto da
  // página. O período anterior só alimenta os badges de baseline — chega depois.
  const prev = useMemo(() => previousPeriod(dateFrom, dateTo), [dateFrom, dateTo]);
  const { rows: prevRows } = useProdutividadeData(
    selectedDatabase,
    { dateFrom: prev.from, dateTo: prev.to },
    !loading,
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

  const { data: ppDiaPrevEnv } = useQuery({
    queryKey: ["home", "primeira-parcela-dia", selectedDatabase, prev.from, prev.to] as const,
    queryFn: () => fetchPrimeiraParcelaDia(selectedDatabase, undefined, prev.from, prev.to),
    enabled: !loading,
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
  // Deferidos até os KPIs principais carregarem (!loading): são consulta pesada
  // (lookback de 3 meses) e só alimentam baselines secundários. Adiar libera slots
  // de conexão (browser HTTP/1.1 ~6 por origem + pool DB) para os endpoints de KPI
  // chegarem antes; benchmarks carregam depois, com folga.
  // refetchInterval: false anula o poll global de 120s do QueryClient — ele ignora
  // staleTime, então re-rodava estas duas queries (p50 9,5s e 5,0s em produção, pico
  // 27s) a cada 2 min por aba aberta. Cada poll segurava 2 dos 6 sockets HTTP/1.1 do
  // browser durante toda a execução, e a troca de data que caía nessa janela ficava
  // presa atrás deles. Lookback de 3 meses muda 1x/dia: staleTime de 1h é a cadência.
  const { data: benchAutosEnv } = useQuery({
    queryKey: ["benchmarks", "COBwebRCBAUTOS"] as const,
    queryFn: () => fetchBenchmarks("COBwebRCBAUTOS"),
    staleTime: 3_600_000,
    refetchInterval: false,
    enabled: !loading,
  });
  const { data: benchConsumerEnv } = useQuery({
    queryKey: ["benchmarks", "COBwebRCBCONSUMER"] as const,
    queryFn: () => fetchBenchmarks("COBwebRCBCONSUMER"),
    staleTime: 3_600_000,
    refetchInterval: false,
    enabled: !loading,
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
  // Usa totals (mesma fonte de `rows`/resto do KPI strip) direto — evita o caso em
  // que primeiraParcelaDia?.total_valor volta 0 (query separada, sem corrida com
  // `rows`) e `??` aceita esse 0 como valor válido, zerando o índice mesmo com
  // acordo/parcela reais no período.
  const ppValorEmitida = totals.valor_primeira_parcela;
  const ppValorRecebida = totals.valor_primeira_parcela_recebida;
  const ppValorEmitidaPrev = prevTotals.valor_primeira_parcela;
  const ppValorRecebidaPrev = prevTotals.valor_primeira_parcela_recebida;
  const indiceConversaoCaixa = useMemo(() =>
    calcEfetividadeCaixa({ valor_primeira_parcela: ppValorEmitida, valor_p1_recebido: ppValorRecebida }),
  [ppValorEmitida, ppValorRecebida]);
  const indiceConversaoCaixaPrev = useMemo(() =>
    calcEfetividadeCaixa({ valor_primeira_parcela: ppValorEmitidaPrev, valor_p1_recebido: ppValorRecebidaPrev }),
  [ppValorEmitidaPrev, ppValorRecebidaPrev]);

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
      { label: "Conversão %", value: conv, unit: "percent" as const, baseline: mkBench(conv, bench?.taxa_conversao?.mean, "up"), base: { num: totals.qtd_acordos, den: totals.qtd_contatos, noun: "CPC" } },
      { label: "Rejeitados", value: totals.qtd_rejeitados, unit: "count" as const, baseline: mk(totals.qtd_rejeitados, prevTotals.qtd_rejeitados, "down"), caption: "acordos rejeitados" },
      { label: "Exceções", value: totals.qtd_excecoes, unit: "count" as const, baseline: mk(totals.qtd_excecoes, prevTotals.qtd_excecoes, "down"), caption: "acordos em exceção" },
      // Grão de contrato (1 por dívida do acordo), decisão de gestão 2026-08-12: o
      // acordo que agrupa N dívidas conta N. Só aqui — ticket médio e Conversão %
      // seguem em totals.qtd_acordos (grão do acordo).
      { label: "Qtd Acordos", value: totals.qtd_acordos_por_contrato, unit: "count" as const, caption: `por contrato · ${diasUteisPeriodo} dias úteis` },
      { label: "Gap de Performance", value: gapDePerformance, unit: "BRL" as const, caption: "Top agente vs piso da equipe" },
      { label: "Qtd Acionamentos", value: totals.qtd_acionamentos, unit: "count" as const, baseline: mk(totals.qtd_acionamentos, prevTotals.qtd_acionamentos, "up") },
    ];
  }, [totals, prevTotals, diasUteisPeriodo, gapDePerformance, periodLabel, indiceConversaoCaixa, indiceConversaoCaixaPrev, bench, ppValorRecebida, ppValorEmitida]);

  // Insight — insight1 (primário) + insight2 (categoria distinta) num card só:
  // insight2 vira secondaryMetric ao lado do número primário, mesma descrição.
  const readout = useMemo(() => generateDailyReadout(rows, projecaoMes), [rows, projecaoMes]);
  const insight = useMemo(() => {
    if (readout.empty) return { variant: "neutral" as const };
    const primary = readout.insight1 ?? readout.insight2;
    if (!primary) return { variant: "neutral" as const };
    const cta = readout.action?.headline ? { label: readout.action.headline, anchor: readout.action.anchor } : undefined;
    if (primary.severity === "positive") {
      return {
        variant: "positive" as const,
        metric: primary.headline ? { value: primary.headline, label: primary.label ?? "" } : undefined,
        description: primary.text,
        cta,
      };
    }
    const secondary = readout.insight1 && readout.insight2 ? readout.insight2 : undefined;
    return {
      variant: "critical" as const,
      metric: primary.headline ? { value: primary.headline, label: primary.label ?? "" } : undefined,
      secondaryMetric: secondary?.headline ? { value: secondary.headline, label: secondary.label ?? "" } : undefined,
      description: primary.text,
      cta,
    };
  }, [readout]);

  // Charts
  const financeiroData = useMemo(() => selectFinanceiroHandoffData(rows), [rows]);
  const eficienciaData = useMemo(() => selectEficienciaHandoffData(rows), [rows]);
  const cpcAvg = useMemo(() => calcCpc(totals), [totals]);
  const convAvg = useMemo(() => calcConversao(totals), [totals]);
  const funnelData = useMemo(() => selectFunnelData(rows), [rows]);

  // Portfolio / ranking sub-queries.
  // Os 5 endpoints por-portfólio (acordos, 1ª parcela, exceções, rejeitados, quebrados)
  // viraram 1 chamada a /dashboard/portfolio-rollup — mesmo scan de REC_MASTER, agora
  // agrupado também por ID_REC_STATUS, fatiado no cliente por lib/portfolioRollup.ts.
  // Paridade 100% verificada contra os 5 builders legados em 3 bancos × 4 janelas
  // (scripts/parity_portfolio_rollup.py). Motivo é contenção, não o custo isolado de
  // cada query: 5 requests ocupavam 5 dos 6 sockets HTTP/1.1 e 5 conexões do pool na
  // mesma janela em que produtividade-hoje (a query mais cara) precisa rodar.
  const [qPpAgente, qRollup] = useQueries({
    queries: [
      { queryKey: ["home", "primeira-parcela-por-agente", selectedDatabase, dateFrom, dateTo] as const, queryFn: () => fetchPrimeiraParcelaPorAgente(selectedDatabase, undefined, dateFrom, dateTo) },
      { queryKey: ["home", "portfolio-rollup", selectedDatabase, dateFrom, dateTo] as const, queryFn: () => fetchPortfolioRollup(selectedDatabase, dateFrom, dateTo) },
    ],
  });

  const rollupRows = useMemo(() => qRollup.data?.data ?? [], [qRollup.data]);
  const acordosPortRows = useMemo(() => deriveAcordosPorPortfolio(rollupRows), [rollupRows]);
  const excecoesPortRows = useMemo(() => deriveExcecoesPorPortfolio(rollupRows), [rollupRows]);
  const rejeitadosPortRows = useMemo(() => deriveRejeitadosPorPortfolio(rollupRows), [rollupRows]);
  const quebradosPortRows = useMemo(() => deriveQuebradosPorPortfolio(rollupRows), [rollupRows]);

  const top10PrimeiraParcela = useMemo(() => selectTopAgentesPorPrimeiraParcela(qPpAgente.data?.data ?? []), [qPpAgente.data]);
  const portfolio1aParcela = useMemo(() => selectTopPortfolioPorValor(acordosPortRows), [acordosPortRows]);
  const excecoesPorPortfolio = useMemo(() => selectTopPortfolioPorExcecoes(excecoesPortRows), [excecoesPortRows]);
  const rejeitadosPorPortfolio = useMemo(() => selectTopPortfolioPorRejeitados(rejeitadosPortRows), [rejeitadosPortRows]);
  const quebradosPorPortfolio = useMemo(() => selectTopPortfolioPorQuebrados(quebradosPortRows), [quebradosPortRows]);
  const excecoesPorPortfolioValor = useMemo(() => selectTopPortfolioPorExcecoesValor(excecoesPortRows), [excecoesPortRows]);
  const rejeitadosPorPortfolioValor = useMemo(() => selectTopPortfolioPorRejeitadosValor(rejeitadosPortRows), [rejeitadosPortRows]);

  // Portfolio 1ª parcela (rentabilidade + risco) — mesmo rollup, slice de gerados.
  const loadingPpPortfolio = qRollup.isLoading;
  const ppPortfolioRows = useMemo(() => derivePrimeiraParcelaPorPortfolio(rollupRows), [rollupRows]);

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
    const rawExcecoes = excecoesPortRows;
    const rawQuebrados = quebradosPortRows;
    const rawRejeitados = rejeitadosPortRows;
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
  }, [excecoesPortRows, quebradosPortRows, rejeitadosPortRows]);

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
    loadingAcdPort: qRollup.isLoading,
    loadingExcPort: qRollup.isLoading,
    loadingRejPort: qRollup.isLoading,
    loadingQbrPort: qRollup.isLoading,
    ppPortfolioRows,
    portfolioRiskMap,
    loadingPpPortfolio,
    benchByBu,
  };
}