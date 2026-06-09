import { lazy, Suspense, useEffect, useMemo } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useRefreshGuard } from "@/hooks/useRefreshGuard";
import { useHomeViewModel } from "@/hooks/useHomeViewModel";
import { trackEvent } from "@/services/analytics";
import ExecutiveHeader from "@/components/executive/ExecutiveHeader";
import HomeKpiStrip from "@/components/executive/HomeKpiStrip";
import ExecutiveInsightCard from "@/components/executive/ExecutiveInsightCard";
import ApiDebugBanner from "@/components/executive/ApiDebugBanner";
import SectionHeader from "@/components/executive/SectionHeader";
import ReportDownloadDialog from "@/components/executive/ReportDownloadDialog";
import type { ReportSection } from "@/lib/csvReport";

const RitmoDiaCard = lazy(() => import("@/components/executive/RitmoDiaCard"));
const HandoffTopAgentes1aParcela = lazy(() => import("@/components/executive/HandoffTopAgentes1aParcela"));
const HandoffFunnelChart = lazy(() => import("@/components/executive/HandoffFunnelChart"));
const HandoffDiagnosticCards = lazy(() => import("@/components/executive/HandoffDiagnosticCards"));
const HandoffPortfolioRentabilidade = lazy(() => import("@/components/executive/HandoffPortfolioRentabilidade"));

const CHART_FALLBACK = <div className="h-64 animate-pulse bg-muted rounded-lg" />;

const PortfolioSection = lazy(() => import("@/components/analise/PortfolioSection").then((m) => ({ default: m.PortfolioSection })));
export default function Index() {
  const { selectedDatabase, dateFrom, dateTo } = useGlobalFilters();
  const vm = useHomeViewModel();

  useEffect(() => {
    if (vm.kpiSecondary.length === 0) return;
    const totalsExcecoes = vm.kpiSecondary.find((k) => k.label === "% Exc. s/ Valor Acordos");
    if (!totalsExcecoes) return;
    const ratio = totalsExcecoes.value;
    let severity: "critical" | "warning" | null = null;
    if (ratio > 0 && ratio < 5) severity = "critical";
    else if (ratio >= 5 && ratio < 10) severity = "warning";
    if (!severity) return;
    trackEvent("first_installment_ratio_alert", {
      severity,
      ratio_pct: Number(ratio.toFixed(2)),
      database: selectedDatabase,
    });
  }, [vm.kpiSecondary, selectedDatabase]);

  const { guardedRefresh, refreshing, remainingMs } = useRefreshGuard(async () => {
    const startedAt = performance.now();
    trackEvent("refresh_clicked", { page: "/" });
    await vm.refresh();
    trackEvent("refresh_success", { page: "/", duration_ms: Math.round(performance.now() - startedAt) });
    window.dispatchEvent(new CustomEvent("dashboard:refresh", { detail: { route: "/" } }));
  });

  // Remap data shapes for PortfolioSection (all BRL-valued)
  const psPortfolioValor = useMemo(
    () => vm.portfolio1aParcela.map((d) => ({ nome: d.label, valor: d.value })),
    [vm.portfolio1aParcela],
  );
  const psExcecoes = useMemo(
    () => vm.excecoesPorPortfolioValor.map((d) => ({ nome: d.label, valor: d.value })),
    [vm.excecoesPorPortfolioValor],
  );
  const psRejeitados = useMemo(
    () => vm.rejeitadosPorPortfolioValor.map((d) => ({ nome: d.label, valor: d.value })),
    [vm.rejeitadosPorPortfolioValor],
  );
  const psLoading = vm.loadingAcdPort || vm.loadingExcPort || vm.loadingRejPort;

  const reportSections = useMemo<ReportSection[]>(() => {
    const unitLabel = (u: string) => (u === "BRL" ? "R$" : u === "percent" ? "%" : "qtd");
    const kpis = [...vm.kpiPrimary, ...vm.kpiSecondary];
    return [
      {
        id: "kpis",
        label: "Indicadores (KPIs)",
        available: kpis.length > 0,
        build: () => ({
          columns: ["Indicador", "Valor", "Unidade"],
          rows: kpis.map((k) => [k.label, k.value ?? "", unitLabel(k.unit)]),
        }),
      },
      {
        id: "top10-1a-parcela",
        label: "Top 10 Agentes por 1ª Parcela",
        available: vm.top10PrimeiraParcela.length > 0,
        build: () => ({
          columns: ["Agente", "Valor 1ª Parcela (R$)"],
          rows: vm.top10PrimeiraParcela.map((d) => [d.label, d.value]),
        }),
      },
      {
        id: "1a-parcela-portfolio",
        label: "1ª Parcela por Portfólio",
        available: vm.ppPortfolioRows.length > 0,
        build: () => ({
          columns: ["Portfólio", "Qtd Acordos", "Valor 1ª Parcela (R$)"],
          rows: vm.ppPortfolioRows.map((r) => [r.portfolio_name, r.qtd_acordos, r.valor_primeira_parcela]),
        }),
      },
      {
        id: "funil",
        label: "Funil de Conversão",
        available: vm.funnelData.length > 0,
        build: () => ({
          columns: ["Unidade", "Acionamentos", "Alô", "CPC", "Acordos"],
          rows: vm.funnelData.map((f) => [f.bu, f.acionamentos, f.alo, f.contatos, f.acordos]),
        }),
      },
      {
        id: "diagnostico-bu",
        label: "Diagnóstico por Unidade de Negócio",
        available: vm.eficienciaData.length > 0,
        build: () => ({
          columns: ["Unidade", "CPC", "Conversão %"],
          rows: vm.eficienciaData.map((e) => [e.bu, e.cpc, e.conversao]),
        }),
      },
      {
        id: "acordos-portfolio",
        label: "Acordos por Portfólio (R$)",
        available: vm.portfolio1aParcela.length > 0,
        build: () => ({
          columns: ["Portfólio", "Valor Acordos (R$)"],
          rows: vm.portfolio1aParcela.map((d) => [d.label, d.value]),
        }),
      },
      {
        id: "excecoes-portfolio",
        label: "Exceções por Portfólio (R$)",
        available: vm.excecoesPorPortfolioValor.length > 0,
        build: () => ({
          columns: ["Portfólio", "Valor Exceções (R$)"],
          rows: vm.excecoesPorPortfolioValor.map((d) => [d.label, d.value]),
        }),
      },
      {
        id: "rejeitados-portfolio",
        label: "Rejeitados por Portfólio (R$)",
        available: vm.rejeitadosPorPortfolioValor.length > 0,
        build: () => ({
          columns: ["Portfólio", "Valor Rejeitados (R$)"],
          rows: vm.rejeitadosPorPortfolioValor.map((d) => [d.label, d.value]),
        }),
      },
    ];
  }, [vm.kpiPrimary, vm.kpiSecondary, vm.top10PrimeiraParcela, vm.ppPortfolioRows, vm.funnelData, vm.eficienciaData, vm.portfolio1aParcela, vm.excecoesPorPortfolioValor, vm.rejeitadosPorPortfolioValor]);

  const reportMeta = useMemo(
    () => ({
      "Relatório": "Dashboard Executivo",
      "Período": `${dateFrom} a ${dateTo}`,
      "Banco": selectedDatabase,
    }),
    [dateFrom, dateTo, selectedDatabase],
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <ExecutiveHeader
            title="Dashboard Executivo · Produtividade Escritórios"
            onRefresh={guardedRefresh}
            refreshing={refreshing}
            refreshHint={remainingMs > 0 ? `Aguarde ${Math.ceil(remainingMs / 1000)}s` : "Atualizar"}
          />

          <div className="flex-1 bg-background overflow-auto">
            <div className="mx-auto max-w-[1600px] w-full p-6 space-y-6">
            <ApiDebugBanner error={vm.error} warnings={vm.warnings} onRetry={guardedRefresh} />

            <div className="flex justify-end">
              <ReportDownloadDialog
                meta={reportMeta}
                sections={reportSections}
                filename={`relatorio-dashboard-${dateFrom}_a_${dateTo}.csv`}
              />
            </div>

            <ExecutiveInsightCard {...vm.insight} loading={vm.loading} />
            <Suspense fallback={CHART_FALLBACK}>
              <RitmoDiaCard db={selectedDatabase} />
            </Suspense>

            <HomeKpiStrip primary={vm.kpiPrimary} secondary={vm.kpiSecondary} />


            <section className="space-y-4">
              <SectionHeader title="Financeiro" unit="BRL" description="Resultados em valor de acordos, entrada de caixa (1ª parcela) e rentabilidade por portfólio." />
              <Suspense fallback={CHART_FALLBACK}>
                <HandoffTopAgentes1aParcela title="Top 10 Agentes por 1ª Parcela" rows={vm.top10PrimeiraParcela} empty={vm.top10PrimeiraParcela.length === 0} loading={vm.loadingPpAgente} />
                <div className="mt-4">
                  <HandoffPortfolioRentabilidade
                    title="1ª Parcela por Portfólio · Rentabilidade & Risco"
                    rows={vm.ppPortfolioRows}
                    riskMap={vm.portfolioRiskMap}
                    empty={vm.ppPortfolioRows.length === 0}
                    loading={vm.loadingPpPortfolio}
                  />
                </div>
              </Suspense>
            </section>

            <section className="space-y-4">
              <SectionHeader title="Eficiência" unit="%" description="Funil de conversão (Acionamentos → Contato → CPC → Acordos) e diagnóstico por unidade de negócio." />
              <Suspense fallback={CHART_FALLBACK}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <HandoffFunnelChart title="Funil de Conversão" data={vm.funnelData} empty={vm.funnelData.length === 0} loading={vm.loading} />
                  <HandoffDiagnosticCards title="Diagnóstico por Unidade de Negócio" data={vm.eficienciaData} funnelData={vm.funnelData} benchByBu={vm.benchByBu} cpcRef={vm.cpcAvg} conversaoRef={vm.convAvg} empty={vm.eficienciaData.length === 0} loading={vm.loading} />
                </div>
              </Suspense>
            </section>

            <section className="space-y-4">
              <SectionHeader title="Portfólio" description="Acordos, exceções e rejeitados agrupados por portfólio (CAMPO010)." />
              <Suspense fallback={CHART_FALLBACK}>
                <PortfolioSection
                  portfolioValor={psPortfolioValor}
                  excecoesPorPortfolio={psExcecoes}
                  rejeitadosPorPortfolio={psRejeitados}
                  loading={psLoading}
                />
              </Suspense>
            </section>

            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}