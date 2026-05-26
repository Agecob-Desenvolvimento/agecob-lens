// TODO: backend endpoint /dashboard/primeira-parcela-por-portfolio/{db} not yet available
import { ChartShell } from "@/components/executive/ChartShell";
import { formatBRLCompact } from "@/lib/metrics";

export interface HandoffPortfolioRow {
  label: string;
  value: number;
}

interface HandoffPortfolio1aParcelaProps {
  rows: HandoffPortfolioRow[];
  title?: string;
  loading?: boolean;
  empty?: boolean;
}

const BAR_COLOR = "#3b82f6";

export function HandoffPortfolio1aParcela({
  rows,
  title = "Valor 1ª Parcela de Acordos por Portfólio",
  loading,
  empty,
}: HandoffPortfolio1aParcelaProps) {
  const isEmpty = empty || rows.length === 0;
  const max = rows.reduce((acc, r) => (r.value > acc ? r.value : acc), 0);

  return (
    <ChartShell title={title} loading={loading} empty={isEmpty} height={288}>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const pct = max > 0 ? (row.value / max) * 100 : 0;
          return (
            <li
              key={row.label}
              className="flex items-center gap-3 text-xs"
              data-testid="portfolio-row"
            >
              <span
                className="w-[130px] shrink-0 truncate text-slate-700"
                title={row.label}
              >
                {row.label}
              </span>
              <div className="flex-1 h-[22px] bg-slate-100 rounded-[3px] overflow-hidden">
                <div
                  className="h-full rounded-[3px] opacity-[0.85] transition-opacity hover:opacity-100"
                  style={{ width: `${pct}%`, background: BAR_COLOR }}
                />
              </div>
              <span className="w-[90px] shrink-0 text-right tabular-nums font-semibold text-slate-800">
                {formatBRLCompact(row.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </ChartShell>
  );
}

export default HandoffPortfolio1aParcela;
