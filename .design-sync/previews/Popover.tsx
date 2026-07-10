import { Info } from 'lucide-react';
import { Button, Popover, PopoverContent, PopoverTrigger } from 'agecob-lens';

export function ConversaoInfo() {
  return (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon">
          <Info className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="space-y-2">
          <p className="text-sm font-semibold">Conversão</p>
          <p className="text-sm text-slate-600">
            Σ boletos pagos no prazo / Σ CPC (contatos) × 100. Comparado com a
            média do escritório dos últimos 3 meses.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
