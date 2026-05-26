import type { ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";
import type {
  AcordosPorPortfolioRow,
  ExcecoesPorPortfolioRow,
  PrimeiraParcelaPorAgenteRow,
  RejeitadosPorPortfolioRow,
} from "@/services/api";
import type { BuValueDatum } from "@/components/executive/BuValueChart";
import type { BuEfficiencyDatum } from "@/components/executive/BuEfficiencyChart";
import type { HandoffFinanceiroDatum } from "@/components/executive/HandoffFinanceiroGroupedBar";
import type { HandoffEficienciaDatum } from "@/components/executive/HandoffEficienciaGroupedBar";
import { aggregateTotals, buFromSource, calcConversao, calcCpc, shortAgentName } from "@/lib/metrics";
import type { RankingRow } from "@/types/executive";

export interface BarDatum {
  label: string;
  value: number;
}

const BU_ORDER: ("AUTOS" | "CONSUMER")[] = ["AUTOS", "CONSUMER"];

export function selectTopByValor(rows: ProdutividadeRowWithSource[], n = 10): RankingRow[] {
  return [...rows]
    .filter((r) => Number(r.valor_acordos || 0) > 0)
    .sort((a, b) => Number(b.valor_acordos || 0) - Number(a.valor_acordos || 0))
    .slice(0, n)
    .map((row, idx) => ({
      rank: idx + 1,
      label: shortAgentName(row.NOME),
      primaryValue: Number(row.valor_acordos || 0),
      primaryUnit: "BRL" as const,
      secondaryValue: Number(row.qtd_acordos || 0),
      secondaryUnit: "count" as const,
    }));
}

function groupByBu(rows: ProdutividadeRowWithSource[]): Map<"AUTOS" | "CONSUMER", ProdutividadeRowWithSource[]> {
  const map = new Map<"AUTOS" | "CONSUMER", ProdutividadeRowWithSource[]>();
  rows.forEach((row) => {
    const bu = buFromSource(row.source);
    const arr = map.get(bu) ?? [];
    arr.push(row);
    map.set(bu, arr);
  });
  return map;
}

export function selectBuValueData(rows: ProdutividadeRowWithSource[]): BuValueDatum[] {
  const map = groupByBu(rows);
  return BU_ORDER.filter((bu) => map.has(bu)).map((bu) => {
    const t = aggregateTotals(map.get(bu) ?? []);
    return { name: bu, valor_acordos: t.valor_acordos, valor_primeira_parcela: t.valor_primeira_parcela };
  });
}

export function selectBuEfficiencyData(rows: ProdutividadeRowWithSource[]): BuEfficiencyDatum[] {
  const map = groupByBu(rows);
  return BU_ORDER.filter((bu) => map.has(bu)).map((bu) => {
    const t = aggregateTotals(map.get(bu) ?? []);
    return { name: bu, cpc: calcCpc(t), conversao: calcConversao(t) };
  });
}

export function selectTopAgentesPorPrimeiraParcela(
  rows: PrimeiraParcelaPorAgenteRow[],
  n = 10,
): BarDatum[] {
  return [...rows]
    .sort((a, b) => Number(b.valor_primeira_parcela || 0) - Number(a.valor_primeira_parcela || 0))
    .slice(0, n)
    .map((r) => ({ label: shortAgentName(r.agente), value: Number(r.valor_primeira_parcela || 0) }));
}

export function selectTopPortfolioPorValor(rows: AcordosPorPortfolioRow[], n = 10): BarDatum[] {
  return [...rows]
    .sort((a, b) => Number(b.valor_acordos || 0) - Number(a.valor_acordos || 0))
    .slice(0, n)
    .map((r) => ({ label: r.portfolio_name, value: Number(r.valor_acordos || 0) }));
}

export function selectTopPortfolioPorExcecoes(rows: ExcecoesPorPortfolioRow[], n = 10): BarDatum[] {
  return [...rows]
    .filter((r) => Number(r.qtd_excecoes || 0) > 0)
    .sort((a, b) => Number(b.qtd_excecoes || 0) - Number(a.qtd_excecoes || 0))
    .slice(0, n)
    .map((r) => ({ label: r.portfolio_name, value: Number(r.qtd_excecoes || 0) }));
}

export function selectTopPortfolioPorRejeitados(rows: RejeitadosPorPortfolioRow[], n = 10): BarDatum[] {
  return [...rows]
    .filter((r) => Number(r.qtd_rejeitados || 0) > 0)
    .sort((a, b) => Number(b.qtd_rejeitados || 0) - Number(a.qtd_rejeitados || 0))
    .slice(0, n)
    .map((r) => ({ label: r.portfolio_name, value: Number(r.qtd_rejeitados || 0) }));
}

export function selectGapDePerformance(rows: ProdutividadeRowWithSource[]): number {
  const valores = rows
    .map((r) => Number(r.valor_acordos || 0))
    .filter((v) => v > 0);
  if (valores.length === 0) return 0;
  return Math.max(...valores) - Math.min(...valores);
}

export function selectFinanceiroHandoffData(
  rows: ProdutividadeRowWithSource[],
): HandoffFinanceiroDatum[] {
  return selectBuValueData(rows).map((d) => ({
    bu: d.name,
    valorAcordos: d.valor_acordos,
    primeiraParcela: d.valor_primeira_parcela,
  }));
}

export function selectEficienciaHandoffData(
  rows: ProdutividadeRowWithSource[],
): HandoffEficienciaDatum[] {
  return selectBuEfficiencyData(rows).map((d) => ({
    bu: d.name,
    cpc: d.cpc,
    conversao: d.conversao,
  }));
}
