import type { ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";
import {
  aggregateTotals,
  calcConversao,
  calcCpc,
  calcTicketMedio,
  type MetricTotals,
} from "@/lib/metrics";

export interface RadarDimension {
  dim: string;
  agentA: number;
  agentB: number;
  rawA: number;
  rawB: number;
  unit: "BRL" | "%" | "count";
}

export function selectAgentRow(
  rows: ProdutividadeRowWithSource[],
  agente: string,
): ProdutividadeRowWithSource | null {
  if (!agente) return null;
  return rows.find((r) => String(r.NOME || "").trim() === agente) ?? null;
}

export function selectComparacaoTotals(
  rows: ProdutividadeRowWithSource[],
  agente: string,
): MetricTotals | null {
  if (!agente) return null;
  const matching = rows.filter((r) => String(r.NOME || "").trim() === agente);
  if (matching.length === 0) return null;
  return aggregateTotals(matching);
}

export function selectTopByValorAgentName(
  rows: ProdutividadeRowWithSource[],
  index: number,
): string | null {
  const sorted = [...rows]
    .filter((r) => Number(r.valor_acordos || 0) > 0)
    .sort((a, b) => Number(b.valor_acordos || 0) - Number(a.valor_acordos || 0));
  const row = sorted[index];
  return row ? String(row.NOME || "").trim() : null;
}

export function selectRadarDimensions(
  rowsA: ProdutividadeRowWithSource[],
  rowsB: ProdutividadeRowWithSource[],
  buRows: ProdutividadeRowWithSource[],
): RadarDimension[] {
  if (rowsA.length === 0 || rowsB.length === 0) return [];
  const ta = aggregateTotals(rowsA);
  const tb = aggregateTotals(rowsB);
  const teamMax = (fn: (r: ProdutividadeRowWithSource) => number) =>
    Math.max(1, ...buRows.map(fn));
  const maxValor = teamMax((r) => Number(r.valor_acordos || 0));
  const maxQtd = teamMax((r) => Number(r.qtd_acordos || 0));
  const maxCpc = Math.max(1, ...buRows.map((r) => calcCpc(aggregateTotals([r]))));
  const maxConv = Math.max(1, ...buRows.map((r) => calcConversao(aggregateTotals([r]))));
  const maxTicket = Math.max(1, ...buRows.map((r) => calcTicketMedio(aggregateTotals([r]))));
  const norm = (v: number, m: number) => Math.round((v / m) * 100);
  return [
    {
      dim: "Valor",
      agentA: norm(ta.valor_acordos, maxValor),
      agentB: norm(tb.valor_acordos, maxValor),
      rawA: ta.valor_acordos,
      rawB: tb.valor_acordos,
      unit: "BRL",
    },
    {
      dim: "Qtd",
      agentA: norm(ta.qtd_acordos, maxQtd),
      agentB: norm(tb.qtd_acordos, maxQtd),
      rawA: ta.qtd_acordos,
      rawB: tb.qtd_acordos,
      unit: "count",
    },
    {
      dim: "Taxa contato",
      agentA: norm(calcCpc(ta), maxCpc),
      agentB: norm(calcCpc(tb), maxCpc),
      rawA: calcCpc(ta),
      rawB: calcCpc(tb),
      unit: "%",
    },
    {
      dim: "Conversão",
      agentA: norm(calcConversao(ta), maxConv),
      agentB: norm(calcConversao(tb), maxConv),
      rawA: calcConversao(ta),
      rawB: calcConversao(tb),
      unit: "%",
    },
    {
      dim: "Ticket",
      agentA: norm(calcTicketMedio(ta), maxTicket),
      agentB: norm(calcTicketMedio(tb), maxTicket),
      rawA: calcTicketMedio(ta),
      rawB: calcTicketMedio(tb),
      unit: "BRL",
    },
  ];
}
