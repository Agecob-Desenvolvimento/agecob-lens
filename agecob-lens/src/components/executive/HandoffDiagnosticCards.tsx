import { TrendingDown, TrendingUp, Phone, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fmtNum, fmtPct } from "@/lib/metrics";
import type { HandoffEficienciaDatum } from "@/components/executive/HandoffEficienciaGroupedBar";
import type { FunnelDatum } from "@/selectors/homeSelectors";

// ── Types ────────────────────────────────────────────────────────

interface DiagnosticCard {
  bu: string;
  color: string;
  acionamentos: number;
  /** Contato = Alô (alguém atendeu) */
  alo: number;
  /** CPC = pessoa certa (RPC) */
  contatos: number;
  acordos: number;
  cpc: number;
  cpcBench: number | null;
  cpcAbove: boolean;
  conversao: number;
  conversaoBench: number | null;
  conversaoAbove: boolean;
  diagnosis: string;
  action: string;
}

interface HandoffDiagnosticCardsProps {
  data: HandoffEficienciaDatum[];
  funnelData?: FunnelDatum[];
  benchByBu?: Map<string, { cpc: number | null; conversao: number | null }>;
  cpcRef: number;
  conversaoRef: number;
  title?: string;
  loading?: boolean;
  empty?: boolean;
}

// ── Constants ────────────────────────────────────────────────────

const BU_COLORS: Record<string, string> = {
  AUTOS: "#6366f1",
  CONSUMER: "#06b6d4",
};

const DIAGNOSIS_MAP = {
  bothAbove: {
    diagnosis: "Alta Performance",
    action: "Documentar e replicar práticas.",
  },
  cpcAboveConvBelow: {
    diagnosis: "Foco em Negociação",
    action: "Consegue falar mas não fecha. Treinar argumentação e revisar ofertas.",
  },
  cpcBelowConvAbove: {
    diagnosis: "Foco em CPC",
    action: "Fecha bem quando fala, mas CPC é baixo (alcança poucos titulares). Melhorar discagem e validar bases de telefone.",
  },
  bothBelow: {
    diagnosis: "Revisão Completa",
    action: "Revisar qualidade da base e treinar equipe.",
  },
};

// ── Helpers ──────────────────────────────────────────────────────

function buildCards(
  data: HandoffEficienciaDatum[],
  funnelData: FunnelDatum[],
  benchByBu: Map<string, { cpc: number | null; conversao: number | null }>,
  cpcRef: number,
  conversaoRef: number,
): DiagnosticCard[] {
  const funnelMap = new Map(funnelData.map((f) => [f.bu, f]));
  return data.map((d) => {
    const bench = benchByBu.get(d.bu);
    const cpcBench = bench?.cpc ?? null;
    const conversaoBench = bench?.conversao ?? null;
    // compare against benchmark when available, fall back to overall avg
    const cpcAbove = cpcBench != null ? d.cpc >= cpcBench : cpcRef > 0 ? d.cpc >= cpcRef : true;
    const convAbove = conversaoBench != null ? d.conversao >= conversaoBench : conversaoRef > 0 ? d.conversao >= conversaoRef : true;
    const key = cpcAbove
      ? convAbove ? "bothAbove" : "cpcAboveConvBelow"
      : convAbove ? "cpcBelowConvAbove" : "bothBelow";
    const { diagnosis, action } = DIAGNOSIS_MAP[key];
    const funnel = funnelMap.get(d.bu);
    return {
      bu: d.bu,
      color: BU_COLORS[d.bu] ?? "#6b7280",
      acionamentos: funnel?.acionamentos ?? 0,
      alo: funnel?.alo ?? 0,
      contatos: funnel?.contatos ?? 0,
      acordos: funnel?.acordos ?? 0,
      cpc: d.cpc,
      cpcBench,
      cpcAbove,
      conversao: d.conversao,
      conversaoBench,
      conversaoAbove: convAbove,
      diagnosis,
      action,
    };
  });
}

// ── Component ────────────────────────────────────────────────────

export function HandoffDiagnosticCards({
  data,
  funnelData = [],
  benchByBu = new Map(),
  cpcRef,
  conversaoRef,
  title = "Diagnóstico",
  loading,
  empty,
}: HandoffDiagnosticCardsProps) {
  const isEmpty = empty || data.length === 0;
  const cards = isEmpty
    ? []
    : buildCards(data, funnelData, benchByBu, cpcRef, conversaoRef);

  return (
    <Card className="rounded-lg border-slate-200">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-base font-semibold leading-snug">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Skeleton className="h-[240px] w-full" />
            <Skeleton className="h-[240px] w-full" />
          </div>
        ) : isEmpty ? (
          <p className="text-sm text-muted-foreground">Sem dados para o período.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cards.map((card) => (
              <DiagnosticCardItem key={card.bu} card={card} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Inner card ───────────────────────────────────────────────────

function DiagnosticCardItem({ card }: { card: DiagnosticCard }) {
  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ borderColor: card.color, borderLeftWidth: 4 }}
    >
      {/* BU header + acionamentos */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: card.color }} />
          <span className="text-sm font-bold uppercase tracking-wide" style={{ color: card.color }}>
            {card.bu}
          </span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums leading-tight text-right">
          <span className="block">{fmtNum(card.acionamentos)} acion.</span>
          <span className="block">{fmtNum(card.alo)} contato</span>
          <span className="block">{fmtNum(card.contatos)} CPC</span>
          <span className="block">{fmtNum(card.acordos)} acordos</span>
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <MetricBadge
          icon={Phone}
          label="Taxa de CPC"
          value={card.cpc}
          bench={card.cpcBench}
          above={card.cpcAbove}
        />
        <MetricBadge
          icon={CheckCircle}
          label="Conversão"
          value={card.conversao}
          bench={card.conversaoBench}
          above={card.conversaoAbove}
        />
      </div>

      {/* Diagnosis */}
      <div className="space-y-2 pt-1 border-t border-border">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Diagnóstico
          </span>
          <p className="text-sm text-foreground leading-relaxed mt-0.5">
            {card.diagnosis}
          </p>
        </div>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Ação
          </span>
          <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
            {card.action}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Metric sub-component ─────────────────────────────────────────

function MetricBadge({
  icon: Icon,
  label,
  value,
  bench,
  above,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  bench: number | null;
  above: boolean;
}) {
  const TrendIcon = above ? TrendingUp : TrendingDown;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span
        className={cn(
          "text-lg font-bold tabular-nums leading-tight flex items-center gap-1",
          above ? "text-emerald-600" : "text-amber-600",
        )}
      >
        {fmtPct(value)}
        <TrendIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </span>
      {bench != null && (
        <span className="text-[10px] text-muted-foreground/70 tabular-nums">
          Top 10: {fmtPct(bench)}
        </span>
      )}
    </div>
  );
}

export default HandoffDiagnosticCards;
