import { useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRLCompact } from "@/lib/metrics";
import { usePortfolioDetalhe } from "@/hooks/usePortfolioDetalhe";
import { mapAcordosQuebrados } from "@/selectors/quebradosSelectors";
import type { AcordoQuebrado } from "@/components/analise/BoletosQuebradosChart";

export type RiscoTipo = "excecoes" | "rejeitados" | "quebrados";

const RISK_LABEL: Record<AcordoQuebrado["perfilRisco"], string> = {
  alto: "Alto Risco",
  medio: "Médio Risco",
  baixo: "Baixo Risco",
};

export const TONE = {
  rose: {
    border: "border-rose-200",
    headBg: "bg-rose-50",
    headText: "text-rose-800",
    rowBorder: "border-rose-100",
    rowActive: "bg-rose-50",
    rowHover: "hover:bg-rose-50/50",
    valor: "text-rose-600",
    subBorder: "border-rose-200",
    subLabel: "text-rose-700",
  },
  orange: {
    border: "border-orange-200",
    headBg: "bg-orange-50",
    headText: "text-orange-800",
    rowBorder: "border-orange-100",
    rowActive: "bg-orange-50",
    rowHover: "hover:bg-orange-50/50",
    valor: "text-orange-600",
    subBorder: "border-orange-200",
    subLabel: "text-orange-700",
  },
  emerald: {
    border: "border-emerald-200",
    headBg: "bg-emerald-50",
    headText: "text-emerald-800",
    rowBorder: "border-emerald-100",
    rowActive: "bg-emerald-50",
    rowHover: "hover:bg-emerald-50/50",
    valor: "text-emerald-600",
    subBorder: "border-emerald-200",
    subLabel: "text-emerald-700",
  },
} as const;

const CONFIG: Record<RiscoTipo, { title: string; tone: keyof typeof TONE }> = {
  excecoes: { title: "Exceções", tone: "rose" },
  rejeitados: { title: "Rejeitados", tone: "orange" },
  quebrados: { title: "Boletos Quebrados", tone: "rose" },
};

function Detail({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className={cn("text-xs", highlight && "font-semibold text-foreground")}>{value}</div>
    </div>
  );
}

export function AcordoRow({
  acordo,
  isExpanded,
  isLast,
  onToggle,
  tone,
}: {
  acordo: AcordoQuebrado;
  isExpanded: boolean;
  isLast: boolean;
  onToggle: () => void;
  tone: typeof TONE[keyof typeof TONE];
}) {
  const parcelas =
    acordo.parcelaPaga != null && acordo.parcelas != null
      ? `${acordo.parcelaPaga}/${acordo.parcelas} pagas`
      : "—";
  const divida = acordo.valorDivida != null ? formatBRLCompact(acordo.valorDivida) : "—";
  return (
    <div className={cn(!isLast && "border-b", !isLast && tone.rowBorder)}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
          isExpanded ? tone.rowActive : cn("bg-white", tone.rowHover),
        )}
      >
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", isExpanded && "rotate-90")}
        />
        <span className="font-mono text-[11px] text-muted-foreground">{acordo.id}</span>
        <span className="text-xs font-medium">{acordo.devedor}</span>
        <span className="text-[11px] text-muted-foreground">agente: {acordo.agente}</span>
        <span className={cn("ml-auto text-xs font-semibold tabular-nums", tone.valor)}>
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
        <div className={cn("px-4 pb-4", tone.rowActive)}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className={cn("bg-white border rounded-md p-3.5", tone.subBorder)}>
              <div className={cn("text-[10px] font-bold uppercase tracking-[0.12em] mb-2", tone.subLabel)}>
                Detalhes do Acordo
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <Detail label="ID" value={acordo.id} />
                <Detail label="Agente" value={acordo.agente} />
                <Detail label="Data Acordo" value={acordo.dataAcordo} />
                <Detail label="Data Quebra" value={acordo.dataQuebra} />
                <Detail label="Valor" value={formatBRLCompact(acordo.valorAcordo)} highlight />
                <Detail label="Parcelas" value={parcelas} />
                <Detail label="Portfólio" value={acordo.portfolio} />
              </div>
            </div>

            <div className={cn("bg-white border rounded-md p-3.5", tone.subBorder)}>
              <div className={cn("text-[10px] font-bold uppercase tracking-[0.12em] mb-2", tone.subLabel)}>
                Perfil do Devedor
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <Detail label="Nome" value={acordo.devedor} />
                <Detail label="CPF" value={acordo.cpf} />
                <Detail label="Dívida Original" value={divida} />
                <Detail label="Dias Atraso" value={String(acordo.diasAtraso)} />
                <Detail label="Perfil Risco (est.)" value={RISK_LABEL[acordo.perfilRisco]} />
              </div>
            </div>
          </div>

          <div className={cn("mt-3 bg-white border rounded-md p-3.5", tone.subBorder)}>
            <div className={cn("text-[10px] font-bold uppercase tracking-[0.12em] mb-1", tone.subLabel)}>
              Diagnóstico (estimativa)
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{acordo.motivo}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Rich drill-down card for a clicked portfolio. Fetches on selection. */
export function AcordoRiscoPanel({
  tipo,
  portfolio,
  onClose,
}: {
  tipo: RiscoTipo;
  portfolio: string;
  onClose: () => void;
}) {
  const { rows, loading, error } = usePortfolioDetalhe(tipo, portfolio);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const acordos = mapAcordosQuebrados(rows, portfolio);
  const { title, tone } = CONFIG[tipo];
  const t = TONE[tone];

  return (
    <div className={cn("border rounded-lg overflow-hidden mt-2", t.border)}>
      <div className={cn("px-4 py-2.5 flex items-center justify-between", t.headBg)}>
        <span className={cn("text-xs font-semibold", t.headText)}>
          {title} — {portfolio}
          {!loading && !error && acordos.length > 0 && (
            <span className="font-normal opacity-70"> · {acordos.length} acordo(s)</span>
          )}
        </span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-black/5 transition-colors" aria-label="Fechar detalhes">
          <X className={cn("h-3.5 w-3.5", t.headText)} />
        </button>
      </div>
      <div className="p-1">
        {loading ? (
          <div className="space-y-1.5 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-5 bg-muted rounded-sm animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <p className="p-3 text-xs text-rose-600">{error}</p>
        ) : acordos.length === 0 ? (
          <p className="p-3 text-[11px] italic text-muted-foreground">Sem registros no período.</p>
        ) : (
          <>
            {acordos.map((acordo, i) => (
              <AcordoRow
                key={acordo.id}
                acordo={acordo}
                isExpanded={expandedId === acordo.id}
                isLast={i === acordos.length - 1}
                onToggle={() => setExpandedId(expandedId === acordo.id ? null : acordo.id)}
                tone={t}
              />
            ))}
            <p className="px-4 py-2 text-[10px] italic text-muted-foreground">
              Perfil de risco e previsão são estimativas por dias em atraso — não são saída de modelo.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default AcordoRiscoPanel;
