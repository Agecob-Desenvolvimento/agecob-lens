import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
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
import ExecutiveInsightCard from "@/components/executive/ExecutiveInsightCard";
import ExecutiveRankingTable from "@/components/executive/ExecutiveRankingTable";
import ApiDebugBanner from "@/components/executive/ApiDebugBanner";
import BlockHeader from "@/components/executive/BlockHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  aggregateTotals,
  buFromSource,
  calcConversao,
  calcCpc,
  calcExcecoesPctValor,
  calcTicketMedio,
  fmtBRL,
  shortAgentName,
} from "@/lib/metrics";
import {
  selectAgentNames,
  selectAgentPercentile,
  selectBuRows,
  selectTeamRanking,
} from "@/selectors";
import type { ExecutiveKpi, InsightEngineOutput } from "@/types/executive";

const DetalhamentoChartsPanel = lazy(() => import("@/components/charts/DetalhamentoChartsPanel"));

export default function DetalhamentoAgentes() {
  const { category, dateFrom, dateTo } = useGlobalFilters();
  const [selectedAgent, setSelectedAgent] = useState("Todos");
  const [agentFilter, setAgentFilter] = useState("");
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

  const agentNames = useMemo(() => selectAgentNames(rows), [rows]);

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

  const selectedAgentBu = useMemo(() => {
    if (selectedAgent === "Todos") return null;
    const row = rows.find((r) => String(r.NOME || "").trim() === selectedAgent);
    return row ? buFromSource(row.source) : null;
  }, [rows, selectedAgent]);

  const buRows = useMemo(
    () => selectBuRows(rows, selectedAgentBu),
    [rows, selectedAgentBu],
  );

  const teamRanking = useMemo(
    () => (selectedAgent === "Todos" ? [] : selectTeamRanking(buRows)),
    [buRows, selectedAgent],
  );

  const selectedShortLabel = useMemo(
    () => (selectedAgent === "Todos" ? undefined : shortAgentName(selectedAgent)),
    [selectedAgent],
  );

  const percentiles = useMemo(
    () => selectAgentPercentile(rows, selectedAgent, buRows),
    [rows, buRows, selectedAgent],
  );

  const insight: InsightEngineOutput = useMemo(() => {
    if (selectedAgent === "Todos" || buRows.length === 0) {
      return { insight1: null, insight2: null, action: null, empty: true };
    }
    const agentRows = rows.filter((r) => String(r.NOME || "").trim() === selectedAgent);
    const agentTotals = aggregateTotals(agentRows);
    const buTotals = aggregateTotals(buRows);
    const agentTicket = calcTicketMedio(agentTotals);
    const buTicket = calcTicketMedio(buTotals);
    if (buTicket <= 0 || agentTicket <= 0) {
      return { insight1: null, insight2: null, action: null, empty: true };
    }
    const deltaPct = ((agentTicket - buTicket) / buTicket) * 100;
    const absPct = Math.abs(deltaPct);
    if (absPct < 10) {
      return { insight1: null, insight2: null, action: null, empty: true };
    }
    const direction = deltaPct >= 0 ? "acima" : "abaixo";
    const severity = deltaPct >= 0 ? "positive" : "critical";
    return {
      insight1: {
        text: `Ticket médio ${fmtBRL(agentTicket)} vs. ${fmtBRL(buTicket)} (média ${selectedAgentBu}).`,
        severity,
        headline: `${absPct.toFixed(0)}% ${direction} da média`,
      },
      insight2: null,
      action: null,
      empty: false,
    };
  }, [rows, buRows, selectedAgent, selectedAgentBu]);

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
              {/* API debug banner */}
              <ApiDebugBanner
                error={loadError}
                warnings={warnings}
                onRetry={guardedRefresh}
              />

              {/* KPIs moved to top */}
              <ExecutiveKpiStrip kpis={kpis} loading={loading} />

              {/* Bloco 1 — Diagnóstico Individual */}
              <section>
                <BlockHeader
                  number="1"
                  title="Diagnóstico Individual"
                  description="Entender o desempenho do agente — comparativo vs equipe e posição no ranking."
                />
                <div className="space-y-4">
                  <ExecutiveInsightCard
                    data={insight}
                    loading={loading}
                    title={`Comparação · ${selectedShortLabel ?? ""}`}
                  />
                  {percentiles && (percentiles.valorPct != null || percentiles.cpcPct != null) ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {percentiles.valorPct != null ? (
                        <Card>
                          <CardContent className="px-4 py-3">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                              Posição em Valor de Acordos
                            </p>
                            <p className="text-2xl font-bold tabular-nums">
                              Top {percentiles.valorPct}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              dentre {percentiles.totalBU} agentes da BU {selectedAgentBu}
                            </p>
                          </CardContent>
                        </Card>
                      ) : null}
                      {percentiles.cpcPct != null ? (
                        <Card>
                          <CardContent className="px-4 py-3">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                              Posição em CPC
                            </p>
                            <p className="text-2xl font-bold tabular-nums">
                              Top {percentiles.cpcPct}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              contatos por acionamento — BU {selectedAgentBu}
                            </p>
                          </CardContent>
                        </Card>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>

              {/* Bloco 2 — Contexto Comparativo */}
              <section>
                <BlockHeader
                  number="2"
                  title="Contexto Comparativo"
                  description="Onde cada agente está no time — padrões visuais e validação estatística."
                />
                <div className="space-y-4">
                  {selectedAgent !== "Todos" ? (
                    <ExecutiveRankingTable
                      title={`Top 10 BU ${selectedAgentBu ?? ""} por Valor de Acordos`}
                      rows={teamRanking}
                      primaryColumnLabel="Valor Acordos"
                      secondaryColumnLabel="Qtd Acordos"
                      loading={loading}
                      empty={teamRanking.length === 0}
                      highlightLabel={selectedShortLabel}
                    />
                  ) : null}
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
                </div>
              </section>
            </main>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
