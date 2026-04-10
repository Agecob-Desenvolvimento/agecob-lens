import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Undo2, Redo2, RefreshCw, List, Share2, ChevronDown, X } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";

/* ── Static data ── */
const excecoesData = [
  { name: "AGECOB_LP", valor: 21570, qtd: 2 },
];

const acordosEscData = [
  { name: "AGECOB_LP", valor: 13427, qtd: 2 },
];

const acordosPortData = [
  { name: "Santander Financeira XXVIII", valor: 8929, qtd: 1 },
  { name: "Santander Financeira XXVII", valor: 4497, qtd: 1 },
];

const kpis = [
  { label: "Qtd Exceções", value: "2" },
  { label: "Valor Exceções", value: "R$21.570" },
  { label: "Qtd Acordos", value: "2" },
  { label: "Valor Acordos", value: "R$13.427" },
  { label: "Valor Acordos (dentro ...", value: "R$1.050" },
  { label: "Conversão", value: "2%" },
];

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

/* ── Custom Tooltips ── */
function ExcecoesTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border bg-card p-3 shadow-md text-sm space-y-1">
      <p><span className="text-muted-foreground">Team Business Unit:</span> {d.name}</p>
      <p><span className="text-muted-foreground">Valor Exceções:</span> {fmt(d.valor)}</p>
      <p><span className="text-muted-foreground">Qtd Exceções:</span> {d.qtd}</p>
    </div>
  );
}

function AcordosEscTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border bg-card p-3 shadow-md text-sm space-y-1">
      <p><span className="text-muted-foreground">Team Business Unit:</span> {d.name}</p>
      <p><span className="text-muted-foreground">Valor Acordos:</span> {fmt(d.valor)}</p>
      <p><span className="text-muted-foreground">Qtd Acordos:</span> {d.qtd}</p>
    </div>
  );
}

function AcordosPortTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border bg-card p-3 shadow-md text-sm space-y-1">
      <p><span className="text-muted-foreground">Portfolioname:</span> {d.name}</p>
      <p><span className="text-muted-foreground">Valor Acordos:</span> {fmt(d.valor)}</p>
      <p><span className="text-muted-foreground">Qtd Acordos:</span> {d.qtd}</p>
    </div>
  );
}

/* ── Page ── */
export default function AnaliseProdutividade() {
  const [category, setCategory] = useState("(Todos)");
  const [carteira, setCarteira] = useState("(Todos)");
  const [teamBU, setTeamBU] = useState("(Todos)");
  const [portfolio, setPortfolio] = useState("(Todos)");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          {/* ── Top Bar ── */}
          <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <Undo2 className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground" />
              <Redo2 className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground" />
              <RefreshCw className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground" />
              <List className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground" />
            </div>
            <h1 className="text-sm font-semibold text-foreground tracking-tight">
              Dashboard SpecOps Supervisor : Análise de Produtividade
            </h1>
            <div className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground" />
              <ChevronDown className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground" />
              <X className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground" />
            </div>
          </header>

          {/* ── Main Content ── */}
          <div className="flex-1 bg-background p-6 space-y-6 overflow-auto">
            {/* ── Filters ── */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Category */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4" style={{ backgroundColor: "#E1DF4F" }}>
                  <CardTitle className="text-sm font-bold text-gray-900">Category</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-3 flex gap-2">
                  {["(Todos)", "Autos"].map((opt) => (
                    <Button
                      key={opt}
                      size="sm"
                      variant={category === opt ? "default" : "outline"}
                      onClick={() => setCategory(opt)}
                      className={
                        category === opt
                          ? "flex-1 bg-[#E1DF4F] text-gray-900 hover:bg-[#d4d240] border-[#d4d240]"
                          : "flex-1"
                      }
                    >
                      {opt}
                    </Button>
                  ))}
                </CardContent>
              </Card>

              {/* Carteira */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4" style={{ backgroundColor: "#E1DF4F" }}>
                  <CardTitle className="text-sm font-bold text-gray-900">Carteira</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-3 flex gap-2">
                  {["(Todos)", "Others"].map((opt) => (
                    <Button
                      key={opt}
                      size="sm"
                      variant={carteira === opt ? "default" : "outline"}
                      onClick={() => setCarteira(opt)}
                      className={
                        carteira === opt
                          ? "flex-1 bg-[#E1DF4F] text-gray-900 hover:bg-[#d4d240] border-[#d4d240]"
                          : "flex-1"
                      }
                    >
                      {opt}
                    </Button>
                  ))}
                </CardContent>
              </Card>

              {/* Team Business Unit */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4" style={{ backgroundColor: "#E1DF4F" }}>
                  <CardTitle className="text-sm font-bold text-gray-900">Team Business Unit</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-3">
                  <Select value={teamBU} onValueChange={setTeamBU}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="(Todos)">(Todos)</SelectItem>
                      <SelectItem value="AGECOB_LP">AGECOB_LP</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Portfolioname */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4" style={{ backgroundColor: "#E1DF4F" }}>
                  <CardTitle className="text-sm font-bold text-gray-900">Portfolioname</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-3">
                  <Select value={portfolio} onValueChange={setPortfolio}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="(Todos)">(Todos)</SelectItem>
                      <SelectItem value="param 1">param 1</SelectItem>
                      <SelectItem value="param 2">param 2</SelectItem>
                      <SelectItem value="param 3">param 3</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </div>

            {/* ── Logo ── */}
            <div className="text-center py-3 space-y-1">
              <div className="flex items-center justify-center gap-2">
                <div className="h-8 w-8 rounded-md bg-gradient-to-br from-green-500 to-blue-500" />
                <span className="text-xl font-bold tracking-wide text-foreground">ITAPEVA</span>
              </div>
              <p className="text-xs text-muted-foreground">Dashboard SpecOps Supervisor</p>
            </div>

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              {kpis.map((kpi) => (
                <Card key={kpi.label} className="border" style={{ backgroundColor: "#E1F0F5" }}>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-xs font-medium text-[#0f1b3d] leading-tight truncate">
                      {kpi.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <span className="text-2xl font-bold text-[#0f1b3d]">{kpi.value}</span>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* ── Charts Row ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Exceções Por Escritório */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium text-center">Exceções Por Escritório</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={excecoesData} layout="vertical" margin={{ left: 20, right: 20 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                      <Tooltip content={<ExcecoesTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                      <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={28}>
                        {excecoesData.map((_, i) => (
                          <Cell key={i} fill="#9b87f5" />
                        ))}
                        <LabelList
                          dataKey="valor"
                          position="insideRight"
                          formatter={(v: number) => fmt(v)}
                          style={{ fill: "#fff", fontSize: 12, fontWeight: 600 }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Acordos Por Escritório */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium text-center">Acordos Por Escritório</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={acordosEscData} layout="vertical" margin={{ left: 20, right: 20 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                      <Tooltip content={<AcordosEscTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                      <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={28}>
                        {acordosEscData.map((_, i) => (
                          <Cell key={i} fill="#2dd4a8" />
                        ))}
                        <LabelList
                          dataKey="valor"
                          position="insideRight"
                          formatter={(v: number) => fmt(v)}
                          style={{ fill: "#fff", fontSize: 12, fontWeight: 600 }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Acordos Por PortfolioName */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium text-center">Acordos Por PortfolioName</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={acordosPortData} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
                      <Tooltip content={<AcordosPortTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                      <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={28}>
                        {acordosPortData.map((_, i) => (
                          <Cell key={i} fill="#7dd3fc" />
                        ))}
                        <LabelList
                          dataKey="valor"
                          position="insideRight"
                          formatter={(v: number) => fmt(v)}
                          style={{ fill: "#1a3c2a", fontSize: 12, fontWeight: 600 }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
