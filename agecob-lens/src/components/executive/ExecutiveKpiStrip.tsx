import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtByUnit } from "@/lib/metrics";
import type { ExecutiveKpi } from "@/types/executive";
import { cn } from "@/lib/utils";

interface ExecutiveKpiStripProps {
  kpis: ExecutiveKpi[];
  loading?: boolean;
  error?: string | null;
}

const TREND_ICON = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  stable: ArrowRight,
} as const;

export function ExecutiveKpiStrip({ kpis, loading, error }: ExecutiveKpiStripProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="py-3 flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </CardContent>
      </Card>
    );
  }

  if (!kpis.length) {
    return (
      <Card>
        <CardContent className="py-3 text-sm text-muted-foreground">
          Dados não disponíveis.
        </CardContent>
      </Card>
    );
  }

  const primary = kpis.filter((k) => k.priority === "primary");
  const secondary = kpis.filter((k) => k.priority === "secondary");

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3">
        {primary.length > 0 && (
          <div className={cn("grid gap-3 grid-cols-2", `md:grid-cols-${Math.min(primary.length, 6)}`)}>
            {primary.map((k) => (
              <KpiCard key={k.label} kpi={k} highlight />
            ))}
          </div>
        )}
        {secondary.length > 0 && (
          <div className={cn("grid gap-3 grid-cols-2 md:grid-cols-3", secondary.length >= 4 ? "xl:grid-cols-6" : `xl:grid-cols-${secondary.length}`)}>
            {secondary.map((k) => (
              <KpiCard key={k.label} kpi={k} />
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function KpiCard({ kpi, highlight }: { kpi: ExecutiveKpi; highlight?: boolean }) {
  const TrendIcon = kpi.trend ? TREND_ICON[kpi.trend] : null;
  return (
    <Card
      className={cn(
        "min-w-0 transition-shadow",
        highlight ? "border-primary/40 shadow-sm" : "",
      )}
    >
      <CardHeader className="pb-1 pt-3 px-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <CardTitle
              className={cn(
                "text-xs font-semibold uppercase tracking-wide leading-tight truncate cursor-default",
                highlight ? "text-black dark:text-white" : "text-muted-foreground",
              )}
            >
              {kpi.label}
            </CardTitle>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {kpi.formula ? <p className="font-mono">{kpi.formula}</p> : null}
            {kpi.hint ? <p className="text-muted-foreground mt-1">{kpi.hint}</p> : null}
            {!kpi.formula && !kpi.hint ? <p>{kpi.label}</p> : null}
          </TooltipContent>
        </Tooltip>
      </CardHeader>
      <CardContent className="px-3 pb-3 flex items-end justify-between gap-2">
        <span
          className={cn(
            "block font-bold tabular-nums truncate",
            highlight ? "text-2xl md:text-3xl text-foreground" : "text-xl text-foreground",
          )}
        >
          {fmtByUnit(kpi.value, kpi.unit)}
        </span>
        {TrendIcon && (
          <TrendIcon
            className={cn(
              "h-4 w-4 shrink-0",
              kpi.trend === "up" && "text-emerald-500",
              kpi.trend === "down" && "text-rose-500",
              kpi.trend === "stable" && "text-muted-foreground",
            )}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default ExecutiveKpiStrip;
