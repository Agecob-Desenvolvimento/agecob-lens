import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtNum } from "@/lib/metrics";
import type { BoletoKpi } from "./analiseMocks";

interface BoletosKpiStripProps {
  kpis: BoletoKpi[];
  /** Labels of the KPI cards that should be clickable. */
  clickableLabels?: string[];
  onKpiClick?: (label: string) => void;
}

export function BoletosKpiStrip({ kpis, clickableLabels, onKpiClick }: BoletosKpiStripProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {kpis.map((k, i) => {
        const interactive = !!onKpiClick && !!clickableLabels?.includes(k.label);
        return (
        <Card
          key={i}
          onClick={interactive ? () => onKpiClick!(k.label) : undefined}
          role={interactive ? "button" : undefined}
          tabIndex={interactive ? 0 : undefined}
          onKeyDown={interactive ? (e) => (e.key === "Enter" || e.key === " ") && onKpiClick!(k.label) : undefined}
          className={cn("px-4 py-3.5", interactive && "cursor-pointer hover:bg-muted/50 transition-colors")}
        >
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
        );
      })}
    </div>
  );
}

export default BoletosKpiStrip;
