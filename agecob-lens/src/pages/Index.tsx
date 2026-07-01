import { lazy, Suspense, useMemo, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useRefreshGuard } from "@/hooks/useRefreshGuard";
import { useHomeViewModel } from "@/hooks/useHomeViewModel";
import type { HomeKpiDetalheKind } from "@/hooks/useHomeKpiDetalhe";
import { trackEvent } from "@/services/analytics";
import ExecutiveHeader from "@/components/executive/ExecutiveHeader";
import HomeKpiStrip from "@/components/executive/HomeKpiStrip";
import ExecutiveInsightCard from "@/components/executive/ExecutiveInsightCard";
import ApiDebugBanner from "@/components/executive/ApiDebugBanner";
import SectionHeader from "@/components/executive/SectionHeader";
import ReportDownloadDialog from "@/components/executive/ReportDownloadDialog";
import type { ReportSection } from "@/lib/csvReport";
import { calcConversao, calcEfetividadeCaixa, calcTaxaContato } from "@/lib/metrics";
import { useMetasData } from "@/hooks/useMetasData";

const RitmoDiaCard = lazy(() => import("@/components/executive/RitmoDiaCard"));
const HandoffTopAgentes1aParcela = lazy(() => import("@/components/executive/HandoffTopAgentes1aParcela"));
const HandoffFunnelChart = lazy(() => import("@/components/executive/HandoffFunnelChart"));
const HandoffDiagnosticCards = lazy(() => import("@/components/executive/HandoffDiagnosticCards"));
const HandoffPortfolioRentabilidade = lazy(() => import("@/components/executive/HandoffPortfolioRentabilidade"));

const CHART_FALLBACK = <div className="h-64 animate-pulse bg-muted rounded-lg" />;

const HomeKpiDetalheSheet = lazy(() => import("@/components/executive/HomeKpiDetalheSheet").then((m) => ({ default: m.HomeKpiDetalheSheet })));

const KPI_KIND_BY_LABEL: Record<string, HomeKpiDetalheKind> = {
  "Valor de Acordos": "acordos",
  "1ª Parcela": "primeira_parcela",
  Rejeitados: "rejeitados",
  "Exceções": "excecoes",
};

export default function Index() {
  const { selectedDatabase, dateFrom, dateTo } = useGlobalFilters();
  const vm = useHomeViewModel();
  const { metasFiltradas } = useMetasData(null);
  const [kpiSheetKind, setKpiSheetKind] = useState<HomeKpiDetalheKind | null>(null);

  const { guardedRefresh, refreshing, remainingMs } = useRefreshGuard(async () => {
    const startedAt = performance.now();
    trackEvent("refresh_clicked", { page: "/" });
    await vm.refresh();
    trackEvent("refresh_success", { page: "/", duration_ms: Math.round(performance.now() - startedAt) });
    window.dispatchEvent(new CustomEvent("dashboard:refresh", { detail: { route: "/" } }));
  });

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
      {
        id: "quebrados-portfolio",
        label: "Boletos Quebrados por Portfólio",
        available: vm.quebradosPorPortfolio.length > 0,
        build: () => ({
          columns: ["Portfólio", "Valor Quebrados (R$)", "Qtd Quebrados"],
          rows: vm.quebradosPorPortfolio.map((d) => [d.label, d.value, d.qtd]),
        }),
      },
      {
        id: "financeiro-bu",
        label: "Financeiro por Unidade de Negócio (R$)",
        available: vm.financeiroData.length > 0,
        build: () => ({
          columns: ["Unidade", "Valor Acordos (R$)", "Valor 1ª Parcela (R$)"],
          rows: vm.financeiroData.map((d) => [d.bu, d.valorAcordos, d.primeiraParcela]),
        }),
      },
      {
        id: "detalhamento-agentes",
        label: "Detalhamento por Agente (completo)",
        available: vm.produtividadeRows.length > 0,
        build: () => ({
          columns: [
            "Agente", "Acionamentos", "Alô (Contato)", "CPC", "Acordos",
            "Boletos Emitidos", "Boletos Pagos", "Taxa Contato (%)",
            "Conversão (%)", "Efetividade (%)", "Valor Acordos (R$)",
            "Ticket Médio (R$)", "Parcelamento Médio", "Desconto Médio (%)",
            "Valor 1ª Parcela (R$)", "1ª Parcela Recebida (R$)",
            "Qtd Exceções", "Valor Exceções (R$)", "Qtd Rejeitados",
            "Valor Rejeitados (R$)", "Idade Média Acordos (dias)", "Horas Trabalhadas",
          ],
          rows: vm.produtividadeRows.map((r) => [
            r.NOME, r.qtd_acionamentos, r.qtd_alo, r.qtd_contatos, r.qtd_acordos,
            r.qtd_boletos_emitidos, r.qtd_boletos_pagos, calcTaxaContato(r),
            calcConversao(r), calcEfetividadeCaixa(r), r.valor_acordos,
            r.acordo_medio, r.parcelamento_medio, r.desconto_medio_percentual,
            r.valor_primeira_parcela, r.valor_p1_recebido,
            r.qtd_excecoes, r.valor_excecoes, r.qtd_rejeitados,
            r.valor_rejeitados, r.idade_media_acordos, r.horas_trabalhadas,
          ]),
        }),
      },
      {
        id: "metas-portfolio",
        label: "Metas por Portfólio (mês corrente)",
        available: metasFiltradas.length > 0,
        build: () => ({
          columns: ["Portfólio", "Grupo", "Negociadores", "Meta PNT (R$)", "Meta Caixa (R$)", "Meta Retomadas (R$)"],
          rows: metasFiltradas.map((m) => [
            m.portfolio, m.grupo ?? "", m.qtd_negociadores,
            m.meta_pnt, m.meta_caixa, m.meta_retomadas_valor,
          ]),
        }),
      },
    ];
  }, [vm.kpiPrimary, vm.kpiSecondary, vm.top10PrimeiraParcela, vm.ppPortfolioRows, vm.funnelData, vm.eficienciaData, vm.portfolio1aParcela, vm.excecoesPorPortfolioValor, vm.rejeitadosPorPortfolioValor, vm.quebradosPorPortfolio, vm.financeiroData, vm.produtividadeRows, metasFiltradas]);

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

            <HomeKpiStrip
              primary={vm.kpiPrimary}
              secondary={vm.kpiSecondary}
              clickableLabels={Object.keys(KPI_KIND_BY_LABEL)}
              onKpiClick={(label) => setKpiSheetKind(KPI_KIND_BY_LABEL[label])}
            />


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

            </div>
          </div>
        </div>
      </div>
      <Suspense fallback={null}>
        <HomeKpiDetalheSheet kind={kpiSheetKind} onClose={() => setKpiSheetKind(null)} />
      </Suspense>
    </SidebarProvider>
  );
}