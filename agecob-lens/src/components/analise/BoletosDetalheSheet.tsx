import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AcordoRow, TONE } from "@/components/analise/AcordoRiscoPanel";
import { useBoletosDetalhe } from "@/hooks/useBoletosDetalhe";
import { mapAcordosQuebrados } from "@/selectors/quebradosSelectors";
import { formatBRLCompact } from "@/lib/metrics";
import type { BoletosDetalheKind } from "@/services/api";
import type { TipoParcela } from "@/hooks/useEfetividadeViewModel";

const KIND_CFG: Record<BoletosDetalheKind, { title: string; tone: keyof typeof TONE; empty: string }> = {
  a_vencer: { title: "Boletos a Vencer", tone: "rose", empty: "Nenhum boleto a vencer no período." },
  vencidos_nao_pagos: { title: "Vencidos não Pagos", tone: "orange", empty: "Nenhum boleto vencido não pago no período." },
  quebrados: { title: "Boletos Quebrados", tone: "rose", empty: "Nenhum boleto quebrado no período." },
  pagos_prazo: { title: "Pagos no Prazo", tone: "emerald", empty: "Nenhum boleto pago no prazo no período." },
};

/** Right sidebar listing boletos de um KPI (a vencer / vencidos não pagos / quebrados).
 *  Each row expands into the same detail blocks as AcordoRiscoPanel. */
export function BoletosDetalheSheet({
  kind,
  onClose,
  tipo,
}: {
  kind: BoletosDetalheKind | null;
  onClose: () => void;
  tipo: TipoParcela;
}) {
  const { rows, loading, error } = useBoletosDetalhe(kind, tipo);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const acordos = mapAcordosQuebrados(rows, "—");
  const valorTotal = acordos.reduce((acc, a) => acc + a.valorAcordo, 0);
  const cfg = kind ? KIND_CFG[kind] : null;
  const t = TONE[cfg?.tone ?? "rose"];

  return (
    <Sheet open={!!kind} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 overflow-y-auto">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="text-sm">
            {cfg?.title}
            {!loading && !error && acordos.length > 0 && (
              <span className="font-normal text-muted-foreground">
                {" "}· {acordos.length} boleto(s) · {formatBRLCompact(valorTotal)}
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

export default BoletosDetalheSheet;
