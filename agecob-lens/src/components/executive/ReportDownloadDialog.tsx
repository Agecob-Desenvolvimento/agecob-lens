import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { buildReportCsv, downloadCsv, type ReportSection } from "@/lib/csvReport";

/** Toggle + seletor de itens do dashboard para baixar como relatório CSV.
 *  Só itens com dados no filtro atual ficam selecionáveis. */
export function ReportDownloadDialog({
  meta,
  sections,
  filename,
}: {
  meta: Record<string, string>;
  sections: ReportSection[];
  filename: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const available = sections.filter((s) => s.available);

  const onOpenChange = (v: boolean) => {
    if (v) setSelected(new Set(available.map((s) => s.id)));
    setOpen(v);
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = available.filter((s) => selected.has(s.id));

  const handleDownload = () => {
    if (chosen.length === 0) return;
    downloadCsv(filename, buildReportCsv(meta, chosen));
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-sky-600 hover:bg-sky-700 text-white gap-2">
          <Download className="h-4 w-4" />
          Baixar Relatório
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Montar Relatório</DialogTitle>
          <DialogDescription>
            Selecione o que incluir. Usa o período e banco do filtro atual.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[55vh] overflow-y-auto py-1">
          {sections.map((s) => (
            <label
              key={s.id}
              className={
                "flex items-center gap-3 rounded-md border border-slate-200 dark:border-border px-3 py-2.5 text-sm " +
                (s.available ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5" : "opacity-50")
              }
            >
              <Checkbox
                checked={selected.has(s.id)}
                disabled={!s.available}
                onCheckedChange={() => s.available && toggle(s.id)}
              />
              <span className="flex-1 text-slate-700 dark:text-slate-200">{s.label}</span>
              {!s.available && (
                <span className="text-[10px] uppercase tracking-wide text-slate-400">sem dados</span>
              )}
            </label>
          ))}
        </div>

        <DialogFooter className="sm:justify-between sm:items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">{chosen.length} seção(ões) selecionada(s)</span>
          <Button onClick={handleDownload} disabled={chosen.length === 0} className="gap-2">
            <Download className="h-4 w-4" />
            Baixar CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ReportDownloadDialog;
