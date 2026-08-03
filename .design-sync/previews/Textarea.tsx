import { Textarea, Label } from 'agecob-lens';

export function Default() {
  return (
    <div className="flex flex-col gap-2 max-w-md">
      <Label htmlFor="textarea-obs">Observação da exceção</Label>
      <Textarea id="textarea-obs" placeholder="Descreva o motivo da exceção antes de aprovar o acordo" />
    </div>
  );
}

export function Filled() {
  return (
    <div className="flex flex-col gap-2 max-w-md">
      <Label htmlFor="textarea-notas">Notas do agente</Label>
      <Textarea
        id="textarea-notas"
        defaultValue="Devedor solicitou renegociação da 1ª parcela; acordo revisado e enviado para aprovação do portfólio Alfa."
      />
    </div>
  );
}

export function Disabled() {
  return (
    <div className="flex flex-col gap-2 max-w-md">
      <Label htmlFor="textarea-disabled">Justificativa (bloqueada)</Label>
      <Textarea id="textarea-disabled" defaultValue="Acordo já aprovado — edição desabilitada." disabled />
    </div>
  );
}
