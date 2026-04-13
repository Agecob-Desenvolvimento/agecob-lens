import { lazy, Suspense, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useRefreshGuard } from "@/hooks/useRefreshGuard";
import LazyVisibleSection from "@/components/performance/LazyVisibleSection";
import { ROUTE_LOAD_PRIORITY } from "@/config/loadPriorities";
import { Undo2, Redo2, RefreshCw, List, Share2, ChevronDown, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useProdutividadeData } from "@/hooks/useProdutividadeData";
import PlaceholderNotice from "@/components/PlaceholderNotice";

const AnaliseChartsPanel = lazy(() => import("@/components/charts/AnaliseChartsPanel"));

/* ── Page ── */
export default function AnaliseProdutividade() {
  const [category, setCategory] = useState("(Todos)");
  const [carteira, setCarteira] = useState("(Todos)");
  const [teamBU, setTeamBU] = useState("(Todos)");
  const [portfolio, setPortfolio] = useState("all");
  const { rows, refresh } = useProdutividadeData("todos");
  const { guardedRefresh, refreshing, remainingMs } = useRefreshGuard(async () => {
    await refresh();
    window.dispatchEvent(new CustomEvent("dashboard:refresh", { detail: { route: "/analise-produtividade" } }));
  });

  const filteredRows = rows.filter((row) => (teamBU === "(Todos)" ? true : row.source === teamBU));
  const totalAcordos = filteredRows.reduce((acc, row) => acc + row.qtd_acordos, 0);
  const totalValorAcordos = filteredRows.reduce((acc, row) => acc + row.valor_acordos, 0);
  const totalAcionamentos = filteredRows.reduce((acc, row) => acc + row.qtd_acionamentos, 0);
  const totalContatos = filteredRows.reduce((acc, row) => acc + row.qtd_contatos, 0);
  const conversion = totalAcionamentos ? (totalAcordos * 100) / totalAcionamentos : 0;
  const kpis = [
    { label: "Qtd Exceções", value: String(filteredRows.filter((row) => row.acordos_percentual < 1).length) },
    { label: "Valor Exceções", value: filteredRows.reduce((acc, row) => acc + (row.acordos_percentual < 1 ? row.valor_acordos : 0), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
    { label: "Qtd Acordos", value: totalAcordos.toLocaleString("pt-BR") },
    { label: "Valor Acordos", value: totalValorAcordos.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
    { label: "Qtd Contatos", value: totalContatos.toLocaleString("pt-BR") },
    { label: "Conversão", value: `${conversion.toFixed(2)}%` },
  ];

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
              <button
                type="button"
                onClick={guardedRefresh}
                disabled={refreshing}
                className="inline-flex items-center"
                title={remainingMs > 0 ? `Aguarde ${Math.ceil(remainingMs / 1000)}s` : "Atualizar"}
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""} text-muted-foreground hover:text-foreground`}
                />
              </button>
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
                      {Array.from(new Set(rows.map((row) => row.source))).map((source) => (
                        <SelectItem key={source} value={source}>{source}</SelectItem>
                      ))}
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
                      <SelectItem value="all">Todos</SelectItem>
                      {filteredRows.slice(0, 20).map((row) => (
                        <SelectItem key={row.CHAVE} value={row.CHAVE}>{row.NOME}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </div>
            <PlaceholderNotice
              type="OutOfScope"
              owner="Decisão de negócio"
              reason="Métricas baseadas em tempo continuam fora do escopo desta entrega e seguem como placeholder."
            />

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
            <LazyVisibleSection
              id="analise-charts"
              scope="/analise-produtividade"
              priority={ROUTE_LOAD_PRIORITY["/analise-produtividade"].charts}
              fallback={<Skeleton className="h-64 w-full" />}
            >
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <AnaliseChartsPanel rows={portfolio === "all" ? filteredRows : filteredRows.filter((row) => row.CHAVE === portfolio)} />
              </Suspense>
            </LazyVisibleSection>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
