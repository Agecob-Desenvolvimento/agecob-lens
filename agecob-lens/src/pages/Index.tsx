import { useEffect } from "react";
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
import RitmoDiaCard from "@/components/executive/RitmoDiaCard";
import SectionHeader from "@/components/executive/SectionHeader";
import HomeBarChart from "@/components/executive/HomeBarChart";
import HandoffFinanceiroGroupedBar from "@/components/executive/HandoffFinanceiroGroupedBar";
import HandoffTopAgentes1aParcela from "@/components/executive/HandoffTopAgentes1aParcela";
import HandoffEficienciaGroupedBar from "@/components/executive/HandoffEficienciaGroupedBar";
import HandoffPortfolio1aParcela from "@/components/executive/HandoffPortfolio1aParcela";

export default function Index() {
  const { selectedDatabase } = useGlobalFilters();
  const vm = useHomeViewModel();

  useEffect(() => {
    if (vm.kpiSecondary.length === 0) return;
    const totalsExcecoes = vm.kpiSecondary.find((k) => k.label === "Exceções %");
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

            <ExecutiveInsightCard {...vm.insight} loading={vm.loading} />
            <RitmoDiaCard db={selectedDatabase} />

            <HomeKpiStrip primary={vm.kpiPrimary} secondary={vm.kpiSecondary} />

            <section className="space-y-4">
              <SectionHeader title="Financeiro" unit="BRL" description="Resultados em valor de acordos e entrada de caixa (1ª parcela)." />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <HandoffFinanceiroGroupedBar title="Valor por Unidade de Negócio" data={vm.financeiroData} empty={vm.financeiroData.length === 0} loading={vm.loading} />
                <HandoffTopAgentes1aParcela title="Top 10 Agentes por 1ª Parcela" rows={vm.top10PrimeiraParcela} empty={vm.top10PrimeiraParcela.length === 0} loading={vm.loadingPpAgente} />
              </div>
            </section>

            <section className="space-y-4">
              <SectionHeader title="Eficiência" unit="%" description="Esforço (acionamentos/contatos) e taxas (CPC/Conversão) por unidade de negócio." />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <HandoffEficienciaGroupedBar title="CPC % e Conversão % por Unidade de Negócio" data={vm.eficienciaData} summary={{ cpcAvg: vm.cpcAvg, conversaoAvg: vm.convAvg }} empty={vm.eficienciaData.length === 0} loading={vm.loading} />
                <HandoffPortfolio1aParcela title="Valor de Acordos por Portfólio" rows={vm.portfolio1aParcela} empty={vm.portfolio1aParcela.length === 0} loading={vm.loadingAcdPort} />
              </div>
            </section>

            <section className="space-y-4">
              <SectionHeader title="Risco / Qualidade" description="Exceções e rejeitados por portfólio. Boletos quebrados: aguardando endpoint." />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <HomeBarChart title="Exceções por Portfólio (Qtd)" data={vm.excecoesPorPortfolio} color="hsl(347 77% 50%)" formatValue={(v) => String(v)} loading={vm.loadingExcPort} />
                <HomeBarChart title="Rejeitados por Portfólio (Qtd)" data={vm.rejeitadosPorPortfolio} color="hsl(24 95% 53%)" formatValue={(v) => String(v)} loading={vm.loadingRejPort} />
              </div>
            </section>

            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
