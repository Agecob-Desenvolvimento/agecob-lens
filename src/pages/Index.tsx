import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  List,
  Redo2,
  RefreshCw,
  Share2,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useRefreshGuard } from "@/hooks/useRefreshGuard";
import { useProdutividadeData } from "@/hooks/useProdutividadeData";
import PlaceholderNotice from "@/components/PlaceholderNotice";

export default function Index() {
  const [category, setCategory] = useState("Todas");
  const [carteira, setCarteira] = useState("Geral");
  const [assessoria, setAssessoria] = useState("todos");
  const { rows: produtividadeRows, error: loadError, refresh } = useProdutividadeData("todos");

  const { guardedRefresh, refreshing, remainingMs } = useRefreshGuard(async () => {
    await refresh();
    window.dispatchEvent(new CustomEvent("dashboard:refresh", { detail: { route: "/" } }));
  });

  const kpis = useMemo(() => {
    const totalValor = produtividadeRows.reduce((acc, row) => acc + row.valor_acordos, 0);
    const totalAcordos = produtividadeRows.reduce((acc, row) => acc + row.qtd_acordos, 0);
    const totalAcionamentos = produtividadeRows.reduce((acc, row) => acc + row.qtd_acionamentos, 0);
    const totalContatos = produtividadeRows.reduce((acc, row) => acc + row.qtd_contatos, 0);
    const cpc = totalAcionamentos > 0 ? (totalContatos * 100) / totalAcionamentos : 0;
    const negociadores = produtividadeRows.length;
    const acordosPorNeg = negociadores > 0 ? totalAcordos / negociadores : 0;
    const acionamentosPorNeg = negociadores > 0 ? totalAcionamentos / negociadores : 0;
    const topAgentes = [...produtividadeRows]
      .sort((a, b) => b.valor_acordos - a.valor_acordos)
      .slice(0, 5);
    return { totalValor, totalAcordos, totalAcionamentos, cpc, negociadores, acordosPorNeg, acionamentosPorNeg, topAgentes };
  }, [produtividadeRows]);

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
            <PlaceholderNotice
              type="BusinessPending"
              owner="Decisão de negócio"
              reason="Category e Carteira permanecem como placeholder até definição final das regras pelos gestores."
            />

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
                { label: "Valor de Acordos Total", value: kpis.totalValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
                { label: "Qtd Acordos", value: kpis.totalAcordos.toLocaleString("pt-BR") },
                { label: "Qtd Acionamentos", value: kpis.totalAcionamentos.toLocaleString("pt-BR") },
                { label: "CPC %", value: `${kpis.cpc.toFixed(2)}%` },
                { label: "Status", value: loadError ? "Erro" : "OK" },
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
                    { label: "Negociadores", value: kpis.negociadores.toLocaleString("pt-BR") },
                    { label: "Acionamento/Neg", value: kpis.acionamentosPorNeg.toFixed(2) },
                    { label: "CPC Médio", value: `${kpis.cpc.toFixed(2)}%` },
                    { label: "Acordos/Neg", value: kpis.acordosPorNeg.toFixed(2) },
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
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Fonte</span><span>{produtividadeRows[0]?.source ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Registros</span><span>{produtividadeRows.length}</span></div>
                  </div>
                </CardContent>
              </Card>

              {/* Viés */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium">Viés</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-2">
                  <PlaceholderNotice
                    type="BusinessPending"
                    owner="Decisão de negócio"
                    reason="A definição de viés e da lógica de pontuação está pendente de decisão dos gestores."
                  />
                </CardContent>
              </Card>

              {/* Dispersão da Produtividade */}
              <Card className="md:col-span-5">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium">Dispersão da Produtividade</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <PlaceholderNotice
                    type="DatasetPending"
                    owner="Fonte de dados necessária"
                    reason="Requer dataset dedicado para distribuição de produtividade por faixas e tempo."
                  />
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
                  <div className="space-y-2">
                    {kpis.topAgentes.slice(0, 4).map((item) => (
                      <div key={`log-${item.CHAVE}`} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{item.NOME}</span>
                        <span>{item.qtd_acionamentos}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium">Distribuição de Acordos</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="space-y-2">
                    {kpis.topAgentes.slice(0, 4).map((item) => (
                      <div key={`dist-${item.CHAVE}`} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{item.NOME}</span>
                        <span>{item.qtd_acordos}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
