import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDelta } from "@/lib/metrics";

export type DeltaDirection = "up" | "down" | "flat";

interface KpiDeltaBadgeProps {
  value: number;
  direction: DeltaDirection;
  baselineLabel: string;
  /** invert semantic colors (e.g. CPC: down is good) */
  inverted?: boolean;
  className?: string;
}

const ICON = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: ArrowRight,
} as const;

export function KpiDeltaBadge({
  value,
  direction,
  baselineLabel,
  inverted = false,
  className,
}: KpiDeltaBadgeProps) {
  const Icon = ICON[direction];
  const positive = inverted ? direction === "down" : direction === "up";
  const negative = inverted ? direction === "up" : direction === "down";
  const tone =
    direction === "flat"
      ? "text-muted-foreground"
      : positive
        ? "text-success-fg"
        : negative
          ? "text-danger-fg"
          : "text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
        tone,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span>{formatDelta(value, direction)}</span>
      <span className="text-muted-foreground font-normal">vs {baselineLabel}</span>
    </span>
  );
}

export default KpiDeltaBadge;
