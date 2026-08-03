import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from 'agecob-lens';

export function ExcecoesPortfolio() {
  return (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant="outline">Ver exceções</Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Exceções — Portfólio Alfa</SheetTitle>
          <SheetDescription>
            18 acordos em exceção hoje, totalizando R$ 212 mil sobre o valor de acordos.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2" style={{ padding: '16px 0' }}>
          {[
            { agente: 'Marina Souza', valor: 'R$ 34.500', status: 'Crítico' },
            { agente: 'Rafael Lima', valor: 'R$ 18.900', status: 'Médio' },
            { agente: 'Carla Nunes', valor: 'R$ 12.300', status: 'Baixo' },
          ].map((row) => (
            <div
              key={row.agente}
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              <span className="font-medium">{row.agente}</span>
              <span className="text-slate-500">{row.valor}</span>
            </div>
          ))}
        </div>

        <SheetFooter>
          <Button variant="outline">Cancelar</Button>
          <Button>Exportar</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
