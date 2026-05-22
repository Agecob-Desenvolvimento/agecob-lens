import type { ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";
import { shortAgentName } from "@/lib/metrics";
import type { RankingRow } from "@/types/executive";

export const TODOS_BU = "(Todos)";
export const DEFAULT_MIN_ACIONAMENTOS = 10;

export function filterByBu(
  rows: ProdutividadeRowWithSource[],
  bu: string,
): ProdutividadeRowWithSource[] {
  if (bu === TODOS_BU) return rows;
  return rows.filter((row) => row.source === bu);
}

export function selectBuOptions(rows: ProdutividadeRowWithSource[]): string[] {
  return Array.from(new Set(rows.map((row) => row.source)));
}

export function selectTopByCpc(
  rows: ProdutividadeRowWithSource[],
  n = 10,
  minAcionamentos = DEFAULT_MIN_ACIONAMENTOS,
): RankingRow[] {
  return rows
    .filter((r) => Number(r.qtd_acionamentos || 0) >= minAcionamentos)
    .map((row) => {
      const acionamentos = Number(row.qtd_acionamentos || 0);
      const contatos = Number(row.qtd_contatos || 0);
      const acordos = Number(row.qtd_acordos || 0);
      const cpc = acionamentos > 0 ? (contatos * 100) / acionamentos : 0;
      const conversao = acionamentos > 0 ? (acordos * 100) / acionamentos : 0;
      return { agente: row.NOME, cpc, conversao };
    })
    .sort((a, b) => b.cpc - a.cpc)
    .slice(0, n)
    .map((r, idx) => ({
      rank: idx + 1,
      label: shortAgentName(r.agente),
      primaryValue: r.cpc,
      primaryUnit: "%" as const,
      secondaryValue: r.conversao,
      secondaryUnit: "%" as const,
    }));
}
