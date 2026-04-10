import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Cell, LabelList,
} from "recharts";

const TEAL = "#6AAEB0";

const AGENTS = [
  "Todos",
  "Adriana Matos M Fernandes (amfernandes1)",
  "Andressa Magalhaes Santos 1 (andmsantos1)",
  "Danilo Rodrigues de Oliveira 1 (daaroliveira1)",
  "HENRIQUE CARRIJO DE SOUZA (hcarrijos)",
  "Ieska endes Pereira 1 (impereira1)",
  "Jordana O Da Conceicao 1 (joceccato1)",
  "LARISSA L A DE OLIVEIRA (larioli)",
  "Luciana Pereira de Miranda 1 (lmmiiranda1)",
];

const tabulacaoData = [
  { tabulacao: "Total", quantidade: 432, proporcao: "52%", tma: "00:00:40", bold: true },
  { tabulacao: "Contato", quantidade: 101, proporcao: "12%", tma: "00:01:16" },
  { tabulacao: "Indefinido", quantidade: 153, proporcao: "19%", tma: "00:00:33" },
  { tabulacao: "Recado", quantidade: 6, proporcao: "1%", tma: "00:00:54" },
  { tabulacao: "Telefone Errado", quantidade: 172, proporcao: "21%", tma: "00:00:25" },
];

const contatosData = [
  { name: "Informação", bar: 60, line: "00:01:19", lineVal: 79 },
  { name: "Envio de 2ª via de boleto", bar: 10, line: "00:01:57", lineVal: 117 },
  { name: "Ligação Interrompida / Ruim", bar: 45, line: "00:00:22", lineVal: 22 },
  { name: "Monitoração de acordo", bar: 120, line: "00:01:11", lineVal: 71 },
  { name: "Promessa de pagamento", bar: 55, line: "00:03:13", lineVal: 193 },
  { name: "Sem previsão de pagamento", bar: 40, line: "00:02:00", lineVal: 120 },
  { name: "Solicita contato em outro dia/hora", bar: 50, line: "00:00:29", lineVal: 29 },
  { name: "Retorno do Ativo", bar: 70, line: "00:03:22", lineVal: 202 },
];

const acordosData = [
  { tipo: "Exceção", vencimento: "22/04/2026 00:00:00", parcelamento: 30, valorAcordo: "R$13.080", valor1a: "R$436", valorOutras: "R$436" },
  { tipo: "Acordo", vencimento: "22/04/2026 00:00:00", parcelamento: 20, valorAcordo: "R$4.497", valor1a: "R$250", valorOutras: "R$224" },
  { tipo: "Exceção", vencimento: "27/04/2026 00:00:00", parcelamento: 42, valorAcordo: "R$8.490", valor1a: "R$202", valorOutras: "R$202" },
];

function ContatosTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <p className="font-semibold">{d?.name}</p>
      <p>Quantidade: {d?.bar}</p>
      <p>TMA: {d?.line}</p>
    </div>
  );
}

export default function DetalhamentoAgentes() {
  const [category, setCategory] = useState("Todas");
  const [carteira, setCarteira] = useState("Geral");
  const [assessoria, setAssessoria] = useState("Todas");
  const [selectedAgent, setSelectedAgent] = useState("Todos");

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Bar */}
          <header className="border-b border-border px-6 py-3 flex items-center justify-between bg-card">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <h1 className="text-sm font-semibold text-foreground">
                Dashboard SpecOps Supervisor : Detalhamento Agentes
              </h1>
            </div>
            <span className="text-xs text-muted-foreground capitalize">{today}</span>
          </header>

          <div className="flex-1 flex min-w-0">
            {/* Agent Sidebar */}
            <aside className="w-52 shrink-0 border-r border-border bg-card overflow-y-auto">
              <div className="px-4 pt-4 pb-2">
                <h2 className="text-sm font-bold text-[hsl(210,50%,20%)]">Agente</h2>
              </div>
              <div className="px-3 space-y-1 pb-4">
                {AGENTS.map((agent) => (
                  <button
                    key={agent}
                    onClick={() => setSelectedAgent(agent)}
                    className={`w-full text-left text-xs px-3 py-2 rounded-md transition-colors ${
                      selectedAgent === agent
                        ? "bg-[#c8e6c9] text-[hsl(210,50%,20%)] font-semibold"
                        : "text-[hsl(210,50%,25%)] hover:bg-muted"
                    }`}
                  >
                    {agent}
                  </button>
                ))}
              </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30">
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Category</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 flex gap-2">
                    {["Todas", "Autos"].map((opt) => (
                      <Button key={opt} size="sm" variant={category === opt ? "default" : "outline"}
                        onClick={() => setCategory(opt)}
                        className={`flex-1 text-xs ${category === opt ? "bg-[#c8e6c9] text-foreground hover:bg-[#a5d6a7] border-[#c8e6c9]" : ""}`}
                      >{opt}</Button>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Carteira</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 flex gap-2">
                    {["Geral", "Others"].map((opt) => (
                      <Button key={opt} size="sm" variant={carteira === opt ? "default" : "outline"}
                        onClick={() => setCarteira(opt)}
                        className={`flex-1 text-xs ${carteira === opt ? "bg-[#c8e6c9] text-foreground hover:bg-[#a5d6a7] border-[#c8e6c9]" : ""}`}
                      >{opt}</Button>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Assessoria</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <Select value={assessoria} onValueChange={setAssessoria}>
                      <SelectTrigger className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Todas">Todas</SelectItem>
                        <SelectItem value="963:AGECOB_LP">963:AGECOB_LP</SelectItem>
                        <SelectItem value="929:LP_COB">929:LP_COB</SelectItem>
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              </div>

              {/* Logo */}
              <div className="text-center py-1">
                <span className="text-lg font-bold tracking-widest text-foreground">
                  ITAPEVA - Dashboard SpecOps Supervisor
                </span>
              </div>

              {/* 2x2 Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Card 1: Tabulação de Acionamentos */}
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4 text-center">
                    <CardTitle className="text-sm font-bold text-[hsl(210,50%,20%)]">
                      Tabulação de Acionamentos
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs font-semibold">Tabulação</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Quantidade</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Proporção</TableHead>
                          <TableHead className="text-xs font-semibold text-right">TMA</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tabulacaoData.map((row) => (
                          <TableRow key={row.tabulacao}>
                            <TableCell className={`text-xs ${row.bold ? "font-bold" : ""}`}>{row.tabulacao}</TableCell>
                            <TableCell className={`text-xs text-right ${row.bold ? "font-bold" : ""}`}>{row.quantidade}</TableCell>
                            <TableCell className={`text-xs text-right ${row.bold ? "font-bold" : ""}`}>{row.proporcao}</TableCell>
                            <TableCell className={`text-xs text-right ${row.bold ? "font-bold" : ""}`}>{row.tma}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Card 2: Contatos (Combo Chart) */}
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4 text-center">
                    <CardTitle className="text-sm font-bold text-[hsl(210,50%,20%)]">Contatos</CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-3">
                    <div style={{ height: 280 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={contatosData} margin={{ top: 20, right: 10, left: 0, bottom: 60 }}>
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 9, fill: "hsl(210,10%,40%)" }}
                            angle={-35}
                            textAnchor="end"
                            interval={0}
                            height={70}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis hide />
                          <Tooltip content={<ContatosTooltip />} />
                          <Bar dataKey="bar" fill={TEAL} radius={[3, 3, 0, 0]} barSize={30} />
                          <Line
                            dataKey="lineVal"
                            stroke={TEAL}
                            strokeWidth={2}
                            dot={{ r: 4, fill: TEAL, stroke: "#fff", strokeWidth: 2 }}
                          >
                            <LabelList
                              dataKey="line"
                              position="top"
                              fontSize={9}
                              fill="hsl(210,10%,50%)"
                              offset={8}
                            />
                          </Line>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Card 3: Log e Pausas */}
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4 text-center">
                    <CardTitle className="text-sm font-bold text-[hsl(210,50%,20%)]">Log e Pausas</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div style={{ height: 120 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[{ name: "Trabalhando", value: 100, label: "06:38:07", rest: "00:00:00" }]}
                          layout="vertical"
                          margin={{ top: 5, right: 60, left: 80, bottom: 5 }}
                        >
                          <XAxis type="number" hide domain={[0, 100]} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            tick={{ fontSize: 12, fill: "hsl(210,10%,30%)" }}
                            axisLine={false}
                            tickLine={false}
                            width={75}
                          />
                          <Bar dataKey="value" fill={TEAL} radius={[0, 4, 4, 0]} barSize={36}>
                            <LabelList
                              dataKey="label"
                              position="center"
                              fill="#fff"
                              fontSize={13}
                              fontWeight={600}
                            />
                            <LabelList
                              dataKey="rest"
                              position="right"
                              fill="hsl(210,10%,40%)"
                              fontSize={12}
                              offset={8}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Card 4: Acordos e Exceções */}
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4 text-center">
                    <CardTitle className="text-sm font-bold text-[hsl(210,50%,20%)]">Acordos e Exceções</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs font-semibold">TipoAcordo</TableHead>
                          <TableHead className="text-xs font-semibold">Vencimento 1ª Parcela</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Parcelamento</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Valor do Acordo</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Valor 1ª Parcela</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Valor Outras Parcelas</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {acordosData.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{row.tipo}</TableCell>
                            <TableCell className="text-xs">{row.vencimento}</TableCell>
                            <TableCell className="text-xs text-right">{row.parcelamento}</TableCell>
                            <TableCell className="text-xs text-right">{row.valorAcordo}</TableCell>
                            <TableCell className="text-xs text-right">{row.valor1a}</TableCell>
                            <TableCell className="text-xs text-right">{row.valorOutras}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </main>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
