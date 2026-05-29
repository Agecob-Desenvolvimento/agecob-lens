import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AcordoRiscoPanel } from "@/components/analise/AcordoRiscoPanel";

export interface AcordoQuebrado {
  id: string;
  portfolio: string;
  devedor: string;
  agente: string;
  mat: string;
  dataAcordo: string;
  dataQuebra: string;
  valorAcordo: number;
  parcelas: number | null;
  parcelaPaga: number | null;
  cpf: string;
  valorDivida: number | null;
  diasAtraso: number;
  perfilRisco: "alto" | "medio" | "baixo";
  previsaoQuebra: boolean;
  motivo: string;
}

interface BoletosQuebradosChartProps {
  /** Summary rows per portfolio */
  portfolioRows: Array<{ nome: string; qtd: number }>;
  loading?: boolean;
}

export function BoletosQuebradosChart({ portfolioRows, loading }: BoletosQuebradosChartProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const max = Math.max(...portfolioRows.map((r) => r.qtd), 1);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Boletos Quebrados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-5 bg-muted rounded-sm animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Boletos Quebrados</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {portfolioRows.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Sem boletos quebrados no período.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {portfolioRows.map((row, i) => {
              const isSelected = selected === row.nome;
              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(isSelected ? null : row.nome)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(isSelected ? null : row.nome);
                    }
                  }}
                  title={`Clique para detalhar ${row.nome}`}
                  className={cn(
                    "flex items-center gap-2 rounded-sm -mx-1 px-1 py-0.5 cursor-pointer transition-colors hover:bg-rose-50/70",
                    isSelected && "bg-rose-50 ring-1 ring-rose-200",
                  )}
                >
                  <span className="w-32 shrink-0 text-[10px] text-right text-muted-foreground truncate" title={row.nome}>
                    {row.nome}
                  </span>
                  <div className="flex-1 h-4 bg-rose-50 rounded-sm overflow-hidden">
                    <div className="h-full bg-rose-400 rounded-sm" style={{ width: `${(row.qtd / max) * 100}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-[11px] font-semibold text-rose-600 text-right">{row.qtd}</span>
                  <ChevronRight className={cn("w-4 h-3 shrink-0 text-muted-foreground transition-transform", isSelected && "rotate-90")} />
                </div>
              );
            })}
          </div>
        )}

        {selected && <AcordoRiscoPanel tipo="quebrados" portfolio={selected} onClose={() => setSelected(null)} />}
      </CardContent>
    </Card>
  );
}
