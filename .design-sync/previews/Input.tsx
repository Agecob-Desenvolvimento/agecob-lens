import { Input, Label } from 'agecob-lens';

export function Default() {
  return (
    <div className="flex flex-col gap-2 max-w-sm">
      <Label htmlFor="input-busca">Buscar agente</Label>
      <Input id="input-busca" placeholder="Buscar agente ou matrícula" />
    </div>
  );
}

export function Filled() {
  return (
    <div className="flex flex-col gap-2 max-w-sm">
      <Label htmlFor="input-portfolio">Portfólio</Label>
      <Input id="input-portfolio" defaultValue="Bradesco" />
    </div>
  );
}

export function Disabled() {
  return (
    <div className="flex flex-col gap-2 max-w-sm">
      <Label htmlFor="input-disabled">Ticket médio</Label>
      <Input id="input-disabled" defaultValue="R$ 1.61 mi" disabled />
    </div>
  );
}
