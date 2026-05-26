import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  fmtNum,
  fmtPct,
  formatBRLCompact,
  formatDelta,
} from "@/lib/metrics";
import { KpiDeltaBadge } from "./KpiDeltaBadge";

type Direction = "up" | "down" | "flat";

export interface HomeKpiPrimary {
  label: string;
  value: number | null;
  unit: "BRL" | "count";
  baseline?: {
    value: number;
    label: string;
    betterWhen: "up" | "down";
  };
}

export interface HomeKpiSecondary {
  label: string;
  value: number | null;
  unit: "BRL" | "percent" | "count";
  baseline?: {
    value: number;
    label: string;
    betterWhen: "up" | "down" | "flat";
  };
}

export interface HomeKpiStripProps {
  primary: HomeKpiPrimary[];
  secondary: HomeKpiSecondary[];
}

function deriveDirection(value: number): Direction {
  if (Math.abs(value) < 0.005) return "flat";
  return value > 0 ? "up" : "down";
}

function formatPrimaryValue(kpi: HomeKpiPrimary): string {
  if (kpi.value == null) return "—";
  if (kpi.unit === "BRL") return formatBRLCompact(kpi.value);
  return fmtNum(kpi.value);
}

function formatSecondaryValue(kpi: HomeKpiSecondary): string {
  if (kpi.value == null) return "—";
  if (kpi.unit === "BRL") return formatBRLCompact(kpi.value);
  if (kpi.unit === "percent") return fmtPct(kpi.value);
  if (kpi.value >= 10_000) {
    return `${(kpi.value / 1000).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}k`;
  }
  return fmtNum(kpi.value);
}

const ICON = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: ArrowRight,
} as const;

export function HomeKpiStrip({ primary, secondary }: HomeKpiStripProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {primary.map((kpi) => (
        <PrimaryCard key={kpi.label} kpi={kpi} />
      ))}
      {secondary.map((kpi) => (
        <SecondaryCard key={kpi.label} kpi={kpi} />
      ))}
    </div>
  );
}

function PrimaryCard({ kpi }: { kpi: HomeKpiPrimary }) {
  const unitLabel = kpi.unit === "BRL" ? "BRL" : "";
  const baseline = kpi.baseline;
  const direction = baseline ? deriveDirection(baseline.value) : null;

  return (
    <Card className="xl:col-span-2 min-w-0 rounded-lg border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {kpi.label}
        </span>
        {unitLabel ? (
          <span className="text-[11px] font-medium text-muted-foreground/70">
            {unitLabel}
          </span>
        ) : null}
      </div>
      <div className="mt-3 text-3xl md:text-4xl font-bold tabular-nums leading-none tracking-tight text-foreground">
        {formatPrimaryValue(kpi)}
      </div>
      <div className="mt-3">
        {baseline && direction ? (
          <KpiDeltaBadge
            value={baseline.value}
            direction={direction}
            baselineLabel={baseline.label}
            inverted={baseline.betterWhen === "down"}
          />
        ) : (
          <span className="block text-xs text-muted-foreground/60">—</span>
        )}
      </div>
    </Card>
  );
}

function SecondaryCard({ kpi }: { kpi: HomeKpiSecondary }) {
  const baseline = kpi.baseline;
  const direction = baseline ? deriveDirection(baseline.value) : null;
  const tone = baseline && direction ? deltaTone(direction, baseline.betterWhen) : "muted";
  const Icon = direction ? ICON[direction] : null;

  return (
    <Card className="xl:col-span-1 min-w-0 rounded-lg border-border bg-card p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {kpi.label}
      </div>
      <div className="mt-2 text-xl md:text-2xl font-semibold tabular-nums leading-none text-foreground">
        {formatSecondaryValue(kpi)}
      </div>
      <div className="mt-2 min-h-[1rem]">
        {baseline && direction && Icon ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-medium tabular-nums",
              toneClass(tone),
            )}
          >
            <Icon className="h-3 w-3" aria-hidden />
            <span>{formatDelta(baseline.value, direction)}</span>
            <span className="text-muted-foreground font-normal">
              vs {baseline.label}
            </span>
          </span>
        ) : null}
      </div>
    </Card>
  );
}

type Tone = "positive" | "critical" | "muted";

function deltaTone(direction: Direction, betterWhen: "up" | "down" | "flat"): Tone {
  if (direction === "flat") return "muted";
  if (betterWhen === "flat") return "muted";
  return direction === betterWhen ? "positive" : "critical";
}

function toneClass(tone: Tone): string {
  if (tone === "positive") return "text-success-fg";
  if (tone === "critical") return "text-danger-fg";
  return "text-muted-foreground";
}

export default HomeKpiStrip;
