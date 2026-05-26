/**
 * Detalhamento ViewModel hook — composes useProdutividadeData + selectors
 * into a single shape consumed by DetalhamentoAgentes.tsx.
 *
 * Derives all data from real produtividade rows (no mock data).
 */

import { useMemo, useState } from "react";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { useProdutividadeData } from "@/hooks/useProdutividadeData";
import {
  aggregateTotals,
  calcCpc,
  calcConversao,
  calcTicketMedio,
  buFromSource,
} from "@/lib/metrics";
import type { ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";
import type { KpiDatum } from "@/components/detalhamento/DetalhamentoKpiStrip";
import type { FunilData } from "@/components/detalhamento/FunilConversao";
import type { BulletPanelData } from "@/components/detalhamento/BulletChartsPanel";
import type { AgentRow } from "@/components/detalhamento/PerformanceHeatmap";
import type { ScatterPoint } from "@/components/detalhamento/regressionMocks";
import type { RankingEntry } from "@/components/detalhamento/RankingPrioridade";

export interface DetalhamentoViewModel {
  loading: boolean;
  error: string | null;
  warnings: string[];
  refresh: () => Promise<void>;
  /** Agent filter */
  agentList: string[];
  selectedAgent: string | null;
  setSelectedAgent: (v: string | null) => void;
  /** KPI strip */
  kpiPrimary: KpiDatum[];
  kpiSecondary: KpiDatum[];
  /** Funil */
  funil: FunilData;
  /** Bullet metas (team aggregates) */
  metas: BulletPanelData;
  /** Heatmap */
  heatmapAgents: AgentRow[];
  /** Scatter + regression points */
  scatterPoints: ScatterPoint[];
  /** Ranking priority */
  rankingEntries: RankingEntry[];
  /** Pareto points */
  paretoPoints: Array<{ nome: string; valor: number }>;
}

function rowsToAgentList(rows: ProdutividadeRowWithSource[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  rows.forEach((r) => {
    if (!seen.has(r.NOME)) {
      seen.add(r.NOME);
      list.push(r.NOME);
    }
  });
  return list.sort();
}

function rowsToHeatmap(rows: ProdutividadeRowWithSource[]): AgentRow[] {
  return rows.map((r) => ({
    id: r.CHAVE,
    nome: r.NOME,
    mat: r.CHAVE,
    cpc: calcCpc({ qtd_contatos: r.qtd_contatos, qtd_acionamentos: r.qtd_acionamentos }),
    conversao: calcConversao({ qtd_acordos: r.qtd_acordos, qtd_acionamentos: r.qtd_acionamentos }),
    valorAcordos: Number(r.valor_acordos || 0),
    contatos: r.qtd_contatos,
    excecoesPct: Number(r.valor_excecoes && r.valor_acordos ? (r.valor_excecoes * 100) / r.valor_acordos : 0),
    primeiraParcela: Number(r.valor_primeira_parcela || 0),
  }));
}

function rowsToScatter(rows: ProdutividadeRowWithSource[]): ScatterPoint[] {
  return rows.map((r) => {
    const acionamentos = r.qtd_acionamentos;
    const contatos = r.qtd_contatos;
    const cpc = calcCpc({ qtd_contatos: contatos, qtd_acionamentos: acionamentos });
    const conv = calcConversao({ qtd_acordos: r.qtd_acordos, qtd_acionamentos: acionamentos });
    const eficiencia = Math.sqrt(cpc * conv) / 100;
    const excecoesPct = Number(r.valor_excecoes && r.valor_acordos ? (r.valor_excecoes * 100) / r.valor_acordos : 0);
    return {
      id: r.CHAVE,
      nome: r.NOME,
      eficiencia: Math.min(eficiencia, 1),
      valor: Number(r.valor_acordos || 0),
      excPct: excecoesPct,
      acordos: r.qtd_acordos,
      // ── Raw predictors for multi-variable regression ──
      acionamentos,
      contatos,
      cpc,
      conversao,
    };
  });
}

function rowsToRanking(rows: ProdutividadeRowWithSource[]): RankingEntry[] {
  return [...rows]
    .map((r, i) => {
      const cpc = calcCpc({ qtd_contatos: r.qtd_contatos, qtd_acionamentos: r.qtd_acionamentos });
      const conv = calcConversao({ qtd_acordos: r.qtd_acordos, qtd_acionamentos: r.qtd_acionamentos });
      const reprov = 0;
      const riskScore = Math.round((1 - cpc / 100) * 50 + (1 - conv / 100) * 30 + Math.min((reprov ?? 0) * 3, 20));
      return {
        id: r.CHAVE,
        nome: r.NOME,
        mat: r.CHAVE,
        cpc,
        conversao: conv,
        reprov,
        acordos: r.qtd_acordos,
        trend7d: [],
      };
    })
    .sort((a, b) => {
      const scoreA = Math.round((1 - a.cpc / 100) * 50 + (1 - a.conversao / 100) * 30);
      const scoreB = Math.round((1 - b.cpc / 100) * 50 + (1 - b.conversao / 100) * 30);
      return scoreB - scoreA;
    })
    .slice(0, 12);
}

function rowsToPareto(rows: ProdutividadeRowWithSource[]): Array<{ nome: string; valor: number }> {
  return [...rows]
    .sort((a, b) => Number(b.valor_acordos || 0) - Number(a.valor_acordos || 0))
    .map((r) => ({ nome: r.NOME, valor: Number(r.valor_acordos || 0) }));
}

export function useDetalhamentoViewModel(): DetalhamentoViewModel {
  const { selectedDatabase, dateFrom, dateTo } = useGlobalFilters();
  const { rows, loading, error: loadError, warnings, refresh } = useProdutividadeData(
    selectedDatabase,
    { dateFrom, dateTo },
  );
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const agentList = useMemo(() => rowsToAgentList(rows), [rows]);

  const totals = useMemo(() => aggregateTotals(rows), [rows]);

  // Filter rows for selected agent if one is picked
  const agentRows = useMemo(
    () => (selectedAgent ? rows.filter((r) => r.NOME === selectedAgent) : rows),
    [rows, selectedAgent],
  );
  const agentTotals = useMemo(() => aggregateTotals(agentRows), [agentRows]);

  const kpiPrimary: KpiDatum[] = useMemo(() => [
    { id: "valor_acordos", label: "Valor Acordos", value: agentTotals.valor_acordos, unit: "BRL" },
    { id: "primeira_parcela", label: "1ª Parcela", value: agentTotals.valor_primeira_parcela, unit: "BRL" },
    { id: "qtd_acordos", label: "Qtd Acordos", value: agentTotals.qtd_acordos, unit: "count" },
    { id: "ticket_medio", label: "Ticket Médio", value: calcTicketMedio(agentTotals), unit: "BRL" },
  ], [agentTotals]);

  const kpiSecondary: KpiDatum[] = useMemo(() => [
    { id: "cpc", label: "CPC %", value: calcCpc(agentTotals), unit: "%" },
    { id: "conversao", label: "Conversão %", value: calcConversao(agentTotals), unit: "%" },
    { id: "qtd_acionamentos", label: "Qtd Acionamentos", value: agentTotals.qtd_acionamentos, unit: "count" },
    { id: "qtd_contatos", label: "Qtd Contatos", value: agentTotals.qtd_contatos, unit: "count" },
    { id: "qtd_excecoes", label: "Qtd Exceções", value: 0, unit: "count" },
    { id: "excecoes_valor", label: "Exceções % (Valor)", value: agentTotals.valor_acordos > 0 ? (agentTotals.valor_excecoes * 100) / agentTotals.valor_acordos : 0, unit: "%" },
  ], [agentTotals]);

  const funil: FunilData = useMemo(() => ({
    acionamentos: agentTotals.qtd_acionamentos,
    contatos: agentTotals.qtd_contatos,
    acordos: agentTotals.qtd_acordos,
    primeiraParcela: agentTotals.valor_primeira_parcela,
    valorAcordos: agentTotals.valor_acordos,
  }), [agentTotals]);

  const teamTotals = useMemo(() => aggregateTotals(rows), [rows]);
  const metas: BulletPanelData = useMemo(() => ({
    cpc: {
      value: calcCpc(agentTotals),
      meta: Math.max(calcCpc(teamTotals) * 0.9, 10),
      ranges: { poor: 30, ok: 55, good: 80 },
      unit: "%",
    },
    conversao: {
      value: calcConversao(agentTotals),
      meta: Math.max(calcConversao(teamTotals) * 1.1, 1),
      ranges: { poor: 1.5, ok: 2.5, good: 4 },
      unit: "%",
    },
    ticket: {
      value: calcTicketMedio(agentTotals),
      meta: Math.max(calcTicketMedio(teamTotals) * 1.05, 1000),
      ranges: { poor: 3000, ok: 6000, good: 10000 },
      unit: "BRL",
    },
    excecoes: {
      value: agentTotals.valor_acordos > 0 ? (agentTotals.valor_excecoes * 100) / agentTotals.valor_acordos : 0,
      meta: 3.0,
      ranges: { poor: 6, ok: 8.5, good: 10 },
      unit: "%",
      inverted: true,
    },
  }), [agentTotals, teamTotals]);

  const heatmapAgents = useMemo(() => rowsToHeatmap(rows), [rows]);
  const scatterPoints = useMemo(() => rowsToScatter(rows), [rows]);
  const rankingEntries = useMemo(() => rowsToRanking(rows), [rows]);
  const paretoPoints = useMemo(() => rowsToPareto(rows), [rows]);

  return {
    loading,
    error: loadError,
    warnings,
    refresh,
    agentList,
    selectedAgent,
    setSelectedAgent,
    kpiPrimary,
    kpiSecondary,
    funil,
    metas,
    heatmapAgents,
    scatterPoints,
    rankingEntries,
    paretoPoints,
  };
}
