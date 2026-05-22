import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
  emptyMessage = "Sem dados no período.",
  className,
}: HomeBarChartProps) {
  const max = data.reduce((m, d) => (d.value > m ? d.value : m), 0);

  return (
    <Card className={cn("min-w-0", className)}>
      <CardContent className="p-5">
        <h4 className="m-0 text-sm font-semibold text-foreground">{title}</h4>
        <div className="mt-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : data.length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
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
        </div>
      </CardContent>
    </Card>
  );
}

export default HomeBarChart;
