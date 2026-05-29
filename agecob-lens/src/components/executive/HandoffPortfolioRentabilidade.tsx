import { useMemo } from "react";
import { ChartShell } from "@/components/executive/ChartShell";
import { fmtBRL, shortAgentName } from "@/lib/metrics";
import type { PrimeiraParcelaPorPortfolioRow } from "@/services/api";

interface PortfolioRiskDatum {
  label: string;
  value: number;       // valor 1ª parcela
  qtd: number;         // qtd acordos
  riskPct: number;     // % exceções (proxy de risco)
}

interface HandoffPortfolioRentabilidadeProps {
  rows: PrimeiraParcelaPorPortfolioRow[];
  /** Exceções por portfólio para cálculo de risco. Mapa nome → valor_exceções. */
  riskMap: Map<string, number>;
  title?: string;
  loading?: boolean;
  empty?: boolean;
}

function riskColor(pct: number): string {
  if (pct <= 5) return "#22c55e";   // green — baixo risco
  if (pct <= 15) return "#f59e0b";  // amber — médio risco
  return "#ef4444";                   // red — alto risco
}

function riskLabel(pct: number): string {
  if (pct <= 5) return "Baixo";
  if (pct <= 15) return "Médio";
  return "Alto";
}

export function HandoffPortfolioRentabilidade({
  rows,
  riskMap,
  title = "1ª Parcela por Portfólio",
  loading,
  empty,
}: HandoffPortfolioRentabilidadeProps) {
  const data = useMemo((): PortfolioRiskDatum[] => {
    if (!rows.length) return [];
    const maxValor = Math.max(...rows.map((r) => Number(r.valor_primeira_parcela || 0)), 1);

    return rows
      .map((r) => {
        const valor = Number(r.valor_primeira_parcela || 0);
        const excecoes = riskMap.get(r.portfolio_name) ?? 0;
        const riskPct = valor > 0 ? (excecoes / valor) * 100 : 0;
        return {
          label: r.portfolio_name,
          value: valor,
          qtd: Number(r.qtd_acordos || 0),
          riskPct: Math.min(riskPct, 100),
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [rows, riskMap]);

  const isEmpty = empty || data.length === 0;

  return (
    <ChartShell
      title={title}
      description="Valor de entrada de caixa (1ª parcela). Cor indica risco do portfólio baseado na taxa de exceções."
      loading={loading}
      empty={isEmpty}
      height={320}
    >
      <div className="space-y-1.5">
        {/* Header */}
        <div className="flex items-center text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground pb-1 border-b border-border">
          <span className="flex-1 pl-1">Portfólio</span>
          <span className="w-[100px] text-right">1ª Parcela</span>
          <span className="w-[56px] text-right">Acordos</span>
          <span className="w-[64px] text-right">Risco</span>
        </div>

        {data.map((d) => {
          const color = riskColor(d.riskPct);
          const maxBar = Math.max(...data.map((x) => x.value), 1);
          const barPct = (d.value / maxBar) * 100;

          return (
            <div key={d.label} className="flex items-center gap-1 text-xs group hover:bg-muted/30 rounded-sm px-1 py-0.5 transition-colors">
              {/* Risk dot */}
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} title={`Risco: ${riskLabel(d.riskPct)} (${d.riskPct.toFixed(1)}%)`} />

              {/* Portfolio name + bar */}
              <span className="flex-1 truncate font-medium text-foreground/80 pl-1" title={d.label}>
                {d.label}
              </span>

              {/* Bar */}
              <div className="flex-1 min-w-[80px] max-w-[200px] h-4 bg-muted rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all duration-500"
                  style={{ width: `${Math.max(1, barPct)}%`, backgroundColor: color, opacity: 0.7 }}
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

              {/* Risk badge */}
              <span
                className="w-[64px] text-right text-[10px] font-medium tabular-nums"
                style={{ color }}
              >
                {riskLabel(d.riskPct)} {d.riskPct.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Baixo ≤5%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Médio 5–15%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Alto &gt;15%
        </span>
      </div>
    </ChartShell>
  );
}

export default HandoffPortfolioRentabilidade;
