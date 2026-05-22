import type { ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";
import { buFromSource, calcCpc, shortAgentName } from "@/lib/metrics";
import type { RankingRow } from "@/types/executive";

import { DEFAULT_MIN_ACIONAMENTOS } from "./analiseSelectors";

export type BuName = "AUTOS" | "CONSUMER";

export interface AgentPercentile {
  valorPct: number | null;
  cpcPct: number | null;
  totalBU: number;
}

export function selectAgentNames(rows: ProdutividadeRowWithSource[]): string[] {
  return Array.from(
    new Set(rows.map((row) => String(row.NOME || "").trim()).filter((name) => name.length > 0)),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function selectBuRows(
  rows: ProdutividadeRowWithSource[],
  bu: BuName | null,
): ProdutividadeRowWithSource[] {
  if (!bu) return [];
  return rows.filter((row) => buFromSource(row.source) === bu);
}

export function selectAgentPercentile(
  _rows: ProdutividadeRowWithSource[],
  agentLabel: string,
  buRows: ProdutividadeRowWithSource[],
  minAcionamentos = DEFAULT_MIN_ACIONAMENTOS,
): AgentPercentile | null {
  if (!agentLabel || agentLabel === "Todos" || buRows.length === 0) return null;
  const sortedByValor = [...buRows].sort(
    (a, b) => Number(b.valor_acordos || 0) - Number(a.valor_acordos || 0),
  );
  const valorRank = sortedByValor.findIndex(
    (r) => String(r.NOME || "").trim() === agentLabel,
  );
  const buWithAcionamentos = buRows.filter(
    (r) => Number(r.qtd_acionamentos || 0) >= minAcionamentos,
  );
  const sortedByCpc = [...buWithAcionamentos]
    .map((r) => ({
      nome: String(r.NOME || "").trim(),
      cpc: calcCpc({
        qtd_contatos: Number(r.qtd_contatos || 0),
        qtd_acionamentos: Number(r.qtd_acionamentos || 0),
      }),
    }))
    .sort((a, b) => b.cpc - a.cpc);
  const cpcRank = sortedByCpc.findIndex((r) => r.nome === agentLabel);
  const valorPct =
    valorRank >= 0 ? Math.round(((valorRank + 1) / sortedByValor.length) * 100) : null;
  const cpcPct =
    cpcRank >= 0 ? Math.round(((cpcRank + 1) / sortedByCpc.length) * 100) : null;
  return { valorPct, cpcPct, totalBU: buRows.length };
}

export function selectTeamRanking(
  buRows: ProdutividadeRowWithSource[],
  n = 10,
): RankingRow[] {
  return [...buRows]
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
