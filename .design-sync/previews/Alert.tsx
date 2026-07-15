import { AlertTriangle, TrendingUp } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from 'agecob-lens';

export function Default() {
  return (
    <Alert className="max-w-md">
      <TrendingUp className="h-4 w-4" />
      <AlertTitle>Conversão acima da média</AlertTitle>
      <AlertDescription>
        A conversão do escritório está 8% acima da média dos últimos 3 meses.
      </AlertDescription>
    </Alert>
  );
}

export function Destructive() {
  return (
    <Alert variant="destructive" className="max-w-md">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Falha ao carregar indicadores</AlertTitle>
      <AlertDescription>Tente novamente em instantes.</AlertDescription>
    </Alert>
  );
}
