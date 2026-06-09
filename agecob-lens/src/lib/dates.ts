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

/** Step back to the last business day (skip Sat/Sun + feriados). */
function lastBusinessDayOnOrBefore(d: Date): Date {
  const r = new Date(d);
  while (!isBusinessDay(r)) r.setDate(r.getDate() - 1);
  return r;
}

/**
 * Equal-length window before [fromIso, toIso], ending on the last business day
 * strictly before `from` (so a Monday compares against Friday, not Sunday).
 */
export function previousPeriod(fromIso: string, toIso: string): { from: string; to: string } {
  const dayMs = 86_400_000;
  const from = new Date(`${fromIso}T00:00:00`);
  const to = new Date(`${toIso}T00:00:00`);
  const days = Math.round((to.getTime() - from.getTime()) / dayMs) + 1;
  const prevTo = lastBusinessDayOnOrBefore(new Date(from.getTime() - dayMs));
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * dayMs);
  return { from: fmtLocal(prevFrom), to: fmtLocal(prevTo) };
}
