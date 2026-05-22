import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { useRefreshGuard } from "@/hooks/useRefreshGuard";
import LazyVisibleSection from "@/components/performance/LazyVisibleSection";
import { ROUTE_LOAD_PRIORITY } from "@/config/loadPriorities";
import { Skeleton } from "@/components/ui/skeleton";
import { useProdutividadeData } from "@/hooks/useProdutividadeData";
import { fetchPrimeiraParcelaDia, type DatabaseOption } from "@/services/api";
import ExecutiveHeader from "@/components/executive/ExecutiveHeader";
import ExecutiveKpiStrip from "@/components/executive/ExecutiveKpiStrip";
import ExecutiveRankingTable from "@/components/executive/ExecutiveRankingTable";
import ApiDebugBanner from "@/components/executive/ApiDebugBanner";
import SectionHeader from "@/components/executive/SectionHeader";
import {
  aggregateTotals,
  calcConcentracao,
  calcConversao,
  calcCpc,
  calcExcecoesPctValor,
  calcTicketMedio,
} from "@/lib/metrics";
import {
  TODOS_BU,
  filterByBu,
  selectBuOptions,
  selectTopByCpc,
} from "@/selectors/analiseSelectors";
import type { ExecutiveKpi } from "@/types/executive";

const AnaliseChartsPanel = lazy(() => import("@/components/charts/AnaliseChartsPanel"));

const normalizeOfficeName = (office: string) => office.replace("COBwebRCB", "");

export default function AnaliseProdutividade() {
  const { category, dateFrom, dateTo } = useGlobalFilters();
  const [teamBU, setTeamBU] = useState(TODOS_BU);
  const [primeiraParcelaDia, setPrimeiraParcelaDia] = useState<{ total_valor: number; total_acordos: number } | null>(null);
  const selectedDatabase: DatabaseOption =
    category === "AUTOS"
      ? "COBwebRCBAUTOS"
      : category === "CONSUMER"
        ? "COBwebRCBCONSUMER"
        : "todos";
  const { rows, loading, error: loadError, warnings, refresh } = useProdutividadeData(selectedDatabase, { dateFrom, dateTo });
  const { guardedRefresh, refreshing, remainingMs } = useRefreshGuard(async () => {
    await refresh();
    window.dispatchEvent(new CustomEvent("dashboard:refresh", { detail: { route: "/analise-produtividade" } }));
  });

  useEffect(() => {
    setPrimeiraParcelaDia(null);
    fetchPrimeiraParcelaDia(selectedDatabase, undefined, dateFrom, dateTo)
      .then((env) => {
        const row = env.data[0];
        if (row) setPrimeiraParcelaDia({ total_valor: Number(row.total_valor) || 0, total_acordos: Number(row.total_acordos) || 0 });
      })
      .catch(() => {});
  }, [selectedDatabase, dateFrom, dateTo]);

  const filteredRows = useMemo(() => filterByBu(rows, teamBU), [rows, teamBU]);
  const buOptions = useMemo(() => selectBuOptions(rows), [rows]);

  const totals = useMemo(() => aggregateTotals(filteredRows), [filteredRows]);

  const kpis: ExecutiveKpi[] = useMemo(() => {
    const cpc = calcCpc(totals);
    const conv = calcConversao(totals);
    const ticket = calcTicketMedio(totals);
    const excPct = calcExcecoesPctValor(totals);
    const concentracao = calcConcentracao(filteredRows, 3);
    const primeiraParcelaKpiValue =
      teamBU === TODOS_BU
        ? (primeiraParcelaDia?.total_valor ?? 0)
        : totals.valor_primeira_parcela;
    return [
      { label: "Valor Acordos", value: totals.valor_acordos, unit: "BRL", priority: "primary", formula: "Σ valor_acordos" },
      {
        label: "1ª Parcela",
        value: primeiraParcelaKpiValue,
        unit: "BRL",
        priority: "primary",
        formula: teamBU === TODOS_BU ? "Σ primeira_parcela_do_dia (endpoint dedicado)" : "Σ valor_primeira_parcela",
      },
      { label: "CPC %", value: cpc, unit: "%", priority: "primary", formula: "qtd_contatos / qtd_acionamentos" },
      { label: "Conversão %", value: conv, unit: "%", priority: "primary", formula: "qtd_acordos / qtd_acionamentos" },
      { label: "Qtd Acordos", value: totals.qtd_acordos, unit: "count", priority: "secondary" },
      { label: "Qtd Acionamentos", value: totals.qtd_acionamentos, unit: "count", priority: "secondary" },
      { label: "Ticket Médio", value: ticket, unit: "BRL", priority: "secondary", formula: "valor_acordos / qtd_acordos" },
      { label: "Exceções % (valor)", value: excPct, unit: "%", priority: "secondary", formula: "valor_excecoes / valor_acordos" },
      { label: "Concentração Top 3", value: concentracao, unit: "%", priority: "secondary" },
      { label: "Qtd Exceções", value: totals.qtd_excecoes, unit: "count", priority: "secondary" },
    ];
  }, [filteredRows, totals, teamBU, primeiraParcelaDia]);

  const topByCpc = useMemo(() => selectTopByCpc(filteredRows), [filteredRows]);

  const filterChips = [
    { label: "Categoria", value: category },
    ...(teamBU !== TODOS_BU ? [{ label: "BU", value: normalizeOfficeName(teamBU) }] : []),
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <ExecutiveHeader
            title="Análise de Produtividade"
            onRefresh={guardedRefresh}
            refreshing={refreshing}
            refreshHint={remainingMs > 0 ? `Aguarde ${Math.ceil(remainingMs / 1000)}s` : "Atualizar"}
            period="Hoje"
            filters={filterChips}
          />

          <div className="flex-1 bg-background p-6 space-y-6 overflow-auto">
            {/* Filters */}
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <Card className="md:flex-1">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Unidade de Negócio</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <Select value={teamBU} onValueChange={setTeamBU}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS_BU}>{TODOS_BU}</SelectItem>
                      {buOptions.map((source) => (
                        <SelectItem key={source} value={source}>{normalizeOfficeName(source)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </div>

            {/* API debug banner */}
            <ApiDebugBanner
              error={loadError}
              warnings={warnings}
              onRetry={guardedRefresh}
            />

            {/* KPIs */}
            <ExecutiveKpiStrip kpis={kpis} loading={loading} />

            {/* Eficiência por Agente */}
            <section className="space-y-4">
              <SectionHeader
                title="Eficiência por Agente"
                unit="%"
                description="Ranking de CPC (contatos/acionamentos) — quanto maior, melhor a qualidade do contato."
              />
              <ExecutiveRankingTable
                title="Top 10 Agentes por CPC"
                rows={topByCpc}
                primaryColumnLabel="CPC %"
                secondaryColumnLabel="Conversão %"
                loading={loading}
                empty={topByCpc.length === 0}
              />
            </section>

            {/* Portfólio & Risco */}
            <section className="space-y-4">
              <SectionHeader
                title="Portfólio & Risco"
                description="Acordos, exceções e rejeitados agrupados por portfólio (CAMPO010)."
              />
              <LazyVisibleSection
                id="analise-charts"
                scope="/analise-produtividade"
                priority={ROUTE_LOAD_PRIORITY["/analise-produtividade"].charts}
                fallback={<Skeleton className="h-64 w-full" />}
              >
                <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                  <AnaliseChartsPanel rows={filteredRows} db={selectedDatabase} dateFrom={dateFrom} dateTo={dateTo} />
                </Suspense>
              </LazyVisibleSection>
            </section>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
