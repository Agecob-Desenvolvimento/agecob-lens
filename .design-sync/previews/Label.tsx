import { Label, Input } from 'agecob-lens';

export function Default() {
  return (
    <div className="flex flex-col gap-2 max-w-sm">
      <Label htmlFor="label-cpc">CPC</Label>
      <Input id="label-cpc" placeholder="Contatos no período" />
    </div>
  );
}

export function WithDisabledField() {
  return (
    <div className="flex flex-col gap-2 max-w-sm opacity-50">
      <Label htmlFor="label-conversao">Conversão</Label>
      <Input id="label-conversao" defaultValue="—" disabled />
    </div>
  );
}
