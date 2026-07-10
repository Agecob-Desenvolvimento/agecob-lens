import { Download } from 'lucide-react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from 'agecob-lens';

export function ReportDownload() {
  return (
    <Dialog defaultOpen>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
          {[
            { id: 'kpis', label: 'KPIs do período', checked: true },
            { id: 'ranking', label: 'Ranking de agentes', checked: true },
            { id: 'excecoes', label: 'Exceções por portfólio', checked: false },
          ].map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2.5 text-sm cursor-pointer hover:bg-slate-50"
            >
              <Checkbox checked={s.checked} />
              {s.label}
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline">Cancelar</Button>
          <Button>Baixar CSV</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
