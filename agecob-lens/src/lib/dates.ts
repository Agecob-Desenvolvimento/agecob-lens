export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function firstOfMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function lastOfMonthStr(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

function fmtLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Feriados nacionais + pontos facultativos seguidos nacionalmente por bancos e
 * órgãos federais (2026). Movimentação bancária cai nesses dias, então não contam
 * como dia útil nem servem de baseline de comparação.
 */
export const HOLIDAYS_2026 = new Set<string>([
  "2026-01-01", // Confraternização Universal
  "2026-02-16", // Carnaval
  "2026-02-17", // Carnaval
  "2026-02-18", // Quarta-feira de Cinzas
  "2026-04-03", // Paixão de Cristo
  "2026-04-21", // Tiradentes
  "2026-05-01", // Dia do Trabalho
  "2026-06-04", // Corpus Christi
  "2026-09-07", // Independência
  "2026-10-12", // Nossa Senhora Aparecida
  "2026-11-02", // Finados
  "2026-11-20", // Consciência Negra
  "2026-12-25", // Natal
]);

/** Dia útil = não é fim de semana nem feriado nacional. */
export function isBusinessDay(d: Date): boolean {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !HOLIDAYS_2026.has(fmtLocal(d));
}

/** Count business days (Mon-Fri, excluding holidays) in [fromIso, toIso] inclusive. */
export function countBusinessDays(fromIso: string, toIso: string): number {
  const start = new Date(`${fromIso}T00:00:00`);
  const end = new Date(`${toIso}T00:00:00`);
  let n = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (isBusinessDay(d)) n++;
  }
  return n;
}

/**
 * Calendar-month-offset window: subtract one month from both dates.
 * A period 25-May to 01-Jun compares against 25-Apr to 01-May.
 * Month boundaries are clamped (31 Mar → 28/29 Feb, 31 May → 30 Apr, etc.).
 */
export function previousPeriod(fromIso: string, toIso: string): { from: string; to: string } {
  const from = new Date(`${fromIso}T00:00:00`);
  const to = new Date(`${toIso}T00:00:00`);
  const prevFrom = _subtractOneMonth(from);
  const prevTo = _subtractOneMonth(to);
  return { from: fmtLocal(prevFrom), to: fmtLocal(prevTo) };
}

/** Subtract exactly one calendar month, clamping the day to the last valid day of the target month. */
function _subtractOneMonth(d: Date): Date {
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-based
  const day = d.getDate();

  const targetYear = month === 0 ? year - 1 : year;
  const targetMonth = month === 0 ? 11 : month - 1;

  // Last day of the target month
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return new Date(targetYear, targetMonth, Math.min(day, lastDay));
}