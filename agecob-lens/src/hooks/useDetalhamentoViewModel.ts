/**
 * Detalhamento ViewModel hook — composes useProdutividadeData + selectors
 * into a single shape consumed by DetalhamentoAgentes.tsx.
 *
 * Change 1: Radar integrated into Bloco 1 layout (page-level).
 * Change 2: AgentInsightCard with dynamic percentile thresholds.
 * Change 3: Selected-agent rank injected into ranking + scatter highlight.
 * Change 4: KPI deltas computed from previous period comparison.
 */

import { useMemo, useState } from "react";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { useProdutividadeData } from "@/hooks/useProdutividadeData";
import { previousPeriod } from "@/lib/dates";
import {
  aggregateTotals,
  calcCpc,
  calcConversao,
  calcTicketMedio,
  calcExcecoesPctValor,
  calcReceitaPorHora,
  calcIdadeMediaAcordos,
} from "@/lib/metrics";
import type { ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";
import type { KpiDatum } from "@/components/detalhamento/DetalhamentoKpiStrip";
import type { FunilData } from "@/components/detalhamento/FunilConversao";
import type { BulletPanelData } from "@/components/detalhamento/BulletChartsPanel";
import type { AgentRow } from "@/components/detalhamento/PerformanceHeatmap";
import type { ScatterPoint } from "@/components/detalhamento/regressionMocks";
import type { RankingEntry } from "@/components/detalhamento/RankingPrioridade";
import type { RadarDimension } from "@/components/detalhamento/RadarDesempenho";
import type { InsightCardVariant } from "@/components/executive/ExecutiveInsightCard";

/* ------------------------------------------------------------------ *
 * Public contract
 * ------------------------------------------------------------------ */

export interface AgentInsight {
  variant: InsightCardVariant;
  title: string;
  description: string;
  metric: string;
  /** KPI deltas — key = KPI id, value = fractional delta (-0.12 = -12%) */
  kpiDeltas: Record<string, number>;
  /** Selected agent's rank position in ranking (1-based; 0 if not found) */
  agentRank: number;
  totalAgents: number;
}

export interface DetalhamentoViewModel {
  loading: boolean;
  error: string | null;
  warnings: string[];
  refresh: () => Promise<void>;
  agentList: string[];
  selectedAgent: string | null;
  setSelectedAgent: (v: string | null) => void;
  kpiPrimary: KpiDatum[];
  kpiSecondary: KpiDatum[];
  funil: FunilData;
  metas: BulletPanelData;
  heatmapAgents: AgentRow[];
  scatterPoints: ScatterPoint[];
  rankingEntries: RankingEntry[];
  paretoPoints: Array<{ nome: string; valor: number }>;
  radarData: RadarDimension[];
  insight: AgentInsight;
  /** The valor_acordos comparison data (was MediaDinamica, now feeds insight) */
  valorComparison: { agentValor: number; teamMedia: number; teamMax: number; agentCount: number };
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function rowsToAgentList(rows: ProdutividadeRowWithSource[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  rows.forEach((r) => {
    if (!seen.has(r.NOME)) { seen.add(r.NOME); list.push(r.NOME); }
  });
  return list.sort();
}

function rowsToHeatmap(rows: ProdutividadeRowWithSource[]): AgentRow[] {
  return rows.map((r) => ({
    id: r.CHAVE,
    nome: r.NOME,
    mat: r.CHAVE,
    acionamentos: r.qtd_acionamentos,
    alo: r.qtd_alo,
    conversao: calcConversao({ qtd_acordos: r.qtd_acordos, qtd_contatos: r.qtd_contatos }),
    valorAcordos: Number(r.valor_acordos || 0),
    contatos: r.qtd_contatos,
    qtdAcordos: r.qtd_acordos,
    primeiraParcela: Number(r.valor_primeira_parcela || 0),
    qtdExcecoes: r.qtd_excecoes,
    valorExcecoes: Number(r.valor_excecoes || 0),
    excPrimeiraParcela: Number(r.valor_primeira_parcela_excecoes || 0),
    qtdRejeitados: r.qtd_rejeitados,
    valorRejeitados: Number(r.valor_rejeitados || 0),
    rejPrimeiraParcela: 0, // backend ainda não computa 1ª parcela de rejeitados
  }));
}

function rowsToScatter(rows: ProdutividadeRowWithSource[]): ScatterPoint[] {
  return rows.map((r) => {
    const acionamentos = r.qtd_acionamentos;
    const contatos = r.qtd_contatos;
    const cpc = calcCpc({ qtd_contatos: contatos, qtd_alo: r.qtd_alo });
    const conv = calcConversao({ qtd_acordos: r.qtd_acordos, qtd_contatos: contatos });
    const eficiencia = Math.sqrt(cpc * conv) / 100;
    const excecoesPct = Number(r.valor_excecoes && r.valor_acordos ? (r.valor_excecoes * 100) / r.valor_acordos : 0);
    return {
      id: r.CHAVE, nome: r.NOME,
      eficiencia: Math.min(eficiencia, 1),
      valor: Number(r.valor_acordos || 0),
      excPct: excecoesPct,
      acordos: r.qtd_acordos,
      acionamentos, contatos, cpc,
      conversao: conv,
    };
  });
}

function rowsToRanking(rows: ProdutividadeRowWithSource[]): RankingEntry[] {
  return [...rows]
    .map((r) => {
      const cpc = calcCpc({ qtd_contatos: r.qtd_contatos, qtd_alo: r.qtd_alo });
      const conv = calcConversao({ qtd_acordos: r.qtd_acordos, qtd_contatos: r.qtd_contatos });
      return {
        id: r.CHAVE, nome: r.NOME, mat: r.CHAVE,
        cpc, conversao: conv, reprov: 0, acordos: r.qtd_acordos, trend7d: [],
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

function buildRadarData(
  rows: ProdutividadeRowWithSource[],
  agentRows: ProdutividadeRowWithSource[],
): RadarDimension[] {
  if (rows.length === 0) return [];
  const agentTotals = aggregateTotals(agentRows);
  const agentCnt = agentRows.length || 1;

  const agentValor = (r: ProdutividadeRowWithSource) => Number(r.valor_acordos || 0);
  const agentQtd = (r: ProdutividadeRowWithSource) => r.qtd_acordos;
  const agentCpc = (r: ProdutividadeRowWithSource) =>
    calcCpc({ qtd_contatos: r.qtd_contatos, qtd_alo: r.qtd_alo });
  const agentConv = (r: ProdutividadeRowWithSource) =>
    calcConversao({ qtd_acordos: r.qtd_acordos, qtd_contatos: r.qtd_contatos });
  const agentTicket = (r: ProdutividadeRowWithSource) =>
    calcTicketMedio({ valor_acordos: Number(r.valor_acordos || 0), qtd_acordos: r.qtd_acordos });

  const maxValor = Math.max(1, ...rows.map(agentValor));
  const maxQtd = Math.max(1, ...rows.map(agentQtd));
  const maxCpc = Math.max(1, ...rows.map(agentCpc));
  const maxConv = Math.max(1, ...rows.map(agentConv));
  const maxTicket = Math.max(1, ...rows.map(agentTicket));

  const norm = (v: number, m: number) => Math.round(Math.min(100, (v / m) * 100));

  const teamAvgValor = rows.reduce((a, r) => a + agentValor(r), 0) / rows.length;
  const teamAvgQtd = rows.reduce((a, r) => a + agentQtd(r), 0) / rows.length;
  const teamAvgCpc = rows.reduce((a, r) => a + agentCpc(r), 0) / rows.length;
  const teamAvgConv = rows.reduce((a, r) => a + agentConv(r), 0) / rows.length;
  const teamAvgTicket = rows.reduce((a, r) => a + agentTicket(r), 0) / rows.length;

  return [
    { dim: "Receita", agent: norm(agentTotals.valor_acordos / agentCnt, maxValor), team: norm(teamAvgValor, maxValor), rawAgent: agentTotals.valor_acordos / agentCnt, rawTeam: teamAvgValor, unit: "BRL" },
    { dim: "Acordos Fechados", agent: norm(agentTotals.qtd_acordos / agentCnt, maxQtd), team: norm(teamAvgQtd, maxQtd), rawAgent: agentTotals.qtd_acordos / agentCnt, rawTeam: teamAvgQtd, unit: "count" },
    { dim: "CPC", agent: norm(calcCpc(agentTotals), maxCpc), team: norm(teamAvgCpc, maxCpc), rawAgent: calcCpc(agentTotals), rawTeam: teamAvgCpc, unit: "%" },
    { dim: "Conversão", agent: norm(calcConversao(agentTotals), maxConv), team: norm(teamAvgConv, maxConv), rawAgent: calcConversao(agentTotals), rawTeam: teamAvgConv, unit: "%" },
    { dim: "Ticket Médio", agent: norm(calcTicketMedio(agentTotals), maxTicket), team: norm(teamAvgTicket, maxTicket), rawAgent: calcTicketMedio(agentTotals), rawTeam: teamAvgTicket, unit: "BRL" },
  ];
}

/**
 * Team-wide radar profile (filter = "Todos"). Reuses buildRadarData's team
 * series (per-agent average vs best agent per dim) as the visible polygon.
 */
function buildTeamRadar(rows: ProdutividadeRowWithSource[]): RadarDimension[] {
  return buildRadarData(rows, []).map((d) => ({
    ...d,
    agent: d.team,
    rawAgent: d.rawTeam,
  }));
}

/**
 * Compute a delta fraction: (current - prev) / prev.
 * Returns 0 when prev is 0 or data unavailable.
 */
function deltaFrac(current: number, prev: number): number {
  if (prev === 0) return 0;
  return (current - prev) / prev;
}

/**
 * Build the AgentInsight using dynamic (percentile-based) thresholds.
 * Reuses the same logic as the heatmap: top 20% = good, bottom 40% = attention.
 */
function buildInsight(
  rows: ProdutividadeRowWithSource[],
  agentRows: ProdutividadeRowWithSource[],
  selectedAgent: string | null,
): AgentInsight {
  if (!selectedAgent || agentRows.length === 0 || rows.length === 0) {
    return {
      variant: "neutral",
      title: "Selecione um agente",
      description: "Escolha um agente na barra de filtro para ver o diagnóstico automático.",
      metric: "—",
      kpiDeltas: {},
      agentRank: 0,
      totalAgents: rows.length,
    };
  }

  const agentTotals = aggregateTotals(agentRows);
  const agentCnt = agentRows.length || 1;

  // Compute percentiles for key metrics across all agents
  const allValor = rows.map((r) => Number(r.valor_acordos || 0)).sort((a, b) => a - b);
  const allCpc = rows.map((r) => calcCpc({ qtd_contatos: r.qtd_contatos, qtd_alo: r.qtd_alo })).sort((a, b) => a - b);
  const allConv = rows.map((r) => calcConversao({ qtd_acordos: r.qtd_acordos, qtd_contatos: r.qtd_contatos })).sort((a, b) => a - b);
  const allExc = rows.map((r) => Number(r.valor_excecoes && r.valor_acordos ? (r.valor_excecoes * 100) / r.valor_acordos : 0)).sort((a, b) => a - b);

  const pctRank = (sorted: number[], v: number): number => {
    const n = sorted.length;
    if (n === 0) return 0;
    let below = 0, equal = 0;
    for (const x of sorted) {
      if (x < v) below++;
      else if (x === v) equal++;
      else break;
    }
    return Math.round(((below + 0.5 * equal) / n) * 100);
  };

  const agentValor = agentTotals.valor_acordos / agentCnt;
  const agentCpc = calcCpc(agentTotals);
  const agentConv = calcConversao(agentTotals);
  const agentExc = calcExcecoesPctValor(agentTotals);

  const valorPct = pctRank(allValor, agentValor);
  const cpcPct = pctRank(allCpc, agentCpc);
  const convPct = pctRank(allConv, agentConv);
  const excPct = pctRank(allExc, agentExc); // lower is better, so invert for scoring

  // Build ranking to find agent position
  const allRanked = [...rows]
    .map((r) => {
      const cpc = calcCpc({ qtd_contatos: r.qtd_contatos, qtd_alo: r.qtd_alo });
      const conv = calcConversao({ qtd_acordos: r.qtd_acordos, qtd_contatos: r.qtd_contatos });
      const score = Math.round((1 - Math.min(cpc / 100, 1)) * 50 + (1 - Math.min(conv / 100, 1) / 3) * 35);
      return { id: r.CHAVE, score };
    })
    .sort((a, b) => b.score - a.score);
  const rankIdx = allRanked.findIndex((r) => agentRows.some((ar) => ar.CHAVE === r.id));
  const agentRank = rankIdx >= 0 ? rankIdx + 1 : 0;

  // Dynamic threshold: agent is "good" if in top 20% on valor AND not bottom 40% on anything
  // "critical" if in bottom 40% on valor OR bottom 40% on CPC/conversão with high exceptions
  // "warning" otherwise
  let variant: InsightCardVariant;
  let title: string;
  let description: string;
  const agentName = selectedAgent;

  const valorGood = valorPct >= 80;
  const valorBad = valorPct < 40;
  const cpcBad = cpcPct < 40;
  const convBad = convPct < 40;
  const excHigh = excPct < 40; // inverted: low percentile = high exceptions

  if (valorGood && !cpcBad && !convBad && !excHigh) {
    variant = "positive";
    title = `${agentName} — desempenho acima da equipe`;
    description = `Top ${100 - valorPct}% em valor acordos. CPC, conversão e exceções dentro do esperado. Manter abordagem.`;
  } else if (valorBad || (cpcBad && convBad)) {
    variant = "critical";
    title = `${agentName} — requer atenção`;
    const issues: string[] = [];
    if (valorBad) issues.push(`valor acordos no bottom ${100 - valorPct}%`);
    if (cpcBad) issues.push(`CPC no bottom ${100 - cpcPct}%`);
    if (convBad) issues.push(`conversão no bottom ${100 - convPct}%`);
    if (excHigh) issues.push(`exceções elevadas (top ${100 - excPct}%)`);
    description = `${issues.join(" · ")}. Recomendação: revisar script de abordagem e acompanhar de perto.`;
  } else {
    variant = "neutral";
    title = `${agentName} — desempenho mediano`;
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    if (valorPct >= 60) strengths.push("valor acordos acima da mediana");
    if (cpcPct >= 60) strengths.push("CPC acima da mediana");
    if (convPct >= 60) strengths.push("conversão acima da mediana");
    if (valorPct < 60) weaknesses.push("valor acordos abaixo da mediana");
    if (cpcPct < 60 && cpcPct >= 40) weaknesses.push("CPC mediano");
    if (convPct < 60 && convPct >= 40) weaknesses.push("conversão mediana");

    if (strengths.length > 0 && weaknesses.length === 0) {
      description = `${strengths.join(" · ")}. Continuar monitorando.`;
    } else if (weaknesses.length > 0) {
      description = `${weaknesses.join(" · ")}. Potencial de melhoria com ajustes pontuais.`;
    } else {
      description = "Dentro da média da equipe. Sem ações imediatas necessárias.";
    }
  }

  return {
    variant,
    title,
    description,
    metric: `#${agentRank} de ${rows.length} agentes`,
    kpiDeltas: {},
    agentRank,
    totalAgents: rows.length,
  };
}

/* ------------------------------------------------------------------ *
 * Hook
 * ------------------------------------------------------------------ */

export function useDetalhamentoViewModel(): DetalhamentoViewModel {
  const { selectedDatabase, dateFrom, dateTo } = useGlobalFilters();
  const prev = useMemo(() => previousPeriod(dateFrom, dateTo), [dateFrom, dateTo]);

  const { rows, loading: currLoading, error: loadError, warnings, refresh } = useProdutividadeData(
    selectedDatabase, { dateFrom, dateTo },
  );

  // Previous period data (Change 4 — KPI deltas)
  const prevData = useProdutividadeData(
    selectedDatabase,
    prev.from && prev.to ? { dateFrom: prev.from, dateTo: prev.to } : undefined,
  );
  const prevRows = prevData.rows;
  const prevLoading = prevData.loading;

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const agentList = useMemo(() => rowsToAgentList(rows), [rows]);
  const totals = useMemo(() => aggregateTotals(rows), [rows]);
  const prevTotals = useMemo(() => aggregateTotals(prevRows), [prevRows]);

  const agentRows = useMemo(
    () => (selectedAgent ? rows.filter((r) => r.NOME === selectedAgent) : rows),
    [rows, selectedAgent],
  );
  const agentTotals = useMemo(() => aggregateTotals(agentRows), [agentRows]);

  const prevAgentRows = useMemo(
    () => (selectedAgent ? prevRows.filter((r) => r.NOME === selectedAgent) : prevRows),
    [prevRows, selectedAgent],
  );
  const prevAgentTotals = useMemo(() => aggregateTotals(prevAgentRows), [prevAgentRows]);

  // ── KPI deltas (Change 4) ──
  const kpiDeltas = useMemo((): Record<string, number> => {
    if (!selectedAgent || prevAgentRows.length === 0) return {};
    return {
      valor_acordos: deltaFrac(agentTotals.valor_acordos, prevAgentTotals.valor_acordos),
      primeira_parcela: deltaFrac(agentTotals.valor_primeira_parcela, prevAgentTotals.valor_primeira_parcela),
      qtd_acordos: deltaFrac(agentTotals.qtd_acordos, prevAgentTotals.qtd_acordos),
      ticket_medio: deltaFrac(calcTicketMedio(agentTotals), calcTicketMedio(prevAgentTotals)),
      contato_alo: deltaFrac(agentTotals.qtd_alo, prevAgentTotals.qtd_alo),
      cpc: deltaFrac(agentTotals.qtd_contatos, prevAgentTotals.qtd_contatos),
      taxa_cpc: deltaFrac(calcCpc(agentTotals), calcCpc(prevAgentTotals)),
      conversao: deltaFrac(calcConversao(agentTotals), calcConversao(prevAgentTotals)),
      qtd_acionamentos: deltaFrac(agentTotals.qtd_acionamentos, prevAgentTotals.qtd_acionamentos),
    };
  }, [selectedAgent, agentTotals, prevAgentTotals]);

  // ── KPIs ──
  const kpiPrimary: KpiDatum[] = useMemo(() => [
    { id: "valor_acordos", label: "Receita", value: agentTotals.valor_acordos, unit: "BRL" },
    { id: "primeira_parcela", label: "1ª Parcela", value: agentTotals.valor_primeira_parcela, unit: "BRL" },
    { id: "qtd_acordos", label: "Acordos Fechados", value: agentTotals.qtd_acordos, unit: "count" },
    { id: "ticket_medio", label: "Ticket Médio", value: calcTicketMedio(agentTotals), unit: "BRL" },
  ], [agentTotals]);

  const kpiSecondary: KpiDatum[] = useMemo(() => [
    { id: "contato_alo", label: "Contato", value: agentTotals.qtd_alo, unit: "count" },
    { id: "cpc", label: "CPC", value: agentTotals.qtd_contatos, unit: "count" },
    { id: "taxa_cpc", label: "Taxa CPC %", value: calcCpc(agentTotals), unit: "%" },
    { id: "conversao", label: "Conversão %", value: calcConversao(agentTotals), unit: "%" },
    { id: "qtd_acionamentos", label: "Qtd Acionamentos", value: agentTotals.qtd_acionamentos, unit: "count" },
    { id: "qtd_excecoes", label: "Qtd Exceções", value: agentTotals.qtd_excecoes, unit: "count" },
    { id: "valor_excecoes", label: "Valor Exceções", value: agentTotals.valor_excecoes, unit: "BRL" },
    { id: "qtd_rejeitados", label: "Qtd Rejeitados", value: agentTotals.qtd_rejeitados, unit: "count" },
    { id: "valor_rejeitados", label: "Valor Rejeitados", value: agentTotals.valor_rejeitados, unit: "BRL" },
    { id: "receita_hora", label: "Receita/Hora", value: calcReceitaPorHora(agentTotals), unit: "BRL" },
    { id: "idade_media", label: "Idade Média (dias)", value: calcIdadeMediaAcordos(agentTotals), unit: "count" },
  ], [agentTotals]);

  const funil: FunilData = useMemo(() => ({
    acionamentos: agentTotals.qtd_acionamentos,
    alo: agentTotals.qtd_alo,
    contatos: agentTotals.qtd_contatos,
    acordos: agentTotals.qtd_acordos,
    primeiraParcela: agentTotals.valor_primeira_parcela,
    valorAcordos: agentTotals.valor_acordos,
  }), [agentTotals]);

  const teamTotals = useMemo(() => aggregateTotals(rows), [rows]);
  const metas: BulletPanelData = useMemo(() => ({
    cpc: { value: calcCpc(agentTotals), meta: Math.max(calcCpc(teamTotals) * 0.9, 8), ranges: { poor: 5, ok: 10, good: 15 }, unit: "%" },
    conversao: { value: calcConversao(agentTotals), meta: Math.max(calcConversao(teamTotals) * 1.1, 5), ranges: { poor: 4, ok: 7, good: 11 }, unit: "%" },
    primeiraParcela: { value: agentTotals.valor_primeira_parcela, meta: Math.max((teamTotals.valor_primeira_parcela / (rows.length || 1)) * 1.05, 500), ranges: { poor: 2000, ok: 5000, good: 8000 }, unit: "BRL" },
    excecoes: { value: calcExcecoesPctValor(agentTotals), meta: 3.0, ranges: { poor: 6, ok: 8.5, good: 10 }, unit: "%", inverted: true },
  }), [agentTotals, teamTotals]);

  const heatmapAgents = useMemo(() => rowsToHeatmap(rows), [rows]);
  const scatterPoints = useMemo(() => rowsToScatter(rows), [rows]);
  const rankingEntries = useMemo(() => rowsToRanking(rows), [rows]);
  const paretoPoints = useMemo(() => rowsToPareto(rows), [rows]);

  const radarData = useMemo(() => {
    if (rows.length === 0) return [];
    if (selectedAgent) return buildRadarData(rows, rows.filter((r) => r.NOME === selectedAgent));
    return buildTeamRadar(rows);
  }, [rows, selectedAgent]);

  // ── Valor comparison (was MediaDinamica, now feeds insight card) ──
  const valorComparison = useMemo(() => {
    const teamRowsWithValor = rows.filter((r) => Number(r.valor_acordos || 0) > 0);
    const teamTotalValor = teamRowsWithValor.reduce((a, r) => a + Number(r.valor_acordos || 0), 0);
    const teamCnt = teamRowsWithValor.length || 1;
    const teamMedia = teamTotalValor / teamCnt;
    const teamMax = Math.max(1, ...teamRowsWithValor.map((r) => Number(r.valor_acordos || 0)));
    const agentRowsFiltered = selectedAgent ? rows.filter((r) => r.NOME === selectedAgent) : [];
    const agentTotal = aggregateTotals(agentRowsFiltered);
    const agentCnt = agentRowsFiltered.length || 1;
    return {
      agentValor: agentTotal.valor_acordos / agentCnt,
      teamMedia,
      teamMax,
      agentCount: teamCnt,
    };
  }, [rows, selectedAgent]);

  const insight = useMemo(
    () => {
      const base = buildInsight(rows, selectedAgent ? rows.filter((r) => r.NOME === selectedAgent) : [], selectedAgent);
      return { ...base, kpiDeltas };
    },
    [rows, selectedAgent, kpiDeltas],
  );

  const loading = (currLoading || prevLoading) && rows.length === 0;

  return {
    loading, error: loadError, warnings, refresh,
    agentList, selectedAgent, setSelectedAgent,
    kpiPrimary, kpiSecondary, funil, metas,
    heatmapAgents, scatterPoints, rankingEntries, paretoPoints,
    radarData,
    insight,
    valorComparison,
  };
}
