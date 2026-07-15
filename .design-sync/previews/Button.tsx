import { Download, Plus } from 'lucide-react';
import { Button } from 'agecob-lens';

export function Variants() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <Button variant="default">Salvar acordo</Button>
      <Button variant="secondary">Exportar CSV</Button>
      <Button variant="destructive">Excluir</Button>
      <Button variant="outline">Cancelar</Button>
      <Button variant="ghost">Ver detalhes</Button>
      <Button variant="link">Ir para o relatório</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
      <Button size="sm">Pequeno</Button>
      <Button size="default">Padrão</Button>
      <Button size="lg">Grande</Button>
      <Button size="icon" aria-label="Adicionar">
        <Plus />
      </Button>
    </div>
  );
}

export function WithIcon() {
  return (
    <Button className="bg-sky-600 hover:bg-sky-700 text-white gap-2">
      <Download className="h-4 w-4" />
      Baixar Relatório
    </Button>
  );
}

export function Disabled() {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <Button disabled>Processando…</Button>
      <Button variant="outline" disabled>
        Indisponível
      </Button>
    </div>
  );
}
