import type { ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";
import { calcConversao, shortAgentName } from "@/lib/metrics";
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
      const alo = Number(row.qtd_alo || 0);
      const contatos = Number(row.qtd_contatos || 0);
      // Taxa de CPC = pessoa certa (RPC) dentre quem atendeu (alô).
      const cpc = alo > 0 ? (contatos * 100) / alo : 0;
      const conversao = calcConversao({ qtd_boletos_pagos: Number(row.qtd_boletos_pagos || 0), qtd_contatos: contatos });
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
