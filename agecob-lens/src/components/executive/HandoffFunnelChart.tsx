import { ChartShell } from "@/components/executive/ChartShell";
import { fmtNum, fmtPct } from "@/lib/metrics";
import type { FunnelDatum } from "@/selectors/homeSelectors";

interface HandoffFunnelChartProps {
  data: FunnelDatum[];
  title?: string;
  loading?: boolean;
  empty?: boolean;
}

const BU_COLORS: Record<string, { bar: string; text: string }> = {
  AUTOS: { bar: "#6366f1", text: "#4338ca" },
  CONSUMER: { bar: "#06b6d4", text: "#0e7490" },
};

const STAGE_LABELS = ["Acionamentos", "Contato", "CPC", "Acordos"] as const;

/** Barra de um estágio do funil — largura proporcional ao valor máximo da BU */
function StageBar({ value, max, color, label, sub }: { value: number; max: number; color: string; label: string; sub: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  // Barra estreita não comporta o número inteiro: mostra ao lado, fora da barra.
  const labelInside = pct >= 18;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground w-[72px] shrink-0 text-right">
        {label}
      </span>
      <div className="flex-1 min-w-0 flex items-center gap-1">
        <div className="h-5 rounded-sm transition-all duration-500 flex items-center px-2 min-w-[24px] shrink-0" style={{ width: `${pct}%`, backgroundColor: color }}>
          {labelInside && (
            <span className="text-[11px] font-semibold text-white tabular-nums truncate drop-shadow-sm">
              {fmtNum(value)}
            </span>
          )}
        </div>
        {!labelInside && (
          <span className="text-[11px] font-semibold tabular-nums shrink-0" style={{ color }}>
            {fmtNum(value)}
          </span>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground w-[72px] shrink-0 tabular-nums">
        {sub}
      </span>
    </div>
  );
}

export function HandoffFunnelChart({ data, title = "Funil de Conversão", loading, empty }: HandoffFunnelChartProps) {
  const isEmpty = empty || data.length === 0;

  return (
    <ChartShell
      title={title}
      description="Acionamentos → Contato (atende) → CPC (pessoa certa) → Acordos por unidade de negócio"
      loading={loading}
      empty={isEmpty}
      height={216}
    >
      <div className="space-y-6">
        {data.map((bu) => {
          const max = bu.acionamentos || 1;
          const taxaAtend = bu.acionamentos > 0 ? (bu.alo / bu.acionamentos) * 100 : 0;
          const taxaRpc = bu.alo > 0 ? (bu.contatos / bu.alo) * 100 : 0;
          const taxaConversao = bu.contatos > 0 ? (bu.acordos / bu.contatos) * 100 : 0;
          const colors = BU_COLORS[bu.bu] ?? BU_COLORS.AUTOS;

          return (
            <div key={bu.bu} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: colors.bar }} />
                <span className="text-xs font-semibold tracking-wide" style={{ color: colors.text }}>
                  {bu.bu}
                </span>
              </div>
              <div className="space-y-1.5">
                <StageBar
                  value={bu.acionamentos}
                  max={max}
                  color={colors.bar}
                  label={STAGE_LABELS[0]}
                  sub="100%"
                />
                <StageBar
                  value={bu.alo}
                  max={max}
                  color={colors.bar}
                  label={STAGE_LABELS[1]}
                  sub={fmtPct(taxaAtend)}
                />
                <StageBar
                  value={bu.contatos}
                  max={max}
                  color={colors.bar}
                  label={STAGE_LABELS[2]}
                  sub={`${fmtPct(taxaRpc)} do contato`}
                />
                <StageBar
                  value={bu.acordos}
                  max={max}
                  color={colors.bar}
                  label={STAGE_LABELS[3]}
                  sub={`${fmtPct(taxaConversao)} do CPC`}
                />
              </div>
              {/* Drop-off annotation */}
              <p className="text-[10px] text-muted-foreground/70 pl-[84px]">
                Queda CPC→acordo: {fmtPct(Math.max(0, taxaRpc - taxaConversao))} pp
              </p>
            </div>
          );
        })}
      </div>
    </ChartShell>
  );
}

export default HandoffFunnelChart;
