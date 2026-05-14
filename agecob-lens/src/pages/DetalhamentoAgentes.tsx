import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import PeriodoFilter from "@/components/PeriodoFilter";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import LazyVisibleSection from "@/components/performance/LazyVisibleSection";
import { ROUTE_LOAD_PRIORITY } from "@/config/loadPriorities";
import { Skeleton } from "@/components/ui/skeleton";
import { useProdutividadeData } from "@/hooks/useProdutividadeData";
import { useRefreshGuard } from "@/hooks/useRefreshGuard";
import { type DatabaseOption, fetchPrimeiraParcelaDia, fetchPrimeiraParcelaPorAgente } from "@/services/api";
import { trackEvent } from "@/services/analytics";
import ExecutiveHeader from "@/components/executive/ExecutiveHeader";
import ExecutiveKpiStrip from "@/components/executive/ExecutiveKpiStrip";
import ApiDebugBanner from "@/components/executive/ApiDebugBanner";
import {
  aggregateTotals,
  calcConversao,
  calcCpc,
  calcExcecoesPctValor,
  calcTicketMedio,
} from "@/lib/metrics";
import type { ExecutiveKpi } from "@/types/executive";
import { todayStr, firstOfMonthStr } from "@/lib/dates";

const DetalhamentoChartsPanel = lazy(() => import("@/components/charts/DetalhamentoChartsPanel"));

export default function DetalhamentoAgentes() {
  const { category } = useGlobalFilters();
  const [selectedAgent, setSelectedAgent] = useState("Todos");
  const [agentFilter, setAgentFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(firstOfMonthStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [primeiraParcelaDia, setPrimeiraParcelaDia] = useState<{ total_valor: number; total_acordos: number } | null>(null);
  const [primeiraParcelaPorAgente, setPrimeiraParcelaPorAgente] = useState<Record<string, number>>({});

  const selectedDatabase: DatabaseOption =
    category === "AUTOS"
      ? "COBwebRCBAUTOS"
      : category === "CONSUMER"
        ? "COBwebRCBCONSUMER"
        : "todos";
  const { rows, loading, error: loadError, warnings, refresh } = useProdutividadeData(
    selectedDatabase,
    { dateFrom, dateTo },
  );
  const { guardedRefresh, refreshing, remainingMs } = useRefreshGuard(async () => {
    const startedAt = performance.now();
    trackEvent("refresh_clicked", { page: "/detalhamento-agentes" });
    try {
      await refresh();
      trackEvent("refresh_success", { page: "/detalhamento-agentes", duration_ms: Math.round(performance.now() - startedAt) });
      window.dispatchEvent(new CustomEvent("dashboard:refresh", { detail: { route: "/detalhamento-agentes" } }));
    } catch (err) {
      trackEvent("refresh_error", { page: "/detalhamento-agentes", duration_ms: Math.round(performance.now() - startedAt) });
      throw err;
    }
  });

  useEffect(() => {
    let cancelled = false;

    setPrimeiraParcelaDia(null);
    setPrimeiraParcelaPorAgente({});

    Promise.all([
      fetchPrimeiraParcelaDia(selectedDatabase, undefined, dateFrom, dateTo),
      fetchPrimeiraParcelaPorAgente(selectedDatabase, undefined),
    ])
      .then(([diaEnv, agenteEnv]) => {
        if (cancelled) return;
        const row = diaEnv.data[0];
        if (row) {
          setPrimeiraParcelaDia({
            total_valor: Number(row.total_valor) || 0,
            total_acordos: Number(row.total_acordos) || 0,
          });
        }
        const byAgent = Object.fromEntries(
          (agenteEnv.data ?? []).map((item) => [
            String(item.agente || "").trim(),
            Number(item.valor_primeira_parcela) || 0,
          ]),
        );
        setPrimeiraParcelaPorAgente(byAgent);
      })
      .catch(() => {
        if (!cancelled) setPrimeiraParcelaPorAgente({});
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDatabase, dateFrom, dateTo]);

  const agentNames = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => String(row.NOME || "").trim()).filter((name) => name.length > 0)))
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [rows],
  );

  const visibleAgents = useMemo(() => {
    const q = agentFilter.trim().toLowerCase();
    const base = ["Todos", ...agentNames];
    if (!q) return base;
    return base.filter((a) => a.toLowerCase().includes(q));
  }, [agentNames, agentFilter]);

  const filteredRows = useMemo(
    () => (selectedAgent === "Todos" ? rows : rows.filter((r) => String(r.NOME || "").trim() === selectedAgent)),
    [rows, selectedAgent],
  );

  const totals = useMemo(() => aggregateTotals(filteredRows), [filteredRows]);
  const primeiraParcelaSelecionada = useMemo(() => {
    if (selectedAgent === "Todos") {
      return primeiraParcelaDia?.total_valor ?? 0;
    }
    return primeiraParcelaPorAgente[selectedAgent] ?? 0;
  }, [primeiraParcelaDia, primeiraParcelaPorAgente, selectedAgent]);

  const kpis: ExecutiveKpi[] = useMemo(() => {
    const cpc = calcCpc(totals);
    const conv = calcConversao(totals);
    const ticket = calcTicketMedio(totals);
    const excPct = calcExcecoesPctValor(totals);
    return [
      { label: "Valor Acordos", value: totals.valor_acordos, unit: "BRL", priority: "primary", formula: "Σ valor_acordos" },
      {
        label: "1ª Parcela",
        value: primeiraParcelaSelecionada,
        unit: "BRL",
        priority: "primary",
        formula: selectedAgent === "Todos" ? "Σ primeira_parcela_do_dia" : "Σ primeira_parcela_por_agente",
      },
      { label: "Qtd Acordos", value: totals.qtd_acordos, unit: "count", priority: "primary" },
      { label: "Ticket Médio", value: ticket, unit: "BRL", priority: "primary", formula: "valor_acordos / qtd_acordos" },
      { label: "CPC %", value: cpc, unit: "%", priority: "secondary", formula: "qtd_contatos / qtd_acionamentos" },
      { label: "Conversão %", value: conv, unit: "%", priority: "secondary", formula: "qtd_acordos / qtd_acionamentos" },
      { label: "Qtd Acionamentos", value: totals.qtd_acionamentos, unit: "count", priority: "secondary" },
      { label: "Qtd Contatos", value: totals.qtd_contatos, unit: "count", priority: "secondary" },
      { label: "Qtd Exceções", value: totals.qtd_excecoes, unit: "count", priority: "secondary" },
      { label: "Exceções % (valor)", value: excPct, unit: "%", priority: "secondary", formula: "valor_excecoes / valor_acordos" },
    ];
  }, [totals, selectedAgent, primeiraParcelaSelecionada]);

  const handleAgentChange = (agent: string) => {
    trackEvent("filter_changed", { page: "/detalhamento-agentes", filter_name: "agente", value: agent === "Todos" ? "todos" : "selecionado" });
    setSelectedAgent(agent);
  };

  const filterChips = [
    { label: "Categoria", value: category },
    ...(selectedAgent !== "Todos" ? [{ label: "Agente", value: selectedAgent }] : []),
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <ExecutiveHeader
            title="Detalhamento de Agentes"
            onRefresh={guardedRefresh}
            refreshing={refreshing}
            refreshHint={remainingMs > 0 ? `Aguarde ${Math.ceil(remainingMs / 1000)}s` : "Atualizar"}
            period="Hoje"
            filters={filterChips}
          />

          <div className="flex-1 flex min-w-0">
            {/* Agent sidebar with search */}
            <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col">
              <div className="px-4 pt-4 pb-2">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Agentes</h2>
              </div>
              <div className="px-3 pb-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={agentFilter}
                    onChange={(e) => setAgentFilter(e.target.value)}
                    placeholder="Buscar agente..."
                    className="pl-7 h-8 text-sm"
                  />
                </div>
              </div>
              <div className="px-3 pb-4 space-y-1 overflow-y-auto">
                {visibleAgents.length > 0 ? (
                  visibleAgents.map((agent) => (
                    <button
                      key={agent}
                      onClick={() => handleAgentChange(agent)}
                      className={`w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors truncate ${
                        selectedAgent === agent
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-foreground hover:bg-muted"
                      }`}
                      title={agent}
                    >
                      {agent}
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground px-2 py-1">Nenhum agente encontrado.</p>
                )}
              </div>
            </aside>

            <main className="flex-1 overflow-y-auto p-6 space-y-6 bg-background">
              {/* Filters */}
              <PeriodoFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />

              {/* API debug banner */}
              <ApiDebugBanner
                error={loadError}
                warnings={warnings}
                onRetry={guardedRefresh}
              />

              {/* KPIs moved to top */}
              <ExecutiveKpiStrip kpis={kpis} loading={loading} />

              {/* Charts */}
              <LazyVisibleSection
                id="detalhamento-charts"
                scope="/detalhamento-agentes"
                priority={ROUTE_LOAD_PRIORITY["/detalhamento-agentes"].charts}
                fallback={<Skeleton className="h-64 w-full" />}
              >
                <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                  <DetalhamentoChartsPanel
                    rows={rows}
                    selectedAgent={selectedAgent}
                    db={selectedDatabase}
                    primeiraParcelaSelecionada={primeiraParcelaSelecionada}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                  />
                </Suspense>
              </LazyVisibleSection>
            </main>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
