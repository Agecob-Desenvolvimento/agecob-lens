import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtNum } from "@/lib/metrics";
import { usePeriodicBlink } from "@/hooks/usePeriodicBlink";
import type { BoletoKpi } from "./analiseMocks";

interface BoletosKpiStripProps {
  kpis: BoletoKpi[];
  /** Labels of the KPI cards that should be clickable. */
  clickableLabels?: string[];
  onKpiClick?: (label: string) => void;
}

// Ordem e tamanho (igual HomeKpiStrip): valor (BRL) primeiro e maior (col-span-2),
// % depois, contagem por último; "Melhor Dia" (sem unit) ao final.
const UNIT_RANK: Record<NonNullable<BoletoKpi["unit"]>, number> = { BRL: 0, percent: 1, count: 2 };
const rankOf = (k: BoletoKpi) => (k.unit ? UNIT_RANK[k.unit] : 3);

export function BoletosKpiStrip({ kpis, clickableLabels, onKpiClick }: BoletosKpiStripProps) {
  const ordered = [...kpis].sort((a, b) => rankOf(a) - rankOf(b));
  const blink = usePeriodicBlink();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {ordered.map((k, i) => {
        const interactive = !!onKpiClick && !!clickableLabels?.includes(k.label);
        const isBRL = k.unit === "BRL";
        // Pisca os cards de contagem clicáveis e os de valor (BRL).
        const blinking = (interactive || isBRL) && blink;
        return (
          <Card
            key={i}
            onClick={interactive ? () => onKpiClick!(k.label) : undefined}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            onKeyDown={interactive ? (e) => (e.key === "Enter" || e.key === " ") && onKpiClick!(k.label) : undefined}
            className={cn(
              "min-w-0 rounded-lg border-border bg-card transition-all duration-300",
              isBRL ? "xl:col-span-2 p-5" : "xl:col-span-1 p-4",
              interactive && "cursor-pointer hover:bg-muted/50",
              blinking && "ring-2 ring-sky-400 ring-offset-1",
            )}
          >
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "font-semibold uppercase tracking-[0.12em] text-muted-foreground",
                  isBRL ? "text-[11px]" : "text-[10px]",
                )}
              >
                {k.label}
              </span>
              {isBRL ? (
                <span className="text-[11px] font-medium text-muted-foreground/70">BRL</span>
              ) : null}
            </div>
            <div
              className={cn(
                "font-bold leading-none tabular-nums tracking-tight",
                isBRL ? "mt-3 text-3xl md:text-4xl" : "mt-1.5 text-xl md:text-2xl font-semibold",
              )}
              style={{ color: k.color }}
            >
              {typeof k.value === "number" ? fmtNum(k.value) : k.value}
            </div>
            {k.sub && <div className="mt-2 text-[10px] text-muted-foreground">{k.sub}</div>}
          </Card>
        );
      })}
    </div>
  );
}

export default BoletosKpiStrip;
