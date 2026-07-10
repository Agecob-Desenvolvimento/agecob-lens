import { Badge } from 'agecob-lens';

export function Variants() {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">Positivo</Badge>
      <Badge variant="secondary">Médio</Badge>
      <Badge variant="destructive">Crítico</Badge>
      <Badge variant="outline">Baixo</Badge>
    </div>
  );
}

export function StatusExample() {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="destructive">Alto risco</Badge>
      <Badge variant="default">Meta atingida</Badge>
    </div>
  );
}
