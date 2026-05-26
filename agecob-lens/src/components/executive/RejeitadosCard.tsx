import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Ban } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtBRL } from "@/lib/metrics";
import { type DatabaseOption, fetchRejeitadosTotais, type RejeitadosTotaisRow } from "@/services/api";

interface Props {
  db: DatabaseOption;
  dateFrom: string;
  dateTo: string;
}

export default function RejeitadosCard({ db, dateFrom, dateTo }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RejeitadosTotaisRow | null>(null);

  useEffect(() => {
    setData(null);
    fetchRejeitadosTotais(db, dateFrom, dateTo)
      .then((env) => {
        const row = env.data[0];
        if (row) {
          setData({
            valor_total: Number(row.valor_total) || 0,
            valor_primeira_parcela: Number(row.valor_primeira_parcela) || 0,
            qtd_rejeitados: Number(row.qtd_rejeitados) || 0,
          });
        }
      })
      .catch(() => {});
  }, [db, dateFrom, dateTo]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-left transition-colors hover:bg-rose-100",
        )}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-rose-600" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-rose-600" />
        )}
        <Ban className="h-4 w-4 shrink-0 text-rose-600" />
        <span className="text-sm font-semibold text-rose-800">Rejeitados</span>
        {data && (
          <span className="ml-auto text-xs font-medium text-rose-700">
            {data.qtd_rejeitados.toLocaleString("pt-BR")} acordos
          </span>
        )}
      </button>

      {open && (
        <Card className="mt-2 p-5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Status: Rejeitado (ID_REC_STATUS = 7)
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Metric label="Valor Total" value={data ? fmtBRL(data.valor_total) : "—"} />
            <Metric label="Valor 1ª Parcela" value={data ? fmtBRL(data.valor_primeira_parcela) : "—"} />
            <Metric
              label="Acordos Rejeitados"
              value={data ? data.qtd_rejeitados.toLocaleString("pt-BR") : "—"}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums text-rose-700">{value}</div>
    </div>
  );
}
