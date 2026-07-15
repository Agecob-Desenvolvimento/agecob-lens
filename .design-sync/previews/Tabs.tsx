import { Tabs, TabsList, TabsTrigger, TabsContent } from 'agecob-lens';

export function Default() {
  return (
    <Tabs defaultValue="visao-geral" className="max-w-lg">
      <TabsList>
        <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
        <TabsTrigger value="detalhamento">Detalhamento</TabsTrigger>
        <TabsTrigger value="historico">Histórico</TabsTrigger>
      </TabsList>
      <TabsContent value="visao-geral">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Conversão: 32,4%</span>
          <span className="text-xs text-slate-500">Σ boletos pagos / Σ contatos (CPC) — período atual</span>
        </div>
      </TabsContent>
      <TabsContent value="detalhamento">
        <span className="text-sm text-slate-600">Detalhamento por agente e portfólio disponível abaixo.</span>
      </TabsContent>
      <TabsContent value="historico">
        <span className="text-sm text-slate-600">Últimos 30 dias de acordos gerados.</span>
      </TabsContent>
    </Tabs>
  );
}

export function SecondTabActive() {
  return (
    <Tabs defaultValue="detalhamento" className="max-w-lg">
      <TabsList>
        <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
        <TabsTrigger value="detalhamento">Detalhamento</TabsTrigger>
        <TabsTrigger value="historico">Histórico</TabsTrigger>
      </TabsList>
      <TabsContent value="visao-geral">
        <span className="text-sm text-slate-600">Resumo executivo do dia.</span>
      </TabsContent>
      <TabsContent value="detalhamento">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Portfólio Bradesco — 128 acordos</span>
          <span className="text-xs text-slate-500">Ticket médio R$ 1.842,00</span>
        </div>
      </TabsContent>
      <TabsContent value="historico">
        <span className="text-sm text-slate-600">Últimos 30 dias de acordos gerados.</span>
      </TabsContent>
    </Tabs>
  );
}
