import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { usePeriodicBlink } from "@/hooks/usePeriodicBlink";
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
  unit: "BRL" | "count" | "percent";
  baseline?: {
    value: number;
    label: string;
    betterWhen: "up" | "down";
    /** previous-period absolute value, shown as "· R$ 1,44 mi" suffix */
    baselineValue?: number;
  };
  /** internal benchmarks shown as reference lines */
  benchmarks?: { value: number; label: string }[];
}

export interface HomeKpiSecondary {
  label: string;
  value: number | null;
  unit: "BRL" | "percent" | "count";
  baseline?: {
    value: number;
    label: string;
    betterWhen: "up" | "down" | "flat";
    /** absolute reference value (e.g. office mean), shown as "(24,7%)" after the label */
    baselineValue?: number;
  };
  /** plain descriptive text shown when there is no comparative baseline */
  caption?: string;
  /** internal benchmarks shown as reference lines */
  benchmarks?: { value: number; label: string }[];
  /**
   * Fração-base do indicador (num/den) no tooltip. `unit` "count" (default) mostra
   * inteiros e dispara aviso de base reduzida quando den < 30; "value" mostra BRL
   * e não dispara aviso (base reduzida é conceito de amostra/contagem).
   */
  base?: { num: number; den: number; noun: string; unit?: "count" | "value" };
}

export interface HomeKpiStripProps {
  primary: HomeKpiPrimary[];
  secondary: HomeKpiSecondary[];
  /** Labels dos cards (primary ou secondary) que devem abrir a sidebar de detalhe. */
  clickableLabels?: string[];
  onKpiClick?: (label: string) => void;
}

function deriveDirection(value: number): Direction {
  if (Math.abs(value) < 0.005) return "flat";
  return value > 0 ? "up" : "down";
}

function formatPrimaryValue(kpi: HomeKpiPrimary): string {
  if (kpi.value == null) return "—";
  if (kpi.unit === "BRL") return formatBRLCompact(kpi.value);
  if (kpi.unit === "percent") return fmtPct(kpi.value);
  return fmtNum(kpi.value);
}

function formatUnitValue(unit: HomeKpiSecondary["unit"], v: number): string {
  if (unit === "BRL") return formatBRLCompact(v);
  if (unit === "percent") return fmtPct(v);
  return fmtNum(v);
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

export function HomeKpiStrip({ primary, secondary, clickableLabels, onKpiClick }: HomeKpiStripProps) {
  const blink = usePeriodicBlink();
  const clickFor = (label: string) =>
    onKpiClick && clickableLabels?.includes(label) ? () => onKpiClick(label) : undefined;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {primary.map((kpi) => {
          const onClick = clickFor(kpi.label);
          return <PrimaryCard key={kpi.label} kpi={kpi} onClick={onClick} blink={!!onClick && blink} />;
        })}
        {secondary.map((kpi) => {
          const onClick = clickFor(kpi.label);
          return <SecondaryCard key={kpi.label} kpi={kpi} onClick={onClick} blink={!!onClick && blink} />;
        })}
      </div>
    </div>
  );
}

function PrimaryCard({ kpi, onClick, blink }: { kpi: HomeKpiPrimary; onClick?: () => void; blink?: boolean }) {
  const unitLabel = kpi.unit === "BRL" ? "BRL" : "";
  const baseline = kpi.baseline;
  const direction = baseline ? deriveDirection(baseline.value) : null;

  return (
    <Card
      className={cn(
        "xl:col-span-2 min-w-0 rounded-lg border-border bg-card p-5 transition-all duration-300",
        onClick && "cursor-pointer hover:bg-muted/50",
        blink && "ring-2 ring-sky-400 ring-offset-1",
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
    >
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
          <div className="flex items-center gap-2">
            <KpiDeltaBadge
              value={baseline.value}
              direction={direction}
              baselineLabel={baseline.label}
              inverted={baseline.betterWhen === "down"}
            />
            {baseline.baselineValue != null ? (
              <span className="text-xs text-muted-foreground">
                · {formatBRLCompact(baseline.baselineValue)}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="block text-xs text-muted-foreground/60">—</span>
        )}
      </div>
      {kpi.benchmarks?.length ? (
        <div className="mt-1 space-y-0.5">
          {kpi.benchmarks.map((b) => (
            <BenchmarkLine key={b.label} value={kpi.value} benchmark={b} betterWhen={baseline?.betterWhen} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function SecondaryCard({ kpi, onClick, blink }: { kpi: HomeKpiSecondary; onClick?: () => void; blink?: boolean }) {
  const baseline = kpi.baseline;
  const direction = baseline ? deriveDirection(baseline.value) : null;
  const tone = baseline && direction ? deltaTone(direction, baseline.betterWhen) : "muted";
  const Icon = direction ? ICON[direction] : null;
  const base = kpi.base;
  const baseIsValue = base?.unit === "value";
  const fmtBase = (v: number) => (baseIsValue ? formatBRLCompact(v) : fmtNum(v));
  const baseTooltip = base ? `Base: ${fmtBase(base.num)} / ${fmtBase(base.den)} ${base.noun}` : undefined;
  const baseReduzida = base != null && !baseIsValue && base.den > 0 && base.den < 30;

  return (
    <Card
      className={cn(
        "xl:col-span-1 min-w-0 rounded-lg border-border bg-card p-4 transition-all duration-300",
        onClick && "cursor-pointer hover:bg-muted/50",
        blink && "ring-2 ring-sky-400 ring-offset-1",
      )}
      title={baseTooltip}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {kpi.label}
      </div>
      <div className="mt-2 text-xl md:text-2xl font-semibold tabular-nums leading-none text-foreground">
        {formatSecondaryValue(kpi)}
      </div>
      <div className="mt-2 min-h-[1rem] space-y-0.5">
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
              {baseline.baselineValue != null
                ? ` (${formatUnitValue(kpi.unit, baseline.baselineValue)})`
                : ""}
            </span>
          </span>
        ) : null}
        {kpi.caption ? (
          <div className="text-[10px] text-muted-foreground/70 mt-0.5">{kpi.caption}</div>
        ) : null}
        {baseReduzida ? (
          <div className="text-[10px] font-medium text-amber-600 mt-0.5">
            ⚠ Base reduzida ({fmtNum(base!.den)} {base!.noun})
          </div>
        ) : null}
        {kpi.benchmarks?.length
          ? kpi.benchmarks.map((b) => (
              <BenchmarkLine key={b.label} value={kpi.value} benchmark={b} betterWhen={baseline?.betterWhen} />
            ))
          : null}
      </div>
    </Card>
  );
}

function BenchmarkLine({
  value,
  benchmark,
  betterWhen,
}: {
  value: number | null;
  benchmark: { value: number; label: string };
  betterWhen?: "up" | "down" | "flat";
}) {
  const above =
    betterWhen === "down"
      ? value != null && value <= benchmark.value
      : value != null && value >= benchmark.value;
  return (
    <div
      title="Referência interna — calculada sobre o histórico de 9 meses por banco."
      className={cn("text-[10px] font-medium", above ? "text-success-fg" : "text-amber-600")}
    >
      {benchmark.label}: {fmtPct(benchmark.value)}
    </div>
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