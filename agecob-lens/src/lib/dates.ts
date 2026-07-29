const MES_NOMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** "202607" → "Julho 2026" */
export function formatMesLabel(mes: string): string {
  const ano = mes.slice(0, 4);
  const m = Number(mes.slice(4, 6));
  const nome = MES_NOMES[m - 1];
  return nome ? `${nome} ${ano}` : mes;
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Dia útil anterior a hoje (pula fim de semana e feriado) — base do "vs ontem". */
export function previousBusinessDayStr(): string {
  const d = new Date();
  do {
    d.setDate(d.getDate() - 1);
  } while (!isBusinessDay(d));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Mês corrente no formato do PDF de metas ("202607"). */
export function currentMonthKey(): string {
  return todayStr().slice(0, 7).replace("-", "");
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
 * Calendar-month-offset window.
 * - Single day: maps to the same business-day position in the previous month
 *   (e.g. 6th biz day of June → 6th biz day of May).
 * - Multi-day range: subtracts one calendar month from both dates.
 */
export function previousPeriod(fromIso: string, toIso: string): { from: string; to: string } {
  const from = new Date(`${fromIso}T00:00:00`);
  return fromIso === toIso
    ? { from: fmtLocal(_sameBizDayPrevMonth(from)), to: fmtLocal(_sameBizDayPrevMonth(from)) }
    : { from: fmtLocal(_subtractOneMonth(from)), to: fmtLocal(_subtractOneMonth(new Date(`${toIso}T00:00:00`))) };
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

/**
 * Find the same business-day position (1st, 2nd, ... Nth) in the previous month.
 * If the given date is not a business day, uses the count of business days
 * up to and including that date as N (holidays/weekends don't increment N).
 * Falls back to the last business day of the target month if it has fewer.
 */
function _sameBizDayPrevMonth(d: Date): Date {
  // Count N = position of this business day (or last biz day ≤ d) in current month
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
  let n = 0;
  for (let c = new Date(monthStart); c <= d; c.setDate(c.getDate() + 1)) {
    if (isBusinessDay(c)) n++;
  }

  // Target = previous month
  const targetYear = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
  const targetMonth = d.getMonth() === 0 ? 11 : d.getMonth() - 1;
  const targetEnd = new Date(targetYear, targetMonth + 1, 0);

  // Find Nth business day in target month
  let found = 0;
  for (let c = new Date(targetYear, targetMonth, 1); c <= targetEnd; c.setDate(c.getDate() + 1)) {
    if (isBusinessDay(c)) {
      found++;
      if (found === n) return new Date(c);
    }
  }

  // Target month has fewer business days → return its last business day
  for (let c = new Date(targetEnd); c >= new Date(targetYear, targetMonth, 1); c.setDate(c.getDate() - 1)) {
    if (isBusinessDay(c)) return new Date(c);
  }
  return new Date(targetYear, targetMonth, 1);
}