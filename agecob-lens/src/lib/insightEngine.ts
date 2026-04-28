import type { ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";
import type {
  ActionSlot,
  InsightEngineOutput,
  InsightSlot,
  InsightSeverity,
} from "@/types/executive";
import {
  aggregateTotals,
  calcCpc,
  calcConcentracao,
  calcConversao,
  calcExcecoesPctQtd,
  fmtNum,
  fmtPct,
} from "@/lib/metrics";

interface CandidateInsight extends InsightSlot {
  ruleId: string;
  category: "cpc" | "conversion" | "exceptions" | "first_installment" | "concentration";
  rank: number;
}

interface CandidateAction extends ActionSlot {
  ruleId: string;
  rank: number;
}

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  critical: 3,
  warning: 2,
  positive: 1,
};

export function generateDailyReadout(
  rows: ProdutividadeRowWithSource[],
): InsightEngineOutput {
  if (!rows.length) {
    return { insight1: null, insight2: null, action: null, empty: true };
  }

  const totals = aggregateTotals(rows);
  const cpc = calcCpc(totals);
  const conversao = calcConversao(totals);
  const excPct = calcExcecoesPctQtd(totals);
  const concentracao = calcConcentracao(rows, 3);
  const ppRatio = totals.valor_acordos > 0
    ? (totals.valor_primeira_parcela * 100) / totals.valor_acordos
    : 0;

  const insights: CandidateInsight[] = [];
  const actions: CandidateAction[] = [];

  if (cpc > 40) {
    insights.push({
      ruleId: "insight_cpc_above_avg",
      category: "cpc",
      severity: "positive",
      text: `CPC está em ${fmtPct(cpc)}, acima do patamar operacional.`,
      rank: SEVERITY_RANK.positive,
    });
  } else if (cpc < 20 && totals.qtd_acionamentos > 0) {
    insights.push({
      ruleId: "insight_cpc_below_avg",
      category: "cpc",
      severity: "warning",
      text: `CPC em ${fmtPct(cpc)} — abaixo do patamar operacional.`,
      rank: SEVERITY_RANK.warning,
    });
  }

  if (conversao < 5 && totals.qtd_acionamentos > 100) {
    insights.push({
      ruleId: "insight_conversion_drop",
      category: "conversion",
      severity: "critical",
      text: `Conversão em ${fmtPct(conversao)} com alto volume de acionamentos. Verificar qualidade dos contatos.`,
      rank: SEVERITY_RANK.critical,
    });
  }

  if (totals.qtd_excecoes > 10) {
    insights.push({
      ruleId: "insight_exception_spike",
      category: "exceptions",
      severity: "warning",
      text: `Volume de exceções elevado: ${fmtNum(totals.qtd_excecoes)} hoje.`,
      rank: SEVERITY_RANK.warning,
    });
  }

  if (ppRatio > 60) {
    insights.push({
      ruleId: "insight_first_installment_high",
      category: "first_installment",
      severity: "positive",
      text: `Primeira parcela representa ${fmtPct(ppRatio)} do valor acordado — bom sinal de entrada de caixa.`,
      rank: SEVERITY_RANK.positive,
    });
  }

  if (concentracao > 70 && rows.length > 3) {
    insights.push({
      ruleId: "insight_concentration",
      category: "concentration",
      severity: "warning",
      text: `Concentração alta: Top 3 agentes respondem por ${fmtPct(concentracao)} do valor total.`,
      rank: SEVERITY_RANK.warning,
    });
  }

  // BU comparison action — only when both BUs are present
  const bus = new Map<string, { acionamentos: number; acordos: number; label: string }>();
  rows.forEach((row) => {
    const bu = row.source.toUpperCase().includes("AUTO") ? "AUTOS" : "CONSUMER";
    const entry = bus.get(bu) ?? { acionamentos: 0, acordos: 0, label: bu };
    entry.acionamentos += Number(row.qtd_acionamentos || 0);
    entry.acordos += Number(row.qtd_acordos || 0);
    bus.set(bu, entry);
  });
  if (bus.size === 2) {
    const arr = Array.from(bus.values()).map((b) => ({
      ...b,
      conv: b.acionamentos > 0 ? (b.acordos * 100) / b.acionamentos : 0,
    }));
    const [a, b] = arr;
    if (a.conv > 0 && b.conv > 0) {
      const [winner, loser] = a.conv >= b.conv ? [a, b] : [b, a];
      if (loser.conv > 0 && winner.conv >= 2 * loser.conv) {
        const delta = ((winner.conv - loser.conv) / loser.conv) * 100;
        actions.push({
          ruleId: "action_bu_focus",
          severity: "action",
          text: `Considere realocar capacidade para ${winner.label} — conversão ${fmtPct(delta)} maior.`,
          rank: 3,
        });
      }
    }
  }

  if (excPct > 15) {
    actions.push({
      ruleId: "action_exception_review",
      severity: "action",
      text: `Revisar política de exceções — taxa em ${fmtPct(excPct)}.`,
      rank: 2,
    });
  }

  if (actions.length === 0) {
    actions.push({
      ruleId: "action_no_signal",
      severity: "action",
      text: "Operação dentro dos parâmetros. Sem ação imediata recomendada.",
      rank: 0,
    });
  }

  // Selection: highest severity → slot 1; second-highest from a different category → slot 2
  insights.sort((a, b) => b.rank - a.rank);
  const slot1 = insights[0] ?? null;
  const slot2 = slot1
    ? insights.find((i) => i.category !== slot1.category) ?? null
    : null;

  actions.sort((a, b) => b.rank - a.rank);
  const action = actions[0] ?? null;

  if (!slot1 && !slot2 && (!action || action.ruleId === "action_no_signal")) {
    return {
      insight1: null,
      insight2: null,
      action,
      empty: false,
    };
  }

  return {
    insight1: slot1 ? { text: slot1.text, severity: slot1.severity } : null,
    insight2: slot2 ? { text: slot2.text, severity: slot2.severity } : null,
    action,
    empty: false,
  };
}
