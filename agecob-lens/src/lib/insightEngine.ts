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
  calcEfetividadeCaixa,
  calcExcecoesPctQtd,
  fmtBRL,
  fmtNum,
  fmtPct,
} from "@/lib/metrics";

interface CandidateInsight extends InsightSlot {
  ruleId: string;
  category: "cpc" | "conversion" | "cash_effectiveness" | "exceptions" | "first_installment" | "concentration" | "month_projection";
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
  projecaoMes?: number,
): InsightEngineOutput {
  if (!rows.length) {
    return { insight1: null, insight2: null, action: null, empty: true };
  }

  const totals = aggregateTotals(rows);
  const cpc = calcCpc(totals);
  const conversao = calcConversao(totals);
  // Efetividade de caixa (1ª parcela recebida / gerada) — mesma coorte, sem
  // mistura boleto×pessoa nem censura tão forte quanto `conversao`.
  const efetividadeCaixa = calcEfetividadeCaixa({
    valor_primeira_parcela: totals.valor_primeira_parcela,
    valor_p1_recebido: totals.valor_primeira_parcela_recebida,
  });
  const excPct = calcExcecoesPctQtd(totals);
  const concentracao = calcConcentracao(rows, 3);
  const ppRatio = totals.valor_acordos > 0
    ? (totals.valor_primeira_parcela * 100) / totals.valor_acordos
    : 0;

  const insights: CandidateInsight[] = [];
  const actions: CandidateAction[] = [];

  // CPC = pessoa certa / alô (RPC/ALO). Patamares pelos quartis do benchmark
  // interno (q1≈5,5% · mediana≈10,7% · q3≈15,4%).
  if (cpc > 15) {
    insights.push({
      ruleId: "insight_cpc_above_avg",
      category: "cpc",
      severity: "positive",
      headline: fmtPct(cpc),
      text: "Taxa de CPC acima do patamar operacional.",
      rank: SEVERITY_RANK.positive,
    });
  } else if (cpc < 5 && totals.qtd_alo > 0) {
    insights.push({
      ruleId: "insight_cpc_below_avg",
      category: "cpc",
      severity: "warning",
      headline: fmtPct(cpc),
      text: "Taxa de CPC abaixo do patamar operacional.",
      rank: SEVERITY_RANK.warning,
    });
  }

  // N=30 no CPC (denominador) é gate de base mínima — abaixo disso o % oscila
  // demais pra virar alerta crítico sozinho (1 acordo já move vários pontos).
  // Limiar escalado com o target do health score (8%→10%, fator 1.25x): 5→6.
  if (conversao < 6 && totals.qtd_acionamentos > 100 && totals.qtd_contatos >= 30) {
    insights.push({
      ruleId: "insight_conversion_drop",
      category: "conversion",
      severity: "critical",
      headline: fmtPct(conversao),
      label: "Conversão",
      text: "Conversão baixa com alto volume de acionamentos. Verificar qualidade dos contatos.",
      rank: SEVERITY_RANK.critical,
    });
  }

  // Efetividade de caixa baixa — quanto da 1ª parcela combinada de fato entrou.
  // Gate qtd_acordos >= 20 pelo mesmo motivo do gate acima (base mínima).
  if (efetividadeCaixa < 30 && totals.qtd_acordos >= 20) {
    insights.push({
      ruleId: "insight_cash_effectiveness_low",
      category: "cash_effectiveness",
      severity: "critical",
      headline: fmtPct(efetividadeCaixa),
      label: "Efetividade de caixa",
      text: "Efetividade de caixa baixa: pouco da 1ª parcela combinada está entrando de fato.",
      rank: SEVERITY_RANK.critical,
    });
  }

  if (totals.qtd_excecoes > 10) {
    insights.push({
      ruleId: "insight_exception_spike",
      category: "exceptions",
      severity: "warning",
      headline: fmtNum(totals.qtd_excecoes),
      text: "Volume de exceções elevado hoje.",
      rank: SEVERITY_RANK.warning,
    });
  }

  if (ppRatio > 60) {
    insights.push({
      ruleId: "insight_first_installment_high",
      category: "first_installment",
      severity: "positive",
      headline: fmtPct(ppRatio),
      text: "1ª parcela alta: bom sinal de entrada de caixa.",
      rank: SEVERITY_RANK.positive,
    });
  } else if (ppRatio > 0 && ppRatio < 5) {
    insights.push({
      ruleId: "insight_first_installment_critical",
      category: "first_installment",
      severity: "critical",
      headline: fmtPct(ppRatio),
      text: "Desbalanceamento crítico da 1ª parcela vs. valor acordado.",
      rank: SEVERITY_RANK.critical,
    });
  } else if (ppRatio >= 5 && ppRatio < 10) {
    insights.push({
      ruleId: "insight_first_installment_warning",
      category: "first_installment",
      severity: "warning",
      headline: fmtPct(ppRatio),
      text: "1ª parcela abaixo do esperado. Verifique fluxo de caixa vs. parcelas futuras.",
      rank: SEVERITY_RANK.warning,
    });
  }

  if (projecaoMes !== undefined && projecaoMes > 0) {
    insights.push({
      ruleId: "insight_projection_month",
      category: "month_projection",
      severity: "positive",
      headline: fmtBRL(projecaoMes),
      text: "Projeção de 1ª parcela até fim do mês (extrapolação linear).",
      rank: SEVERITY_RANK.positive,
    });
  }

  if (concentracao > 70 && rows.length > 3) {
    insights.push({
      ruleId: "insight_concentration",
      category: "concentration",
      severity: "warning",
      headline: fmtPct(concentracao),
      text: "Top 3 agentes concentram o valor total.",
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
          headline: fmtPct(delta),
          text: `Realocar capacidade para ${winner.label}: conversão maior.`,
          anchor: "diagnostico-bu",
          rank: 3,
        });
      }
    }
  }

  if (excPct > 15) {
    actions.push({
      ruleId: "action_exception_review",
      severity: "action",
      headline: fmtPct(excPct),
      text: "Revisar política de exceções.",
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
    insight1: slot1 ? { text: slot1.text, severity: slot1.severity, headline: slot1.headline, label: slot1.label } : null,
    insight2: slot2 ? { text: slot2.text, severity: slot2.severity, headline: slot2.headline, label: slot2.label } : null,
    action,
    empty: false,
  };
}
