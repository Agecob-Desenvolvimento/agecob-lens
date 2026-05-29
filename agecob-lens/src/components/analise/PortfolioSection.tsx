import { useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRLCompact } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { usePortfolioDetalhe } from "@/hooks/usePortfolioDetalhe";
import { type BarRow, excecoesToRows, rejeitadosToRows } from "./portfolioRows";

export function HBarList({
  rows,
  onBarClick,
  selectedLabel,
  type,
}: {
  rows: BarRow[];
  onBarClick?: (label: string) => void;
  selectedLabel?: string | null;
  type: "valor" | "excecoes" | "rejeitados" | "quebrados";
}) {
  if (rows.length === 0) {
    return <p className="text-[11px] italic text-muted-foreground">Sem registros no período.</p>;
  }
  const clickable = !!onBarClick;
  return (
    <div className="flex flex-col gap-[5px]">
      {rows.map((r, i) => {
        const isSelected = selectedLabel === r.label;
        return (
          <div
            key={i}
            className={cn(
              "flex items-center gap-2 rounded-sm -mx-1 px-1 py-0.5 transition-colors",
              clickable && "cursor-pointer hover:bg-muted/50",
              isSelected && "bg-muted/80 ring-1 ring-border",
            )}
            onClick={() => clickable && onBarClick?.(r.label)}
            title={clickable ? `Clique para detalhar ${r.label}` : undefined}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={(e) => { if (clickable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onBarClick?.(r.label); } }}
          >
            <span className="w-[100px] shrink-0 text-[10px] text-right text-muted-foreground truncate" title={r.label}>
              {r.label}
            </span>
            <div className={cn("flex-1 h-4 rounded-sm overflow-hidden", r.trackClass)}>
              <div
                className="h-full rounded-sm transition-all duration-500"
                style={{ width: `${Math.min(r.ratio * 100, 100)}%`, backgroundColor: r.barColor }}
              />
            </div>
            <span className={cn("w-[72px] shrink-0 text-[10px] text-right tabular-nums", r.valueClass)}>
              {r.valueText}
            </span>
            {clickable && (
              <span className="w-4 shrink-0 text-muted-foreground">
                {isSelected ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Detail panel rendered below a clicked portfolio bar. */
export function PortfolioDetailPanel({
  type,
  portfolio,
  onClose,
}: {
  type: "valor" | "excecoes" | "rejeitados";
  portfolio: string;
  onClose: () => void;
}) {
  const titles: Record<string, string> = { valor: "Acordos", excecoes: "Exceções", rejeitados: "Rejeitados" };
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    valor: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800" },
    excecoes: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-800" },
    rejeitados: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-800" },
  };
  const c = colors[type];
  const { rows, loading, error } = usePortfolioDetalhe(type, portfolio);

  return (
    <div className={cn("rounded-lg border overflow-hidden mt-2", c.border)}>
      <div className={cn("px-4 py-2.5 flex items-center justify-between", c.bg)}>
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-semibold", c.text)}>
            {titles[type]} — {portfolio}
            {!loading && !error && rows.length > 0 && (
              <span className="font-normal opacity-70"> · {rows.length} acordos</span>
            )}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-black/5 transition-colors"
          aria-label="Fechar detalhes"
        >
          <X className={cn("h-3.5 w-3.5", c.text)} />
        </button>
      </div>
      <div className="p-3">
        {loading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-5 bg-muted rounded-sm animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <p className="text-xs text-rose-600">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-[11px] italic text-muted-foreground">Sem acordos no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] tabular-nums">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-1 pr-3 font-medium">Devedor</th>
                  <th className="py-1 pr-3 font-medium">Agente</th>
                  <th className="py-1 pr-3 font-medium">Recebimento</th>
                  <th className="py-1 pr-3 text-right font-medium">1ª Parcela</th>
                  <th className="py-1 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.NR_RECEBIMENTO}-${r.ID_CARTEIRA}`} className="border-b border-border/50 last:border-0">
                    <td className="py-1 pr-3">
                      <span className="block truncate max-w-[180px]" title={r.nome_devedor}>{r.nome_devedor}</span>
                      <span className="block text-[10px] text-muted-foreground">{r.cpf_mask}</span>
                    </td>
                    <td className="py-1 pr-3 truncate max-w-[120px]" title={r.agente}>{r.agente}</td>
                    <td className="py-1 pr-3 text-muted-foreground">{r.NR_RECEBIMENTO}/{r.ID_CARTEIRA}</td>
                    <td className={cn("py-1 pr-3 text-right tabular-nums", c.text)}>{formatBRLCompact(r.valor_primeira_parcela)}</td>
                    <td className={cn("py-1 text-right font-semibold", c.text)}>{formatBRLCompact(r.valor_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export interface PortfolioSectionProps {
  portfolioValor: Array<{ nome: string; valor: number }>;
  excecoesPorPortfolio: Array<{ nome: string; qtd: number }>;
  rejeitadosPorPortfolio: Array<{ nome: string; qtd: number }>;
  loading?: boolean;
}

export function PortfolioSection({
  portfolioValor,
  excecoesPorPortfolio,
  rejeitadosPorPortfolio,
  loading,
}: PortfolioSectionProps) {
  const maxValor = Math.max(...portfolioValor.map((d) => d.valor), 1);
  const [expandedValor, setExpandedValor] = useState<string | null>(null);
  const [expandedExc, setExpandedExc] = useState<string | null>(null);
  const [expandedRej, setExpandedRej] = useState<string | null>(null);

  const valorRows: BarRow[] = portfolioValor.map((d) => ({
    label: d.nome,
    ratio: d.valor / maxValor,
    valueText: formatBRLCompact(d.valor),
    barColor: "#22c55e",
    trackClass: "bg-muted",
    valueClass: "text-muted-foreground",
  }));

  const excecoesRows: BarRow[] = excecoesToRows(excecoesPorPortfolio);
  const rejeitadosRows: BarRow[] = rejeitadosToRows(rejeitadosPorPortfolio);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Valor */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-semibold">Valor de Acordos por Portfólio</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-4 bg-muted rounded-sm animate-pulse" />
                ))}
              </div>
            ) : (
              <HBarList
                rows={valorRows}
                type="valor"
                onBarClick={setExpandedValor}
                selectedLabel={expandedValor}
              />
            )}
          </CardContent>
        </Card>

        {/* Exceções */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-semibold">Exceções por Portfólio (Qtd)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-4 bg-muted rounded-sm animate-pulse" />
                ))}
              </div>
            ) : (
              <HBarList
                rows={excecoesRows}
                type="excecoes"
                onBarClick={setExpandedExc}
                selectedLabel={expandedExc}
              />
            )}
          </CardContent>
        </Card>

        {/* Rejeitados */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-semibold">Rejeitados por Portfólio (Qtd)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-4 bg-muted rounded-sm animate-pulse" />
                ))}
              </div>
            ) : (
              <HBarList
                rows={rejeitadosRows}
                type="rejeitados"
                onBarClick={setExpandedRej}
                selectedLabel={expandedRej}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail panels below the grid */}
      {expandedValor && (
        <PortfolioDetailPanel
          type="valor"
          portfolio={expandedValor}
          onClose={() => setExpandedValor(null)}
        />
      )}
      {expandedExc && (
        <PortfolioDetailPanel
          type="excecoes"
          portfolio={expandedExc}
          onClose={() => setExpandedExc(null)}
        />
      )}
      {expandedRej && (
        <PortfolioDetailPanel
          type="rejeitados"
          portfolio={expandedRej}
          onClose={() => setExpandedRej(null)}
        />
      )}
    </div>
  );
}
