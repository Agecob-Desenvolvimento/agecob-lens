import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtByUnit, formatBRLCompact } from "@/lib/metrics";
import type { ExecutiveKpi } from "@/types/executive";
import { cn } from "@/lib/utils";
import { KpiDeltaBadge } from "./KpiDeltaBadge";

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
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {primary.map((k) => (
          <KpiCard key={k.label} kpi={k} highlight />
        ))}
        {secondary.map((k) => (
          <KpiCard key={k.label} kpi={k} />
        ))}
      </div>
    </TooltipProvider>
  );
}

function KpiCard({ kpi, highlight }: { kpi: ExecutiveKpi; highlight?: boolean }) {
  const TrendIcon = kpi.trend ? TREND_ICON[kpi.trend] : null;
  const unitLabel = kpi.unit === "BRL" ? "BRL" : kpi.unit === "%" ? "%" : "";
  return (
    <Card
      className={cn(
        "min-w-0 rounded-lg border-border bg-card",
        highlight ? "col-span-2 p-5" : "col-span-1 p-4",
      )}
    >
      <CardHeader className="p-0 mb-0 flex flex-row items-center justify-between space-y-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <CardTitle
              className={cn(
                "font-semibold uppercase tracking-[0.12em] leading-tight truncate cursor-default",
                highlight ? "text-[11px] text-muted-foreground" : "text-[10px] text-muted-foreground",
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
        {unitLabel && (
          <span className="text-[11px] font-medium text-muted-foreground/70 shrink-0">
            {unitLabel}
          </span>
        )}
      </CardHeader>
      <CardContent className="p-0 space-y-2">
        <div className={cn("flex items-end justify-between gap-2", highlight ? "mt-3" : "mt-2") }>
          <span
            className={cn(
              "block font-bold tabular-nums leading-none tracking-tight text-foreground",
              highlight ? "text-3xl md:text-4xl" : "text-xl md:text-2xl font-semibold",
            )}
          >
            {kpi.unit === "BRL" ? formatBRLCompact(kpi.value) : fmtByUnit(kpi.value, kpi.unit)}
          </span>
          {TrendIcon && !kpi.delta && (
            <TrendIcon
              className={cn(
                "h-4 w-4 shrink-0",
                kpi.trend === "up" && "text-success",
                kpi.trend === "down" && "text-danger",
                kpi.trend === "stable" && "text-muted-foreground",
              )}
            />
          )}
        </div>
        {kpi.delta ? (
          <KpiDeltaBadge
            value={kpi.delta.value}
            direction={kpi.delta.direction}
            baselineLabel={kpi.delta.baselineLabel}
            inverted={kpi.delta.inverted}
          />
        ) : (
          <span className="block text-xs text-muted-foreground/60">—</span>
        )}
      </CardContent>
    </Card>
  );
}

export default ExecutiveKpiStrip;
