import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatBRLCompact } from "@/lib/metrics";
import BlockHeader from "@/components/executive/BlockHeader";
import { useAgenteDetalheViewModel, type AgenteAcordoItem } from "@/hooks/useAgenteDetalheViewModel";

// ── Presentational mini-card ──────────────────────────────────

function MiniCard({
  title, items, loading, color,
}: {
  title: string;
  items: AgenteAcordoItem[];
  loading: boolean;
  color: "rose" | "orange";
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const colors = color === "rose"
    ? { bg: "bg-rose-50", fill: "text-rose-600" }
    : { bg: "bg-orange-50", fill: "text-orange-600" };

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-semibold">{title} ({items.length})</CardTitle></CardHeader>
      <CardContent className="space-y-1.5">
        {loading ? (
          <div className="space-y-1.5">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-4 bg-muted rounded-sm animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhum registro.</p>
        ) : (
          items.map((item) => {
            const open = expanded === item.id;
            return (
              <div key={item.id}>
                <button onClick={() => setExpanded(open ? null : item.id)} className={cn("w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs transition-colors", open ? colors.bg : "hover:bg-muted/30")}>
                  <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
                  <span className="font-mono text-[10px] text-muted-foreground w-14">{item.id}</span>
                  <span className="truncate flex-1">{item.devedor}</span>
                  <span className={cn("font-semibold tabular-nums shrink-0", colors.fill)}>{formatBRLCompact(item.valor)}</span>
                </button>
                {open && (
                  <div className={cn("px-3 py-2 text-[10px] space-y-1", colors.bg)}>
                    <div><span className="text-muted-foreground">Acordo:</span> {item.dataAcordo} · Venc: {item.dataVencimento}</div>
                    <div><span className="text-muted-foreground">CPF:</span> {item.cpf} · Atraso: {item.diasAtraso}d</div>
                    <div className="text-muted-foreground">{item.motivo}</div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

// ── Section (page-level) ──────────────────────────────────────

export default function AgenteDetalheSection({ agente }: { agente: string }) {
  const vm = useAgenteDetalheViewModel(agente);

  return (
    <section className="space-y-4">
      <BlockHeader number="4" title="Acordos do Agente" description={`Exceções, rejeitados e quebrados de ${agente}.`} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <MiniCard title="Exceções" items={vm.excecoes} loading={vm.loading} color="rose" />
        <MiniCard title="Rejeitados" items={vm.rejeitados} loading={vm.loading} color="orange" />
        <MiniCard title="Quebrados" items={vm.quebrados} loading={vm.loading} color="rose" />
      </div>
    </section>
  );
}
