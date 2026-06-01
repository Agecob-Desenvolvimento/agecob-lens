/**
 * Analise ViewModel hook — composes useProdutividadeData + analise selectors
 * into a single shape for AnaliseProdutividade.tsx.
 */

import { useMemo, useState } from "react";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { useProdutividadeData } from "@/hooks/useProdutividadeData";
import {
  aggregateTotals,
  calcCpc,
  calcConversao,
  calcTicketMedio,
} from "@/lib/metrics";
import {
  filterByBu,
  selectBuOptions,
  selectTopByCpc,
  TODOS_BU,
} from "@/selectors/analiseSelectors";
import {
  selectBuValueData,
  selectBuEfficiencyData,
} from "@/selectors/homeSelectors";
import type { ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";
import type { RankingRow } from "@/types/executive";
import type { BuValueDatum } from "@/components/executive/BuValueChart";
import type { BuEfficiencyDatum } from "@/components/executive/BuEfficiencyChart";
import type { HandoffFinanceiroDatum } from "@/components/executive/HandoffFinanceiroGroupedBar";
import type { HandoffEficienciaDatum } from "@/components/executive/HandoffEficienciaGroupedBar";

export interface AnaliseViewModel {
  loading: boolean;
  error: string | null;
  warnings: string[];
  refresh: () => Promise<void>;
  /** BU filter */
  buOptions: string[];
  selectedBu: string;
  setSelectedBu: (v: string) => void;
  filteredRows: ProdutividadeRowWithSource[];
  /** KPI values */
  kpiCpc: number;
  kpiConversao: number;
  kpiTicket: number;
  kpiAcionamentos: number;
  /** Contato = Alô (alguém atendeu, ALO=1) */
  kpiAlo: number;
  /** CPC = contato com pessoa certa (RPC) = qtd_contatos */
  kpiContatos: number;
  kpiAcordos: number;
  /** Charts */
  buValueData: BuValueDatum[];
  buEfficiencyData: BuEfficiencyDatum[];
  financeiroData: HandoffFinanceiroDatum[];
  eficienciaData: HandoffEficienciaDatum[];
  /** Rankings */
  cpcRanking: RankingRow[];
}

export function useAnaliseViewModel(): AnaliseViewModel {
  const { selectedDatabase, dateFrom, dateTo, minAcionamentos } = useGlobalFilters();
  const { rows, loading, error: loadError, warnings, refresh } = useProdutividadeData(
    selectedDatabase,
    { dateFrom, dateTo },
  );
  const buOptionsRaw = useMemo(() => selectBuOptions(rows), [rows]);
  const buOptions = useMemo(() => [TODOS_BU, ...buOptionsRaw], [buOptionsRaw]);
  const [selectedBu, setSelectedBu] = useState(TODOS_BU);

  const filteredRows = useMemo(() => filterByBu(rows, selectedBu), [rows, selectedBu]);
  const totals = useMemo(() => aggregateTotals(filteredRows), [filteredRows]);

  // razão contatos/acionamentos — alimenta o gráfico "Taxa de contato %"; não é o KPI "CPC" (que agora é contagem = kpiContatos)
  const kpiCpc = useMemo(() => calcCpc(totals), [totals]);
  const kpiConversao = useMemo(() => calcConversao(totals), [totals]);
  const kpiTicket = useMemo(() => calcTicketMedio(totals), [totals]);

  const buValueData = useMemo(() => selectBuValueData(filteredRows), [filteredRows]);
  const buEfficiencyData = useMemo(() => selectBuEfficiencyData(filteredRows), [filteredRows]);
  const financeiroData = useMemo(() => selectBuValueData(filteredRows).map((d) => ({
    bu: d.name, valorAcordos: d.valor_acordos, primeiraParcela: d.valor_primeira_parcela,
  })), [filteredRows]);
  const eficienciaData = useMemo(() => selectBuEfficiencyData(filteredRows).map((d) => ({
    bu: d.name, cpc: d.cpc, conversao: d.conversao,
  })), [filteredRows]);

  const cpcRanking = useMemo(
    () => selectTopByCpc(filteredRows, 10, minAcionamentos),
    [filteredRows, minAcionamentos],
  );

  return {
    loading,
    error: loadError,
    warnings,
    refresh,
    buOptions,
    selectedBu,
    setSelectedBu,
    filteredRows,
    kpiCpc,
    kpiConversao,
    kpiTicket,
    kpiAcionamentos: totals.qtd_acionamentos,
    kpiAlo: totals.qtd_alo,
    kpiContatos: totals.qtd_contatos,
    kpiAcordos: totals.qtd_acordos,
    buValueData,
    buEfficiencyData,
    financeiroData,
    eficienciaData,
    cpcRanking,
  };
}
