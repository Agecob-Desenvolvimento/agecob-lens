import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Lightbulb, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { InsightEngineOutput, InsightSeverity } from "@/types/executive";

interface ExecutiveInsightCardProps {
  data: InsightEngineOutput;
  loading?: boolean;
  title?: string;
  embedded?: boolean;
}

type RenderSlot = {
  text: string;
  severity: InsightSeverity | "action";
  key: string;
  headline?: string;
};

function Wrapper({ embedded, children }: { embedded?: boolean; children: ReactNode }) {
  return embedded ? <>{children}</> : <Card>{children}</Card>;
}

const SEVERITY_TILE: Record<InsightSeverity | "action", {
  icon: typeof Lightbulb;
  bg: string;
  ring: string;
  border: string;
  iconColor: string;
  headlineColor: string;
  badgeBg: string;
  label: string;
}> = {
  critical: { icon: AlertCircle,   bg: "bg-danger-soft",  ring: "ring-danger-border",  border: "border-danger",   iconColor: "text-danger-fg",  headlineColor: "text-danger-fg",  badgeBg: "bg-danger text-white",    label: "CRÍTICO"  },
  warning:  { icon: AlertTriangle, bg: "bg-warning-soft", ring: "ring-warning-border", border: "border-warning",  iconColor: "text-warning-fg", headlineColor: "text-warning-fg", badgeBg: "bg-warning text-white",   label: "ATENÇÃO"  },
  positive: { icon: CheckCircle2,  bg: "bg-success-soft", ring: "ring-success-border", border: "border-success",  iconColor: "text-success-fg", headlineColor: "text-success-fg", badgeBg: "bg-success text-white",   label: "POSITIVO" },
  action:   { icon: Lightbulb,     bg: "bg-sky-50",       ring: "ring-sky-200",        border: "border-sky-500",  iconColor: "text-sky-600",    headlineColor: "text-sky-700",    badgeBg: "bg-sky-600 text-white",   label: "AÇÃO"     },
};

export function ExecutiveInsightCard({ data, loading, title = "Resumo do dia", embedded }: ExecutiveInsightCardProps) {
  if (loading) {
    return (
      <Wrapper embedded={embedded}>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Wrapper>
    );
  }

  if (data.empty) {
    // Estado neutro: omitir o bloco inteiro (CLAUDE.md anti-pattern).
    return null;
  }

  const slots: RenderSlot[] = [
    data.insight1 ? { ...data.insight1, key: "i1" } : null,
    data.insight2 ? { ...data.insight2, key: "i2" } : null,
    data.action ? { text: data.action.text, severity: "action" as const, key: "a1", headline: data.action.headline } : null,
  ].filter((s): s is RenderSlot => Boolean(s));

  return (
    <Wrapper embedded={embedded}>
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Dados insuficientes para gerar insights automáticos.</p>
        ) : (
          slots.map((slot) => {
            const tile = SEVERITY_TILE[slot.severity];
            const Icon = tile.icon;
            const ringEmphasis = slot.severity === "critical" ? "ring-2 shadow-sm" : "ring-1";
            return (
              <div
                key={slot.key}
                className={cn(
                  "rounded-md border-l-4 p-3 flex items-start gap-3",
                  tile.bg,
                  tile.border,
                  ringEmphasis,
                  tile.ring,
                )}
              >
                <Icon className={cn("h-7 w-7 mt-0.5 shrink-0", tile.iconColor)} aria-label={tile.label} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    {slot.headline ? (
                      <span className={cn("text-3xl font-bold leading-none", tile.headlineColor)}>
                        {slot.headline}
                      </span>
                    ) : <span />}
                    <span className={cn("text-[10px] font-semibold tracking-wide rounded px-1.5 py-0.5", tile.badgeBg)}>
                      {tile.label}
                    </span>
                  </div>
                  <p className="text-sm text-foreground leading-snug mt-1">{slot.text}</p>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Wrapper>
  );
}

export default ExecutiveInsightCard;
