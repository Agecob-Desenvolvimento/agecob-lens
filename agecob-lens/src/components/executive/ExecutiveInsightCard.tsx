import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, ArrowUpRight, ArrowRight, CheckCircle2, Lightbulb, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBRLCompact, fmtNum, fmtPct } from "@/lib/metrics";
import type { InsightEngineOutput, InsightSeverity } from "@/types/executive";

/* ------------------------------------------------------------------ *
 * Props
 *
 * The component supports two prop shapes:
 *
 *  (a) Handoff "Daily Readout" hero banner — driven by `variant`.
 *      This is the spec from docs/CLAUDE.md §1.2 and the handoff bundle.
 *
 *  (b) Legacy `InsightEngineOutput` shape — `data={...}` — kept for
 *      back-compat with Index.tsx / DetalhamentoAgentes.tsx /
 *      AgentComparisonDashboard.tsx (those callsites are out of scope
 *      for this audit and must keep working).
 * ------------------------------------------------------------------ */

export type InsightCardVariant = "critical" | "positive" | "neutral";
export type InsightMetricUnit = "BRL" | "percent" | "count";

export interface InsightMetric {
  value: number | string;
  unit?: InsightMetricUnit;
  /** Optional label rendered next to the value (e.g. "Conversão"). */
  label?: string;
}

export interface InsightDelta {
  /** Fraction (e.g. 0.12 = 12%). */
  value: number;
  baseline: string;
  betterWhen: "up" | "down";
}

export interface InsightCta {
  label: string;
  onClick?: () => void;
  href?: string;
}

interface HandoffCommonProps {
  title?: string;
  metric?: InsightMetric;
  delta?: InsightDelta;
  description?: string;
  cta?: InsightCta;
  loading?: boolean;
}

interface CriticalHandoffProps extends HandoffCommonProps {
  variant: "critical";
  /** Segundo número, renderizado menor ao lado do primário (mesmo card). Só a variant "critical" renderiza. */
  secondaryMetric?: InsightMetric;
}

interface NonCriticalHandoffProps extends HandoffCommonProps {
  variant: "positive" | "neutral";
  secondaryMetric?: never;
}

type HandoffProps = CriticalHandoffProps | NonCriticalHandoffProps;

interface LegacyProps {
  data: InsightEngineOutput;
  loading?: boolean;
  title?: string;
  embedded?: boolean;
}

export type ExecutiveInsightCardProps = HandoffProps | LegacyProps;

function isLegacy(p: ExecutiveInsightCardProps): p is LegacyProps {
  return (p as LegacyProps).data !== undefined;
}

/* ------------------------------------------------------------------ *
 * Handoff variant (new)
 * ------------------------------------------------------------------ */

function formatMetric(m: InsightMetric): string {
  if (typeof m.value === "string") return m.value;
  switch (m.unit) {
    case "BRL":
      return formatBRLCompact(m.value);
    case "percent":
      // value expected as fraction; render with 1 decimal
      return fmtPct(m.value * 100);
    case "count":
      return fmtNum(m.value);
    default:
      return String(m.value);
  }
}

function HandoffBanner({ variant, metric, secondaryMetric, delta, description, cta }: HandoffProps) {
  if (variant === "neutral") return null;

  const isCritical = variant === "critical";

  const palette = isCritical
    ? {
        wrapper: "bg-danger-soft border-danger-border",
        iconWrap: "bg-rose-100 dark:bg-rose-950/60 border-danger-border text-danger-fg",
        accent: "text-danger-fg",
        textBody: "text-rose-900/85 dark:text-rose-200",
        badgePill: "bg-white dark:bg-card border-danger-border text-danger-fg",
        ctaBtn: "bg-danger hover:bg-danger-fg text-white dark:text-background",
      }
    : {
        wrapper: "bg-success-soft border-success-border",
        iconWrap: "bg-emerald-100 dark:bg-emerald-950/60 border-success-border text-success-fg",
        accent: "text-success-fg",
        textBody: "text-emerald-900/85 dark:text-emerald-200",
        badgePill: "bg-white dark:bg-card border-success-border text-success-fg",
        ctaBtn: "bg-transparent text-success-fg underline underline-offset-[3px] hover:text-emerald-900 dark:hover:text-emerald-200",
      };

  const variantLabel = isCritical ? "Crítico" : "Positivo";

  const ctaContent = cta ? (
    isCritical ? (
      <button
        type="button"
        onClick={cta.onClick}
        className={cn(
          "inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-semibold transition-colors",
          palette.ctaBtn,
        )}
      >
        {cta.label}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    ) : (
      <button
        type="button"
        onClick={cta.onClick}
        className={cn("text-[13px] font-semibold transition-colors", palette.ctaBtn)}
      >
        {cta.label} →
      </button>
    )
  ) : null;

  const formattedMetric = metric ? formatMetric(metric) : null;
  const formattedSecondary = secondaryMetric ? formatMetric(secondaryMetric) : null;

  return (
    <div
      role="status"
      className={cn(
        "w-full border rounded-lg flex gap-4",
        palette.wrapper,
        isCritical ? "items-start px-6 py-5" : "items-center px-6 py-3.5",
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "shrink-0 rounded-full border flex items-center justify-center",
          palette.iconWrap,
          isCritical ? "w-10 h-10 mt-0.5" : "w-8 h-8",
        )}
        aria-hidden="true"
      >
        {isCritical ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isCritical ? (
          <>
            <div className="flex items-center gap-2">
              <span className={cn("text-[10px] font-bold uppercase tracking-[0.14em]", palette.accent)}>
                {variantLabel}
              </span>
              {metric?.label && (
                <>
                  <span className="text-xs text-rose-900/70 dark:text-rose-200">·</span>
                  <span className="text-xs text-rose-900/70 dark:text-rose-200">{metric.label}</span>
                </>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-3 flex-wrap">
              {formattedMetric && (
                <span className="text-[36px] font-bold tracking-tight tabular-nums leading-none text-rose-900 dark:text-rose-200">
                  {formattedMetric}
                </span>
              )}
              {delta && <DeltaPill delta={delta} className={palette.badgePill} />}
              {formattedSecondary && (
                <span className="inline-flex items-baseline gap-1.5 pl-3 border-l border-danger-border/50">
                  <span className="text-lg font-bold tabular-nums leading-none text-rose-900 dark:text-rose-200">
                    {formattedSecondary}
                  </span>
                  {secondaryMetric?.label && (
                    <span className="text-xs text-rose-900/70 dark:text-rose-200">{secondaryMetric.label}</span>
                  )}
                </span>
              )}
            </div>
            {description && (
              <p className={cn("mt-2 text-[14.5px] leading-relaxed max-w-[640px]", palette.textBody)}>
                {description}
              </p>
            )}
          </>
        ) : (
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className={cn("text-[10px] font-bold uppercase tracking-[0.14em]", palette.accent)}>
              {variantLabel}
            </span>
            {formattedMetric && (
              <span className="text-xl font-semibold tabular-nums leading-none text-emerald-900 dark:text-emerald-200">
                {formattedMetric}
                {metric?.label ? ` ${metric.label}` : ""}
              </span>
            )}
            {description && <span className={cn("text-[13.5px]", palette.textBody)}>{description}</span>}
          </div>
        )}
      </div>

      {ctaContent && <div className="shrink-0 self-center">{ctaContent}</div>}
    </div>
  );
}

function DeltaPill({ delta, className }: { delta: InsightDelta; className: string }) {
  const isUp = delta.value >= 0;
  const Arrow = isUp ? ArrowUpRight : ArrowRight;
  const pct = `${Math.round(Math.abs(delta.value) * 100)}%`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold tabular-nums",
        className,
      )}
    >
      <Arrow className="h-3 w-3" aria-hidden="true" />
      {pct} {delta.baseline}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Legacy renderer (kept verbatim in behavior, used by existing pages)
 * ------------------------------------------------------------------ */

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
  critical: { icon: AlertCircle,   bg: "bg-danger-soft",  ring: "ring-danger-border",  border: "border-danger",   iconColor: "text-danger-fg",  headlineColor: "text-danger-fg",  badgeBg: "bg-danger text-white dark:text-background",    label: "CRÍTICO"  },
  warning:  { icon: AlertTriangle, bg: "bg-warning-soft", ring: "ring-warning-border", border: "border-warning",  iconColor: "text-warning-fg", headlineColor: "text-warning-fg", badgeBg: "bg-warning text-white dark:text-background",   label: "ATENÇÃO"  },
  positive: { icon: CheckCircle2,  bg: "bg-success-soft", ring: "ring-success-border", border: "border-success",  iconColor: "text-success-fg", headlineColor: "text-success-fg", badgeBg: "bg-success text-white dark:text-background",   label: "POSITIVO" },
  action:   { icon: Lightbulb,     bg: "bg-sky-50 dark:bg-sky-950/40",       ring: "ring-sky-200 dark:ring-sky-800/70",        border: "border-sky-500",  iconColor: "text-sky-600 dark:text-sky-400",    headlineColor: "text-sky-700 dark:text-sky-300",    badgeBg: "bg-sky-600 text-white",   label: "AÇÃO"     },
};

function LegacyInsight({ data, loading, title = "Resumo do dia", embedded }: LegacyProps) {
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
    return null;
  }

  const slots: RenderSlot[] = [
    data.insight1 ? { ...data.insight1, key: "i1" } : null,
    data.insight2 ? { ...data.insight2, key: "i2" } : null,
    data.action ? { text: data.action.text, severity: "action" as const, key: "a1", headline: data.action.headline } : null,
  ].filter(Boolean) as RenderSlot[];

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

/* ------------------------------------------------------------------ *
 * Public entry point — discriminates by props shape.
 * ------------------------------------------------------------------ */

export function ExecutiveInsightCard(props: ExecutiveInsightCardProps) {
  if (isLegacy(props)) return <LegacyInsight {...props} />;
  return <HandoffBanner {...props} />;
}

export default ExecutiveInsightCard;
