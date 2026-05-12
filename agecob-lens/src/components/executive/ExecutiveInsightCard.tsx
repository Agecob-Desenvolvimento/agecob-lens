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

function Wrapper({ embedded, children }: { embedded?: boolean; children: ReactNode }) {
  return embedded ? <>{children}</> : <Card>{children}</Card>;
}

const SEVERITY_STYLES: Record<InsightSeverity | "action", { icon: typeof Lightbulb; className: string; label: string }> = {
  positive: { icon: CheckCircle2, className: "text-emerald-600", label: "Positivo" },
  warning: { icon: AlertTriangle, className: "text-amber-600", label: "Atenção" },
  critical: { icon: AlertCircle, className: "text-rose-600", label: "Crítico" },
  action: { icon: Lightbulb, className: "text-sky-600", label: "Ação sugerida" },
};

export function ExecutiveInsightCard({ data, loading, title = "Resumo do dia", embedded }: ExecutiveInsightCardProps) {
  if (loading) {
    return (
      <Wrapper embedded={embedded}>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </CardContent>
      </Wrapper>
    );
  }

  if (data.empty) {
    return (
      <Wrapper embedded={embedded}>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <p className="text-sm text-muted-foreground">
            Sem sinais operacionais detectados.
          </p>
        </CardContent>
      </Wrapper>
    );
  }

  const slots = [
    data.insight1 ? { ...data.insight1, key: "i1" } : null,
    data.insight2 ? { ...data.insight2, key: "i2" } : null,
    data.action ? { text: data.action.text, severity: "action" as const, key: "a1" } : null,
  ].filter((s): s is { text: string; severity: InsightSeverity | "action"; key: string } => Boolean(s));

  return (
    <Wrapper embedded={embedded}>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Dados insuficientes para gerar insights automáticos.</p>
        ) : (
          slots.map((slot) => {
            const style = SEVERITY_STYLES[slot.severity];
            const Icon = style.icon;
            return (
              <div key={slot.key} className="flex items-start gap-2 text-sm">
                <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", style.className)} aria-label={style.label} />
                <p className="text-foreground leading-snug">{slot.text}</p>
              </div>
            );
          })
        )}
      </CardContent>
    </Wrapper>
  );
}

export default ExecutiveInsightCard;
