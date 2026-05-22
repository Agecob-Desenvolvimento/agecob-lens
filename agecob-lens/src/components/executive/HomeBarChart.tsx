import { ChartShell } from "@/components/executive/ChartShell";
import { Skeleton } from "@/components/ui/skeleton";

export interface HomeBarDatum {
  label: string;
  value: number;
}

interface HomeBarChartProps {
  title: string;
  data: HomeBarDatum[];
  color?: string;
  formatValue: (v: number) => string;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function HomeBarChart({
  title,
  data,
  color = "hsl(var(--primary))",
  formatValue,
  loading,
  emptyMessage,
  className,
}: HomeBarChartProps) {
  const max = data.reduce((m, d) => (d.value > m ? d.value : m), 0);

  return (
    <ChartShell
      className={className}
      contentClassName="p-5 pt-0"
      title={title}
      empty={!loading && data.length === 0}
      emptyMessage={emptyMessage}
    >
      {loading ? (
        <div className="space-y-2 mt-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-1.5">
          {data.map((d) => {
            const pct = max > 0 ? (d.value / max) * 100 : 0;
            return (
              <div key={d.label} className="flex items-center gap-2.5">
                <span
                  className="w-32 shrink-0 text-[12px] text-foreground/80 text-right truncate"
                  title={d.label}
                >
                  {d.label}
                </span>
                <div className="flex-1 h-[22px] bg-muted rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm transition-[width] duration-300"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
                <span className="w-24 shrink-0 text-[12px] text-muted-foreground tabular-nums text-right">
                  {formatValue(d.value)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </ChartShell>
  );
}

export default HomeBarChart;
