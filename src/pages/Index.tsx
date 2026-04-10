import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Undo2, Redo2, RefreshCw, List, Share2, ChevronDown, X } from "lucide-react";

const EMPTY_MSG =
  "Nenhum dado retornado para esta exibição. Isso pode ter acontecido porque o filtro aplicado exclui todos os dados.";

function EmptyState({ short = false }: { short?: boolean }) {
  return (
    <p className="text-sm text-muted-foreground text-center py-8">
      {short ? "Nenhum dado retornado para esta exibição" : EMPTY_MSG}
    </p>
  );
}

export default function Index() {
  const [category, setCategory] = useState("Todas");
  const [carteira, setCarteira] = useState("Todas");
  const [assessoria, setAssessoria] = useState("");

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
              Dashboard SpecOps Supervisor : Produtividade Escritórios
            </h1>

            <div className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground" />
              <ChevronDown className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground" />
              <X className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground" />
            </div>
          </header>

          {/* ── Main Content ── */}
          <div className="flex-1 bg-background p-6 space-y-6 overflow-auto">
            {/* ── Filters Row ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Category */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Category</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 flex gap-2">
                  {["Todas", "Autos"].map((opt) => (
                    <Button
                      key={opt}
                      size="sm"
                      variant={category === opt ? "default" : "outline"}
                      onClick={() => setCategory(opt)}
                      className={
                        category === opt
                          ? "flex-1 bg-green-200 text-green-900 hover:bg-green-300 border-green-300"
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
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Carteira</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 flex gap-2">
                  {["Todas", "Others"].map((opt) => (
                    <Button
                      key={opt}
                      size="sm"
                      variant={carteira === opt ? "default" : "outline"}
                      onClick={() => setCarteira(opt)}
                      className={
                        carteira === opt
                          ? "flex-1 bg-green-200 text-green-900 hover:bg-green-300 border-green-300"
                          : "flex-1"
                      }
                    >
                      {opt}
                    </Button>
                  ))}
                </CardContent>
              </Card>

              {/* Assessoria */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Assessoria</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <Select value={assessoria} onValueChange={setAssessoria}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="963:AGECOB_LP">963:AGECOB_LP</SelectItem>
                      <SelectItem value="todos">Todos</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </div>

            {/* ── Center Title / Logo ── */}
            <div className="text-center py-3 space-y-1">
              <div className="flex items-center justify-center gap-2">
                <div className="h-8 w-8 rounded-md bg-gradient-to-br from-green-500 to-blue-500" />
                <span className="text-xl font-bold tracking-wide text-foreground">
                  ITAPEVA
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Dashboard SpecOps Supervisor</p>
            </div>

            {/* ── KPI Cards Row ── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: "Valor de Acordos Total", value: "R$0" },
                { label: "Valor de Acordos Projetado", value: "R$0" },
                { label: "% Meta", value: "" },
                { label: "% Projetada", value: "" },
                { label: "Meta de Geração", value: "R$0" },
              ].map((kpi) => (
                <Card key={kpi.label}>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">
                      {kpi.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <span className="text-2xl font-bold text-foreground">
                      {kpi.value || "—"}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* ── Productivity Metrics Row ── */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Produtividade */}
              <Card className="md:col-span-3">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium">Produtividade</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-2">
                  {[
                    { label: "Negociadores", value: "0" },
                    { label: "Acionamento/Neg", value: "0" },
                    { label: "CPC/Neg", value: "0" },
                    { label: "Acordos/Neg", value: "0,00" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-semibold text-foreground">{row.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Referência */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium truncate">Referê...</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <EmptyState short />
                </CardContent>
              </Card>

              {/* Viés */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium">Viés</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">—</span>
                    <span className="text-foreground">-</span>
                  </div>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">—</span>
                      <span className="text-destructive font-semibold">-100,0% ▼</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Dispersão da Produtividade */}
              <Card className="md:col-span-5">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium">Dispersão da Produtividade</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <EmptyState />
                </CardContent>
              </Card>
            </div>

            {/* ── Bottom Charts Row ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium">Negociadores Logados</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <EmptyState />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium">Distribuição de Acordos</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <EmptyState />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
