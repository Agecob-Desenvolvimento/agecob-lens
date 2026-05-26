import { fmtNum, fmtPct, formatBRLCompact } from "@/lib/metrics";

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
}

function formatValue(kpi: KpiDatum): string {
  if (kpi.unit === "BRL") return formatBRLCompact(kpi.value, "full");
  if (kpi.unit === "%") return fmtPct(kpi.value);
  return fmtNum(kpi.value);
}

const LABEL_CLS =
  "text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground";

export function DetalhamentoKpiStrip({ primary, secondary }: DetalhamentoKpiStripProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2">
        {primary.map((kpi) => (
          <div
            key={kpi.id}
            className="rounded-lg border border-border bg-card"
            style={{ padding: "14px 16px" }}
          >
            <div className={LABEL_CLS}>{kpi.label}</div>
            <div className="mt-1.5 text-[26px] font-bold leading-none tabular-nums text-foreground">
              {formatValue(kpi)}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-2">
        {secondary.map((kpi) => (
          <div
            key={kpi.id}
            className="rounded-lg border border-border bg-card"
            style={{ padding: "12px 14px" }}
          >
            <div className={LABEL_CLS}>{kpi.label}</div>
            <div className="mt-1 text-xl font-semibold leading-none tabular-nums text-foreground">
              {formatValue(kpi)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DetalhamentoKpiStrip;
