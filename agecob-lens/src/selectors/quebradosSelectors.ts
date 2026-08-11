import type { QuebradoDetalheRow } from "@/services/api";
import type { AcordoQuebrado } from "@/components/analise/BoletosQuebradosChart";

/** Whole days between an ISO date (yyyy-mm-dd) and the reference date. */
function daysSince(iso: string | null, today: Date): number | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const ref = new Date(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}T00:00:00`);
  return Math.round((ref.getTime() - d.getTime()) / 86_400_000);
}

/** Heuristic risk from days overdue — NOT a model output. Surfaced as estimate in UI. */
function estimateRisco(diasAtraso: number | null): {
  perfilRisco: AcordoQuebrado["perfilRisco"];
  previsaoQuebra: boolean;
  motivo: string;
} {
  if (diasAtraso == null) {
    return { perfilRisco: "medio", previsaoQuebra: false, motivo: "Sem data de vencimento para estimar atraso." };
  }
  if (diasAtraso >= 30) {
    return { perfilRisco: "alto", previsaoQuebra: true, motivo: `Estimativa por atraso: ${diasAtraso} dias desde o vencimento.` };
  }
  if (diasAtraso >= 8) {
    return { perfilRisco: "medio", previsaoQuebra: diasAtraso >= 15, motivo: `Estimativa por atraso: ${diasAtraso} dias desde o vencimento.` };
  }
  return { perfilRisco: "baixo", previsaoQuebra: false, motivo: `Estimativa por atraso: ${diasAtraso} dias desde o vencimento.` };
}

/**
 * Maps backend quebrados-detalhe rows to the rich AcordoQuebrado card shape.
 * Risk/prediction/reason are heuristics over days overdue (labeled in the UI);
 * structural fields with no source (parcelas, dívida original, data quebra) are null.
 */
export function mapAcordosQuebrados(
  rows: QuebradoDetalheRow[],
  portfolio: string,
  today: Date = new Date(),
  valueField: "valor_total" | "valor_primeira_parcela" = "valor_total",
): AcordoQuebrado[] {
  return rows.map((r) => {
    const diasAtraso = daysSince(r.data_vencimento, today);
    const { perfilRisco, previsaoQuebra, motivo } = estimateRisco(diasAtraso);
    return {
      id: `${r.NR_RECEBIMENTO}/${r.ID_CARTEIRA}`,
      portfolio: r.portfolio_name ?? portfolio,
      devedor: r.nome_devedor,
      agente: r.agente,
      mat: r.matricula ?? "—",
      dataAcordo: r.data_acordo ?? "—",
      dataQuebra: r.data_quebra ?? "—",
      valorAcordo: Number(r[valueField]) || 0,
      parcelas: Number(r.total_parcelas) || null,
      parcelaPaga: r.parcelas_pagas ?? null,
      cpf: r.cpf_mask,
      valorDivida: r.divida_original != null ? Number(r.divida_original) : null,
      diasAtraso: diasAtraso ?? 0,
      perfilRisco,
      previsaoQuebra,
      motivo,
    };
  });
}