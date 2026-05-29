import { fmtNum, fmtPct, formatBRLCompact } from "@/lib/metrics";
import { cn } from "@/lib/utils";

export type KpiUnit = "BRL" | "%" | "count";

export interface KpiDatum {
  id: string;
  label: string;
  value: number;
  unit: KpiUnit;
}

export interface DetalhamentoKpiStripProps {
  primary: KpiDatum[];
  secondary: KpiDatum[];
  /** Fractional deltas vs previous period. Key = KPI id, value = fraction (-0.12 = -12%). */
  deltas?: Record<string, number>;
}

function formatValue(kpi: KpiDatum): string {
  if (kpi.unit === "BRL") return formatBRLCompact(kpi.value, "full");
  if (kpi.unit === "%") return fmtPct(kpi.value);
  return fmtNum(kpi.value);
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="text-[10px] text-muted-foreground tabular-nums">→ 0%</span>
    );
  }
  const up = delta > 0;
  const absPct = Math.round(Math.abs(delta) * 100);
  const color = up ? "text-success-fg" : "text-danger-fg";
  const arrow = up ? "↑" : "↓";
  return (
    <span className={cn("text-[10px] font-semibold tabular-nums", color)}>
      {arrow} {absPct}%
    </span>
  );
}

const LABEL_CLS =
  "text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground";

export function DetalhamentoKpiStrip({ primary, secondary, deltas }: DetalhamentoKpiStripProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2">
        {primary.map((kpi) => {
          const d = deltas?.[kpi.id];
          return (
            <div
              key={kpi.id}
              className="rounded-lg border border-border bg-card"
              style={{ padding: "14px 16px" }}
            >
              <div className={LABEL_CLS}>{kpi.label}</div>
              <div className="mt-1.5 text-[26px] font-bold leading-none tabular-nums text-foreground">
                {formatValue(kpi)}
              </div>
              {d !== undefined && (
                <div className="mt-0.5">
                  <DeltaBadge delta={d} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-6 gap-2">
        {secondary.map((kpi) => {
          const d = deltas?.[kpi.id];
          return (
            <div
              key={kpi.id}
              className="rounded-lg border border-border bg-card"
              style={{ padding: "12px 14px" }}
            >
              <div className={LABEL_CLS}>{kpi.label}</div>
              <div className="mt-1 text-xl font-semibold leading-none tabular-nums text-foreground">
                {formatValue(kpi)}
              </div>
              {d !== undefined && (
                <div className="mt-0.5">
                  <DeltaBadge delta={d} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DetalhamentoKpiStrip;
