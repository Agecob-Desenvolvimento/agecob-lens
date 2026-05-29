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

/** Step back to the last business day (skip Sat/Sun). Holidays not handled. */
function lastBusinessDayOnOrBefore(d: Date): Date {
  const r = new Date(d);
  while (r.getDay() === 0 || r.getDay() === 6) r.setDate(r.getDate() - 1);
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
