import { useMemo, useState } from "react";
import { ChartShell } from "@/components/executive/ChartShell";
import { fmtBRL } from "@/lib/metrics";
import type { PrimeiraParcelaPorPortfolioRow } from "@/services/api";
import type { PortfolioRiskEntry } from "@/types/viewModels";

interface PortfolioRiskDatum {
  label: string;
  value: number;          // valor 1ª parcela
  qtd: number;            // qtd acordos
  excecoesPct: number;    // % exceções sobre 1ª parcela
  quebradosPct: number;   // % quebrados sobre 1ª parcela
  rejeitadosPct: number;  // % rejeitados sobre 1ª parcela
  compositeRisk: number;  // max das 3 dimensões (0-100)
}

interface HandoffPortfolioRentabilidadeProps {
  rows: PrimeiraParcelaPorPortfolioRow[];
  riskMap: Map<string, PortfolioRiskEntry>;
  title?: string;
  loading?: boolean;
  empty?: boolean;
}

const RISK_COLORS = {
  quebrados: "#ef4444",   // red — perda concretizada
  excecoes:  "#f59e0b",   // amber — em risco
  rejeitados: "#eab308",  // yellow — oportunidade perdida
} as const;

const HIGH_RISK_THRESHOLD = 50;

function compositeRiskLevel(pct: number): { label: string; color: string } {
  if (pct <= 25) return { label: "Baixo", color: "#22c55e" };
  if (pct <= HIGH_RISK_THRESHOLD) return { label: "Médio", color: "#f59e0b" };
  return { label: "Alto", color: "#ef4444" };
}

function buildDatum(
  r: PrimeiraParcelaPorPortfolioRow,
  riskMap: Map<string, PortfolioRiskEntry>,
): PortfolioRiskDatum {
  const valor = Number(r.valor_primeira_parcela || 0);
  const risk = riskMap.get(r.portfolio_name) ?? { excecoes: 0, quebrados: 0, rejeitados: 0 };
  const rawExc = valor > 0 ? (risk.excecoes / valor) * 100 : 0;
  const rawQbr = valor > 0 ? (risk.quebrados / valor) * 100 : 0;
  const rawRej = valor > 0 ? (risk.rejeitados / valor) * 100 : 0;
  // Cap individual dimensions to 100% — values above 100% indicate a data
  // consistency issue (e.g. risk numerator from a wider time window than the
  // 1ª-parcela denominator). Log a warning so the DBA can investigate.
  const excecoesPct = Math.min(rawExc, 100);
  const quebradosPct = Math.min(rawQbr, 100);
  const rejeitadosPct = Math.min(rawRej, 100);
  if (rawExc > 100 || rawQbr > 100 || rawRej > 100) {
    console.warn(
      `[HandoffPortfolioRentabilidade] Risco >100% para "${r.portfolio_name}": ` +
      `exceções=${rawExc.toFixed(1)}% quebrados=${rawQbr.toFixed(1)}% rejeitados=${rawRej.toFixed(1)}% ` +
      `(1ª parcela = R$ ${valor.toFixed(2)} | exc = R$ ${risk.excecoes.toFixed(2)} | ` +
      `qbr = R$ ${risk.quebrados.toFixed(2)} | rej = R$ ${risk.rejeitados.toFixed(2)}). ` +
      `Provável: numerador de risco cobre janela maior que o denominador de 1ª parcela.`
    );
  }
  // Composite = pior dimensão (max). Evita inflação por soma de dimensões sobrepostas.
  const compositeRisk = Math.min(Math.max(excecoesPct, quebradosPct, rejeitadosPct), 100);
  return {
    label: r.portfolio_name,
    value: valor,
    qtd: Number(r.qtd_acordos || 0),
    excecoesPct,
    quebradosPct,
    rejeitadosPct,
    compositeRisk,
  };
}

export function HandoffPortfolioRentabilidade({
  rows,
  riskMap,
  title = "1ª Parcela por Portfólio",
  loading,
  empty,
}: HandoffPortfolioRentabilidadeProps) {
  const [tooltip, setTooltip] = useState<{ label: string; x: number; y: number } | null>(null);
  const [showCount, setShowCount] = useState(15);
  const PAGE_SIZE = 10;

  const allRanked = useMemo((): PortfolioRiskDatum[] => {
    if (!rows.length) return [];

    return rows
      .map((r) => buildDatum(r, riskMap))
      .sort((a, b) => b.value - a.value || a.compositeRisk - b.compositeRisk || b.qtd - a.qtd);
  }, [rows, riskMap]);

  const visible = allRanked.slice(0, showCount);
  const maxBar = Math.max(...visible.map((d) => d.value), 1);
  const hasMore = showCount < allRanked.length;

  const isEmpty = empty || visible.length === 0;

  return (
    <ChartShell
      title={title}
      description={`${visible.length} de ${allRanked.length} carteiras. Ordem: valor 1ª parcela → risco → qtd acordos. Risco é cor ao lado. Baixo ≤25%, Médio 25–50%, Alto >50%.`}
      loading={loading}
      empty={isEmpty}
      height={Math.min(660, 160 + visible.length * 36 + (hasMore ? 36 : 0))}
    >
      <div className="space-y-1.5">
        {/* Header */}
        <div className="flex items-center text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground pb-1 border-b border-border">
          <span className="flex-1 pl-1">Ranking · Portfólio</span>
          <span className="w-[100px] text-right">1ª Parcela</span>
          <span className="w-[56px] text-right">Acordos</span>
          <span className="w-[144px] text-right pr-1">Risco</span>
        </div>

        {visible.map((d) => {
          const barPct = (d.value / maxBar) * 100;
          const { label: riskLabel, color: riskColor } = compositeRiskLevel(d.compositeRisk);

          return (
            <RiskRow
              key={d.label}
              datum={d}
              maxBar={maxBar}
              riskLabel={riskLabel}
              riskColor={riskColor}
              highRisk={d.compositeRisk > HIGH_RISK_THRESHOLD}
              onTooltip={setTooltip}
            />
          );
        })}

        {/* ── "Show more" button ── */}
        {hasMore && (
          <button
            type="button"
            onClick={() => setShowCount((c) => Math.min(c + PAGE_SIZE, allRanked.length))}
            className="flex items-center justify-center gap-1.5 w-full py-1.5 border-t border-dashed border-border text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-sm transition-colors"
          >
            <span className="text-xs">▾</span>
            Mostrar mais {Math.min(PAGE_SIZE, allRanked.length - showCount)} carteiras
            <span className="text-muted-foreground/60">({showCount}/{allRanked.length})</span>
          </button>
        )}

        {/* Tooltip */}
        {tooltip && (() => {
          const d = visible.find((x) => x.label === tooltip.label);
          if (!d) return null;
          return (
            <div
              className="fixed z-50 bg-popover border border-border rounded-md shadow-lg px-3 py-2 text-[11px] leading-relaxed pointer-events-none"
              style={{ left: tooltip.x, top: tooltip.y }}
            >
              <div className="font-semibold text-foreground mb-1">{tooltip.label}</div>
              <div className="space-y-0.5 text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: RISK_COLORS.quebrados }} />
                  <span>Quebrados: {d.quebradosPct.toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: RISK_COLORS.excecoes }} />
                  <span>Exceções: {d.excecoesPct.toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: RISK_COLORS.rejeitados }} />
                  <span>Rejeitados: {d.rejeitadosPct.toFixed(1)}%</span>
                </div>
                <div className="border-t border-border mt-1 pt-1 font-medium text-foreground">
                  Risco (pior dimensão): {d.compositeRisk.toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Baixo ≤25%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Médio 10–{HIGH_RISK_THRESHOLD}%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Alto &gt;{HIGH_RISK_THRESHOLD}%
        </span>
        <span className="text-muted-foreground/60 mx-1">|</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: RISK_COLORS.quebrados }} /> Quebrados
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: RISK_COLORS.excecoes }} /> Exceções
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: RISK_COLORS.rejeitados }} /> Rejeitados
        </span>
      </div>
    </ChartShell>
  );
}

/* ── Inline sub-component: renders one portfolio risk row ── */

interface RiskRowProps {
  datum: PortfolioRiskDatum;
  maxBar: number;
  riskLabel: string;
  riskColor: string;
  highRisk?: boolean;
  onTooltip: (t: { label: string; x: number; y: number } | null) => void;
}

function RiskRow({ datum: d, maxBar, riskLabel, riskColor, highRisk, onTooltip }: RiskRowProps) {
  const barPct = (d.value / maxBar) * 100;

  return (
    <div
      className={`flex items-center gap-1 text-xs group hover:bg-muted/30 rounded-sm px-1 py-0.5 transition-colors ${
        highRisk ? "bg-rose-50/30" : ""
      }`}
    >
      {/* Risk dot */}
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: riskColor }}
        title={`Risco composto: ${riskLabel} (${d.compositeRisk.toFixed(1)}%)`}
      />

      {/* Portfolio name */}
      <span className="flex-1 truncate font-medium text-foreground/80 pl-1" title={d.label}>
        {d.label}
      </span>

      {/* Value bar */}
      <div className="flex-1 min-w-[80px] max-w-[200px] h-4 bg-muted rounded-sm overflow-hidden">
        <div
          className="h-full rounded-sm transition-all duration-500"
          style={{ width: `${Math.max(1, barPct)}%`, backgroundColor: riskColor, opacity: 0.7 }}
        />
      </div>

      {/* Value */}
      <span className="w-[100px] text-right tabular-nums font-semibold text-foreground text-[11px]">
        {fmtBRL(d.value, { compact: true })}
      </span>

      {/* Qtd */}
      <span className="w-[56px] text-right tabular-nums text-muted-foreground text-[11px]">
        {d.qtd}
      </span>

      {/* Risk stacked bar + score */}
      <div className="w-[144px] flex items-center gap-1.5 justify-end pr-1">
        {/* Stacked risk breakdown bar — width = pior dimensão */}
        <div
          className="relative h-3 w-[72px] bg-muted rounded-full overflow-hidden shrink-0"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onTooltip({ label: d.label, x: rect.left, y: rect.bottom + 4 });
          }}
          onMouseLeave={() => onTooltip(null)}
        >
          {/* Segments proportional to their contribution vs the max dimension */}
          <div
            className="absolute inset-0 h-full flex rounded-full overflow-hidden"
            style={{ width: `${Math.min(d.compositeRisk, 100)}%` }}
          >
            {d.quebradosPct > 0 && (
              <div
                className="h-full"
                style={{
                  width: `${(d.quebradosPct / Math.max(d.compositeRisk, 0.1)) * 100}%`,
                  backgroundColor: RISK_COLORS.quebrados,
                }}
              />
            )}
            {d.excecoesPct > 0 && (
              <div
                className="h-full"
                style={{
                  width: `${(d.excecoesPct / Math.max(d.compositeRisk, 0.1)) * 100}%`,
                  backgroundColor: RISK_COLORS.excecoes,
                }}
              />
            )}
            {d.rejeitadosPct > 0 && (
              <div
                className="h-full"
                style={{
                  width: `${(d.rejeitadosPct / Math.max(d.compositeRisk, 0.1)) * 100}%`,
                  backgroundColor: RISK_COLORS.rejeitados,
                }}
              />
            )}
          </div>
        </div>

        {/* Composite score */}
        <span
          className="text-[10px] font-semibold tabular-nums min-w-[44px] text-right"
          style={{ color: riskColor }}
        >
          {riskLabel} {d.compositeRisk.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

export default HandoffPortfolioRentabilidade;