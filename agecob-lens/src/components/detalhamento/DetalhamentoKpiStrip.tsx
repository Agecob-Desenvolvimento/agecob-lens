import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { fmtNum, fmtPct, formatBRLCompact } from "@/lib/metrics";
import { KpiDeltaBadge, type DeltaDirection } from "@/components/executive/KpiDeltaBadge";
import { usePeriodicBlink } from "@/hooks/usePeriodicBlink";
import { cn } from "@/lib/utils";

/** KPI ids where a falling value is good (delta colors invert). */
const INVERTED_DELTA_IDS = new Set([
  "qtd_excecoes",
  "valor_excecoes",
  "qtd_rejeitados",
  "valor_rejeitados",
  "idade_media",
]);

function deltaDirection(delta: number): DeltaDirection {
  if (Math.abs(delta) < 0.01) return "flat";
  return delta > 0 ? "up" : "down";
}

export type KpiUnit = "BRL" | "%" | "count";

export interface KpiDatum {
  id: string;
  label: string;
  /** null = não computável neste escopo (ex.: razão de esforço sob filtro de carteira). */
  value: number | null;
  unit: KpiUnit;
}

/** Internal reference (office average) for the green/amber benchmark sub-line. */
export interface KpiBenchmark {
  ref: number;
  betterWhen: "up" | "down";
}

export interface DetalhamentoKpiStripProps {
  primary: KpiDatum[];
  secondary: KpiDatum[];
  /** Fractional deltas vs previous period. Key = KPI id, value = fraction (-0.12 = -12%). */
  deltas?: Record<string, number>;
  /** Office-average reference per KPI id. Renders a green/amber sub-line. */
  benchmarks?: Record<string, KpiBenchmark>;
  /** Ids dos cards que abrem a sidebar de detalhe (clicáveis + pulso). */
  clickableIds?: string[];
  onCardClick?: (id: string) => void;
}

function formatValue(kpi: KpiDatum): string {
  // Sem isto, fmtPct(null) faz null.toLocaleString() e derruba o render. O projeto
  // compila com strictNullChecks: false, então o tsc não pega.
  if (kpi.value === null) return "—";
  if (kpi.unit === "BRL") return formatBRLCompact(kpi.value, "full");
  if (kpi.unit === "%") return fmtPct(kpi.value);
  return fmtNum(kpi.value);
}

function formatByUnit(value: number, unit: KpiUnit): string {
  if (unit === "BRL") return formatBRLCompact(value, "full");
  if (unit === "%") return fmtPct(value);
  return fmtNum(value);
}

function BenchmarkLine({ kpi, bench }: { kpi: KpiDatum; bench: KpiBenchmark }) {
  const above = bench.betterWhen === "down" ? kpi.value <= bench.ref : kpi.value >= bench.ref;
  return (
    <div
      title="Referência interna — média do escritório no período."
      className={cn("text-[10px] font-medium", above ? "text-success-fg" : "text-amber-600 dark:text-amber-400")}
    >
      Média: {formatByUnit(bench.ref, kpi.unit)}
    </div>
  );
}

const LABEL_CLS =
  "text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground";

interface KpiCardProps {
  kpi: KpiDatum;
  delta?: number;
  bench?: KpiBenchmark;
  tier: "primary" | "secondary";
  onClick?: () => void;
  blink?: boolean;
}

function KpiCard({ kpi, delta, bench, tier, onClick, blink }: KpiCardProps) {
  const primary = tier === "primary";
  return (
    <div
      className={cn(
        "rounded-lg border border-border transition-all duration-300",
        primary ? "bg-card" : "bg-muted/30 hover:bg-card",
        onClick && "cursor-pointer hover:bg-muted/50",
        blink && "ring-2 ring-sky-400 ring-offset-1",
      )}
      style={{ padding: primary ? "14px 16px" : "10px 12px" }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
    >
      <div className={LABEL_CLS}>{kpi.label}</div>
      <div
        className={cn(
          "leading-none tabular-nums text-foreground",
          primary ? "mt-1.5 text-[26px] font-bold" : "mt-1 text-lg font-semibold",
        )}
      >
        {formatValue(kpi)}
      </div>
      {kpi.value !== null && (delta !== undefined || bench) && (
        <div className="mt-0.5 space-y-0.5">
          {delta !== undefined && (
            <KpiDeltaBadge
              value={delta}
              direction={deltaDirection(delta)}
              baselineLabel="período anterior"
              inverted={INVERTED_DELTA_IDS.has(kpi.id)}
            />
          )}
          {bench && kpi.value !== null && <BenchmarkLine kpi={kpi} bench={bench} />}
        </div>
      )}
    </div>
  );
}

export function DetalhamentoKpiStrip({ primary, secondary, deltas, benchmarks, clickableIds, onCardClick }: DetalhamentoKpiStripProps) {
  const [showSecondary, setShowSecondary] = useState(false);
  const blink = usePeriodicBlink();
  const clickFor = (id: string) =>
    onCardClick && clickableIds?.includes(id) ? () => onCardClick(id) : undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2">
        {primary.map((kpi) => {
          const onClick = clickFor(kpi.id);
          return (
            <KpiCard
              key={kpi.id}
              kpi={kpi}
              delta={deltas?.[kpi.id]}
              bench={benchmarks?.[kpi.id]}
              tier="primary"
              onClick={onClick}
              blink={!!onClick && blink}
            />
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowSecondary((v) => !v)}
        className="flex items-center gap-1.5 self-start text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={showSecondary}
      >
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", showSecondary && "rotate-180")}
          aria-hidden
        />
        Mais métricas ({secondary.length})
      </button>

      {showSecondary && (
        <div className="grid grid-cols-6 gap-2">
          {secondary.map((kpi) => {
            const onClick = clickFor(kpi.id);
            return (
              <KpiCard
                key={kpi.id}
                kpi={kpi}
                delta={deltas?.[kpi.id]}
                bench={benchmarks?.[kpi.id]}
                tier="secondary"
                onClick={onClick}
                blink={!!onClick && blink}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default DetalhamentoKpiStrip;
