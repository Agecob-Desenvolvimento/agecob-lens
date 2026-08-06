import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AcordoRow, TONE } from "@/components/analise/AcordoRiscoPanel";
import { useHomeKpiDetalhe, type HomeKpiDetalheKind } from "@/hooks/useHomeKpiDetalhe";
import { mapAcordosQuebrados } from "@/selectors/quebradosSelectors";
import { formatBRLCompact } from "@/lib/metrics";

type SumField = "valor_total" | "valor_primeira_parcela";

const KIND_CFG: Record<HomeKpiDetalheKind, { title: string; tone: keyof typeof TONE; empty: string; sum: SumField }> = {
  excecoes: { title: "Exceções", tone: "orange", empty: "Nenhuma exceção no período.", sum: "valor_total" },
  rejeitados: { title: "Rejeitados", tone: "rose", empty: "Nenhum rejeitado no período.", sum: "valor_total" },
  acordos: { title: "Valor de Acordos", tone: "emerald", empty: "Nenhum acordo gerado no período.", sum: "valor_total" },
  primeira_parcela: { title: "1ª Parcela", tone: "emerald", empty: "Nenhum acordo gerado no período.", sum: "valor_primeira_parcela" },
};

/** Right sidebar listing all rejeitados / exceções acordos of the period (todas
 *  as carteiras). Each row expands into the same detail blocks as AcordoRiscoPanel. */
export function HomeKpiDetalheSheet({
  kind,
  onClose,
}: {
  kind: HomeKpiDetalheKind | null;
  onClose: () => void;
}) {
  const { rows, loading, error } = useHomeKpiDetalhe(kind);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const acordos = mapAcordosQuebrados(rows, "—");
  const cfg = kind ? KIND_CFG[kind] : null;
  const valorTotal = rows.reduce((acc, r) => acc + (Number(r[cfg?.sum ?? "valor_total"]) || 0), 0);
  const t = TONE[cfg?.tone ?? "rose"];

  return (
    <Sheet open={!!kind} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 overflow-y-auto">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="text-sm">
            {cfg?.title}
            {!loading && !error && acordos.length > 0 && (
              <span className="font-normal text-muted-foreground">
                {" "}· {acordos.length} acordo(s) · {formatBRLCompact(valorTotal)}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="p-1">
          {loading ? (
            <div className="space-y-1.5 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-5 bg-muted rounded-sm animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <p className="p-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>
          ) : acordos.length === 0 ? (
            <p className="p-3 text-[11px] italic text-muted-foreground">{cfg?.empty}</p>
          ) : (
            acordos.map((acordo, i) => (
              <AcordoRow
                key={acordo.id}
                acordo={acordo}
                isExpanded={expandedId === acordo.id}
                isLast={i === acordos.length - 1}
                onToggle={() => setExpandedId(expandedId === acordo.id ? null : acordo.id)}
                tone={t}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default HomeKpiDetalheSheet;
