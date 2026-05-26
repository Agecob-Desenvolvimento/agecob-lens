import { Card } from "@/components/ui/card";
import { fmtNum } from "@/lib/metrics";
import type { BoletoKpi } from "./analiseMocks";

interface BoletosKpiStripProps {
  kpis: BoletoKpi[];
}

export function BoletosKpiStrip({ kpis }: BoletosKpiStripProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {kpis.map((k, i) => (
        <Card key={i} className="px-4 py-3.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {k.label}
          </div>
          <div
            className="mt-1.5 text-2xl font-bold leading-none tabular-nums"
            style={{ color: k.color }}
          >
            {typeof k.value === "number" ? fmtNum(k.value) : k.value}
          </div>
          {k.sub && <div className="mt-1 text-[10px] text-muted-foreground">{k.sub}</div>}
        </Card>
      ))}
    </div>
  );
}

export default BoletosKpiStrip;
