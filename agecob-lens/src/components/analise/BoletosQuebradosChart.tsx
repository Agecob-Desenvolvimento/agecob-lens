import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatBRLCompact } from "@/lib/metrics";

export interface AcordoQuebrado {
  id: string;
  portfolio: string;
  devedor: string;
  agente: string;
  mat: string;
  dataAcordo: string;
  dataQuebra: string;
  valorAcordo: number;
  parcelas: number;
  parcelaPaga: number;
  cpf: string;
  valorDivida: number;
  diasAtraso: number;
  perfilRisco: "alto" | "medio" | "baixo";
  previsaoQuebra: boolean;
  motivo: string;
}

const RISK_LABEL: Record<AcordoQuebrado["perfilRisco"], string> = {
  alto: "Alto Risco",
  medio: "Médio Risco",
  baixo: "Baixo Risco",
};

const RISK_CLASS: Record<AcordoQuebrado["perfilRisco"], string> = {
  alto: "bg-rose-50 text-rose-700",
  medio: "bg-amber-50 text-amber-700",
  baixo: "bg-emerald-50 text-emerald-700",
};

function Detail({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className={cn("text-xs", highlight && "font-semibold text-foreground")}>{value}</div>
    </div>
  );
}

interface BoletosQuebradosChartProps {
  /** Summary rows per portfolio */
  portfolioRows: Array<{ nome: string; qtd: number }>;
  /** Detailed broken agreements (empty = awaiting backend endpoint) */
  detalhes: AcordoQuebrado[];
  loading?: boolean;
}

export function BoletosQuebradosChart({ portfolioRows, detalhes, loading }: BoletosQuebradosChartProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        {/* Portfolio summary */}
        {portfolioRows.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Sem boletos quebrados no período.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {portfolioRows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-32 shrink-0 text-[10px] text-right text-muted-foreground truncate">
                  {row.nome}
                </span>
                <div className="flex-1 h-4 bg-rose-50 rounded-sm overflow-hidden">
                  <div className="h-full bg-rose-400 rounded-sm" style={{ width: "100%" }} />
                </div>
                <span className="w-8 shrink-0 text-[11px] font-semibold text-rose-600 text-right">
                  {row.qtd}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Detail rows */}
        {detalhes.length > 0 && (
          <div className="border border-rose-200 rounded-lg overflow-hidden">
            {detalhes.map((acordo, i) => {
              const isExpanded = expandedId === acordo.id;
              const isLast = i === detalhes.length - 1;
              return (
                <div key={acordo.id} className={cn(!isLast && "border-b border-rose-100")}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : acordo.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                      isExpanded ? "bg-rose-50" : "bg-white hover:bg-rose-50/50",
                    )}
                  >
                    <ChevronRight
                      className={cn(
                        "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
                        isExpanded && "rotate-90",
                      )}
                    />
                    <span className="font-mono text-[11px] text-muted-foreground">{acordo.id}</span>
                    <span className="text-xs font-medium">{acordo.devedor}</span>
                    <span className="text-[11px] text-muted-foreground">agente: {acordo.agente}</span>
                    <span className="ml-auto text-xs font-semibold text-rose-600 tabular-nums">
                      {formatBRLCompact(acordo.valorAcordo)}
                    </span>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-semibold",
                        acordo.previsaoQuebra ? "bg-rose-100 text-rose-800" : "bg-orange-100 text-orange-800",
                      )}
                    >
                      {acordo.previsaoQuebra ? "Prevista" : "Inesperada"}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 bg-rose-50">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <div className="bg-white border border-rose-200 rounded-md p-3.5">
                          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-700 mb-2">
                            Detalhes do Acordo
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                            <Detail label="ID" value={acordo.id} />
                            <Detail label="Agente" value={`${acordo.agente} (${acordo.mat})`} />
                            <Detail label="Data Acordo" value={acordo.dataAcordo} />
                            <Detail label="Data Quebra" value={acordo.dataQuebra} />
                            <Detail label="Valor" value={formatBRLCompact(acordo.valorAcordo)} highlight />
                            <Detail label="Parcelas" value={`${acordo.parcelaPaga}/${acordo.parcelas} pagas`} />
                            <Detail label="Portfólio" value={acordo.portfolio} />
                          </div>
                        </div>

                        <div className="bg-white border border-rose-200 rounded-md p-3.5">
                          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-700 mb-2">
                            Perfil do Devedor
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                            <Detail label="Nome" value={acordo.devedor} />
                            <Detail label="CPF" value={acordo.cpf} />
                            <Detail label="Dívida Original" value={formatBRLCompact(acordo.valorDivida)} />
                            <Detail label="Dias Atraso" value={String(acordo.diasAtraso)} />
                            <Detail label="Perfil Risco" value={RISK_LABEL[acordo.perfilRisco]} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 bg-white border border-rose-200 rounded-md p-3.5">
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-700 mb-1">
                          Diagnóstico
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{acordo.motivo}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
