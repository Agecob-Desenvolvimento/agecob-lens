/**
 * Pure transforms for executive metrics. No I/O, no React.
 *
 * Most formulas live in @/lib/metrics. This file re-exports them under the
 * names mandated by Onda D (TASKS.md §"Onda D — Integração Backend") and
 * adds ergonomic helpers (percent⇄fraction, date parsing, CPC/ticket aliases
 * that accept raw row pairs instead of MetricTotals).
 */

export {
  calcCpc,
  calcConversao,
  calcTicketMedio,
  calcExcecoesPctValor,
  calcExcecoesPctQtd,
  formatBRLCompact,
  formatBRLCompact as formatBRL,
  fmtBRL,
  fmtNum,
  fmtPct,
  formatDelta,
} from "@/lib/metrics";

export function calcCPC(qtdContatos: number, qtdAcionamentos: number): number {
  if (!Number.isFinite(qtdAcionamentos) || qtdAcionamentos <= 0) return 0;
  return qtdContatos / qtdAcionamentos;
}

export function calcTicket(valorAcordos: number, qtdAcordos: number): number {
  if (!Number.isFinite(qtdAcordos) || qtdAcordos <= 0) return 0;
  return valorAcordos / qtdAcordos;
}

/** Backend devolve percentuais em 0–100. Converte para fração 0–1. */
export function pctToFraction(pct: number | null | undefined): number {
  if (pct == null || Number.isNaN(pct)) return 0;
  return pct / 100;
}

/** Inverso: fração 0–1 → 0–100. */
export function fractionToPct(frac: number | null | undefined): number {
  if (frac == null || Number.isNaN(frac)) return 0;
  return frac * 100;
}

/**
 * Parse de datas vindas do backend. Formatos observados:
 *   - "YYYY-MM-DD"
 *   - "YYYY-MM-DDTHH:mm:ss" (com/sem timezone)
 *   - null / "" / inválido → null
 */
export function parseDateBackend(input: string | null | undefined): Date | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const parsed = dateOnly ? new Date(`${s}T00:00:00`) : new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
