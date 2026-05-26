import { ChartShell } from "@/components/executive/ChartShell";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtBRL } from "@/lib/metrics";

export interface HandoffTopAgentesRow {
  label: string;
  value: number;
}

interface HandoffTopAgentes1aParcelaProps {
  title?: string;
  rows: HandoffTopAgentesRow[];
  loading?: boolean;
  empty?: boolean;
}

const BAR_COLOR = "#10b981";

export function HandoffTopAgentes1aParcela({
  title = "Top 10 Agentes por 1ª Parcela",
  rows,
  loading,
  empty,
}: HandoffTopAgentes1aParcelaProps) {
  const max = rows.reduce((m, r) => (r.value > m ? r.value : m), 0);

  return (
    <ChartShell
      title={title}
      loading={loading}
      empty={empty || !rows.length}
      height={288}
    >
      {loading ? (
        <div className="space-y-2 mt-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-[22px] w-full" />
          ))}
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {rows.map((r) => {
            const pct = max > 0 ? (r.value / max) * 100 : 0;
            return (
              <div
                key={r.label}
                className="flex items-center gap-2.5 group opacity-[0.85] hover:opacity-100 transition-opacity"
              >
                <span
                  className="w-[130px] shrink-0 text-[12px] text-foreground/80 text-right truncate"
                  title={r.label}
                >
                  {r.label}
                </span>
                <div className="flex-1 h-[22px] bg-muted rounded-[3px] overflow-hidden">
                  <div
                    className="h-full rounded-[3px] transition-[width] duration-300"
                    style={{ width: `${pct}%`, background: BAR_COLOR }}
                  />
                </div>
                <span className="w-[90px] shrink-0 text-[12px] text-muted-foreground tabular-nums text-right">
                  {fmtBRL(r.value, { compact: true })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </ChartShell>
  );
}

export default HandoffTopAgentes1aParcela;
