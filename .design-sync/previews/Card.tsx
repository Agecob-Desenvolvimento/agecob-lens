import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button } from 'agecob-lens';

export function KpiCard() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Conversão</CardTitle>
        <CardDescription>vs. média do escritório</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1">
          <span style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.01em' }}>32,4%</span>
          <span className="text-xs text-slate-500">Σ boletos pagos / Σ contatos (CPC)</span>
        </div>
      </CardContent>
      <CardFooter>
        <span className="text-xs text-slate-500">Atualizado há 5 min</span>
      </CardFooter>
    </Card>
  );
}

export function SimpleCard() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Ticket médio</CardTitle>
        <CardDescription>Σ valor_acordos / Σ qtd_acordos</CardDescription>
      </CardHeader>
      <CardContent>
        <span style={{ fontSize: '1.75rem', fontWeight: 700 }}>R$ 1.842,00</span>
      </CardContent>
    </Card>
  );
}

export function CardWithAction() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Exceções</CardTitle>
        <CardDescription>Portfólio Alfa — Σ valor_exceções / Σ valor_acordos</CardDescription>
      </CardHeader>
      <CardContent>
        <span style={{ fontSize: '1.75rem', fontWeight: 700 }}>6,8%</span>
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm">
          Ver detalhes
        </Button>
      </CardFooter>
    </Card>
  );
}
