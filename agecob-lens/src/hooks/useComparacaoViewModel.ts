/**
 * Comparacao ViewModel hook — two-agent side-by-side comparison.
 * Composes useProdutividadeData + comparacaoSelectors.
 */

import { useMemo, useState } from "react";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { useProdutividadeData } from "@/hooks/useProdutividadeData";
import {
  calcCpc,
  calcConversao,
  calcTicketMedio,
  aggregateTotals,
} from "@/lib/metrics";
import {
  selectAgentRow,
  selectComparacaoTotals,
  selectRadarDimensions,
  selectTopByValorAgentName,
  type RadarDimension,
} from "@/selectors/comparacaoSelectors";
import type { RankingRow } from "@/types/executive";
import { selectTopByValor } from "@/selectors/homeSelectors";

export interface ComparacaoViewModel {
  loading: boolean;
  error: string | null;
  warnings: string[];
  refresh: () => Promise<void>;
  /** Agent selection */
  agentList: string[];
  agenteA: string | null;
  setAgenteA: (v: string | null) => void;
  agenteB: string | null;
  setAgenteB: (v: string | null) => void;
  /** KPIs per agent */
  kpisA: { label: string; value: number; unit: "BRL" | "%" | "count" }[];
  kpisB: { label: string; value: number; unit: "BRL" | "%" | "count" }[];
  /** Hero verdict */
  veredito: { variant: "critical" | "positive" | "neutral"; description: string };
  /** Radar chart */
  radarData: RadarDimension[];
  /** Top 10 ranking */
  rankingData: RankingRow[];
}

function agentKpis(totals: ReturnType<typeof aggregateTotals>) {
  return [
    { label: "Valor Acordos", value: totals.valor_acordos, unit: "BRL" as const },
    { label: "Qtd Acordos", value: totals.qtd_acordos, unit: "count" as const },
    { label: "CPC %", value: calcCpc(totals), unit: "%" as const },
    { label: "Conversão %", value: calcConversao(totals), unit: "%" as const },
    { label: "Ticket Médio", value: calcTicketMedio(totals), unit: "BRL" as const },
    { label: "Acionamentos", value: totals.qtd_acionamentos, unit: "count" as const },
  ];
}

export function useComparacaoViewModel(): ComparacaoViewModel {
  const { selectedDatabase, dateFrom, dateTo } = useGlobalFilters();
  const { rows, loading, error: loadError, warnings, refresh } = useProdutividadeData(
    selectedDatabase,
    { dateFrom, dateTo },
  );

  const agentList = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    rows.forEach((r) => { if (!seen.has(r.NOME)) { seen.add(r.NOME); list.push(r.NOME); } });
    return list.sort();
  }, [rows]);

  const defaultA = useMemo(() => selectTopByValorAgentName(rows, 0), [rows]);
  const defaultB = useMemo(() => selectTopByValorAgentName(rows, 1), [rows]);
  const [agenteA, setAgenteA] = useState<string | null>(defaultA);
  const [agenteB, setAgenteB] = useState<string | null>(defaultB);

  const rowsA = useMemo(() => (agenteA ? rows.filter((r) => r.NOME === agenteA) : []), [rows, agenteA]);
  const rowsB = useMemo(() => (agenteB ? rows.filter((r) => r.NOME === agenteB) : []), [rows, agenteB]);
  const totalsA = useMemo(() => aggregateTotals(rowsA), [rowsA]);
  const totalsB = useMemo(() => aggregateTotals(rowsB), [rowsB]);

  const kpisA = useMemo(() => agentKpis(totalsA), [totalsA]);
  const kpisB = useMemo(() => agentKpis(totalsB), [totalsB]);

  const veredito = useMemo(() => {
    if (!agenteA || !agenteB) return { variant: "neutral" as const, description: "Selecione dois agentes para comparar." };
    if (totalsA.valor_acordos === 0 && totalsB.valor_acordos === 0) return { variant: "neutral" as const, description: "Ambos sem acordos no período." };
    const deltaValor = totalsA.valor_acordos - totalsB.valor_acordos;
    const cpcA = calcCpc(totalsA);
    const cpcB = calcCpc(totalsB);
    const convA = calcConversao(totalsA);
    const convB = calcConversao(totalsB);
    const efA = cpcA + convA;
    const efB = cpcB + convB;
    const deltaEf = efA - efB;
    if (Math.abs(deltaValor) < 100 && Math.abs(deltaEf) < 1) return { variant: "neutral" as const, description: "Empate técnico — desempenho equivalente." };
    if (deltaValor > 0 && deltaEf > 0) return { variant: "positive" as const, description: `${agenteA} lidera em valor e eficiência.` };
    if (deltaValor < 0 && deltaEf < 0) return { variant: "critical" as const, description: `${agenteB} lidera em valor e eficiência.` };
    if (deltaValor > 0) return { variant: "positive" as const, description: `${agenteA} lidera em valor (${deltaValor > 0 ? "+" : ""}R$ ${Math.abs(deltaValor).toLocaleString("pt-BR")}), mas eficiência próxima.` };
    return { variant: "critical" as const, description: `${agenteB} lidera em valor, mas eficiência próxima.` };
  }, [agenteA, agenteB, totalsA, totalsB]);

  const radarData = useMemo(() => selectRadarDimensions(rowsA, rowsB, rows), [rowsA, rowsB, rows]);
  const rankingData = useMemo(() => selectTopByValor(rows, 10), [rows]);

  return {
    loading,
    error: loadError,
    warnings,
    refresh,
    agentList,
    agenteA,
    setAgenteA,
    agenteB,
    setAgenteB,
    kpisA,
    kpisB,
    veredito,
    radarData,
    rankingData,
  };
}
