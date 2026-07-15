import { Separator } from 'agecob-lens';

export function Horizontal() {
  return (
    <div className="flex flex-col gap-2 max-w-md">
      <div className="space-y-2">
        <span className="text-sm font-medium">Portfólio Basal</span>
        <span className="text-xs text-slate-500">Σ valor_acordos / Σ qtd_acordos — Ticket médio R$ 1.842,00</span>
      </div>
      <Separator />
      <div className="space-y-2">
        <span className="text-sm font-medium">Portfólio Bradesco</span>
        <span className="text-xs text-slate-500">Σ valor_acordos / Σ qtd_acordos — Ticket médio R$ 2.105,00</span>
      </div>
    </div>
  );
}

export function Vertical() {
  return (
    <div className="flex items-center gap-4" style={{ height: '2.5rem' }}>
      <span className="text-sm font-medium">Conversão 32,4%</span>
      <Separator orientation="vertical" />
      <span className="text-sm font-medium">CPC 1.204</span>
      <Separator orientation="vertical" />
      <span className="text-sm font-medium">Exceções 6,8%</span>
    </div>
  );
}
