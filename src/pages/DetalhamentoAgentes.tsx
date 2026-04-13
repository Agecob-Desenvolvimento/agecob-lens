import { lazy, Suspense, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import LazyVisibleSection from "@/components/performance/LazyVisibleSection";
import { ROUTE_LOAD_PRIORITY } from "@/config/loadPriorities";
import { Skeleton } from "@/components/ui/skeleton";
import { useProdutividadeData } from "@/hooks/useProdutividadeData";
import PlaceholderNotice from "@/components/PlaceholderNotice";

const DetalhamentoChartsPanel = lazy(() => import("@/components/charts/DetalhamentoChartsPanel"));

export default function DetalhamentoAgentes() {
  const [category, setCategory] = useState("Todas");
  const [carteira, setCarteira] = useState("Geral");
  const [assessoria, setAssessoria] = useState("Todas");
  const [selectedAgent, setSelectedAgent] = useState("Todos");
  const { rows } = useProdutividadeData("todos");
  const AGENTS = ["Todos", ...Array.from(new Set(rows.map((row) => row.NOME)))];

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
              <PlaceholderNotice
                type="OutOfScope"
                owner="Decisão de negócio"
                reason="Métricas avançadas de tempo e pausa foram mantidas intencionalmente como placeholder nesta fase."
              />

              {/* Logo */}
              <div className="text-center py-1">
                <span className="text-lg font-bold tracking-widest text-foreground">
                  ITAPEVA - Dashboard SpecOps Supervisor
                </span>
              </div>

              {/* 2x2 Grid */}
              <LazyVisibleSection
                id="detalhamento-charts"
                scope="/detalhamento-agentes"
                priority={ROUTE_LOAD_PRIORITY["/detalhamento-agentes"].charts}
                fallback={<Skeleton className="h-64 w-full" />}
              >
                <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                  <DetalhamentoChartsPanel rows={rows} selectedAgent={selectedAgent} />
                </Suspense>
              </LazyVisibleSection>
            </main>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
