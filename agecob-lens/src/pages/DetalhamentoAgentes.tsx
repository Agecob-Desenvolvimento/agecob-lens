import { lazy, Suspense, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { HomeKpiDetalheKind } from "@/hooks/useHomeKpiDetalhe";
import { AppSidebar } from "@/components/AppSidebar";
import ExecutiveHeader from "@/components/executive/ExecutiveHeader";
import BlockHeader from "@/components/executive/BlockHeader";
import ExecutiveInsightCard from "@/components/executive/ExecutiveInsightCard";
import ApiDebugBanner from "@/components/executive/ApiDebugBanner";
import { AgentFilterBar } from "@/components/detalhamento/AgentFilterBar";
import { DetalhamentoKpiStrip } from "@/components/detalhamento/DetalhamentoKpiStrip";
import { PortfolioFilter } from "@/components/detalhamento/PortfolioFilter";
import { useDetalhamentoViewModel } from "@/hooks/useDetalhamentoViewModel";
import { usePortfolioList } from "@/hooks/usePortfolioList";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";

const FunilConversao = lazy(() => import("@/components/detalhamento/FunilConversao").then((m) => ({ default: m.FunilConversao })));
const RadarDesempenho = lazy(() => import("@/components/detalhamento/RadarDesempenho").then((m) => ({ default: m.RadarDesempenho })));
const PerformanceHeatmap = lazy(() => import("@/components/detalhamento/PerformanceHeatmap").then((m) => ({ default: m.PerformanceHeatmap })));
const RankingPrioridade = lazy(() => import("@/components/detalhamento/RankingPrioridade").then((m) => ({ default: m.RankingPrioridade })));
const AgenteDetalheSection = lazy(() => import("@/components/detalhamento/AgenteDetalheSection"));
const HomeKpiDetalheSheet = lazy(() => import("@/components/executive/HomeKpiDetalheSheet").then((m) => ({ default: m.HomeKpiDetalheSheet })));

const CHART_FALLBACK = <div className="h-64 animate-pulse bg-muted rounded-lg" />;

// Sidebar global (todas carteiras), reusa o da Home. Só os 4 KPIs equivalentes.
const KPI_KIND_BY_ID: Record<string, HomeKpiDetalheKind> = {
  valor_acordos: "acordos",
  primeira_parcela: "primeira_parcela",
  qtd_excecoes: "excecoes",
  qtd_rejeitados: "rejeitados",
};

export default function DetalhamentoAgentes() {
  const vm = useDetalhamentoViewModel();
  const { selectedDatabase } = useGlobalFilters();
  const { portfolios, loading: portfolioLoading } = usePortfolioList(selectedDatabase);
  const [kpiSheetKind, setKpiSheetKind] = useState<HomeKpiDetalheKind | null>(null);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <ExecutiveHeader title="Detalhamento de Agentes" />

          <div className="flex-1 overflow-y-auto bg-background">
            <div className="mx-auto max-w-[1600px] w-full p-6 space-y-7">
              <ApiDebugBanner error={vm.error} warnings={vm.warnings} />

              <div className="flex items-center gap-3">
                <AgentFilterBar
                  agents={vm.agentList}
                  selected={vm.selectedAgent}
                  onSelect={vm.setSelectedAgent}
                />
                <PortfolioFilter
                  portfolios={portfolios}
                  selected={vm.selectedPortfolio}
                  onSelect={vm.setSelectedPortfolio}
                  loading={portfolioLoading}
                />
              </div>

              <DetalhamentoKpiStrip
                primary={vm.kpiPrimary}
                secondary={vm.kpiSecondary}
                deltas={vm.insight.kpiDeltas}
                benchmarks={vm.kpiBenchmarks}
                clickableIds={Object.keys(KPI_KIND_BY_ID)}
                onCardClick={(id) => setKpiSheetKind(KPI_KIND_BY_ID[id])}
              />

              {/* Bloco 1 — Diagnóstico Individual */}
              <section>
                <BlockHeader
                  number="1"
                  title="Diagnóstico Individual"
                  description="Entender o porquê do desempenho: diagnóstico multidimensional."
                />

                <div className="mb-4">
                  <ExecutiveInsightCard
                    variant={vm.insight.variant}
                    title={vm.insight.title}
                    description={vm.insight.description}
                  />
                </div>

                <Suspense fallback={CHART_FALLBACK}>
                  <FunilConversao data={vm.funil} />

                  <div className="mt-3 max-w-xl mx-auto">
                    <RadarDesempenho
                      data={vm.radarData}
                      agentName={vm.selectedAgent ?? "Equipe"}
                    />
                  </div>
                </Suspense>
              </section>

              {/* Bloco 2 — Contexto Comparativo */}
              <section>
                <BlockHeader
                  number="2"
                  title="Contexto Comparativo"
                  description="Onde cada agente está no time: padrões visuais e validação estatística."
                />
                <Suspense fallback={CHART_FALLBACK}>
                  <PerformanceHeatmap
                    agents={vm.heatmapAgents}
                    highlightId={vm.selectedAgent ?? undefined}
                  />
                </Suspense>
              </section>

              {/* Bloco 3 — Ação */}
              <section>
                <BlockHeader
                  number="3"
                  title="Ação"
                  description="Quem atender primeiro: fila de prioridade e concentração de resultado."
                />
                <Suspense fallback={CHART_FALLBACK}>
                  <RankingPrioridade
                    entries={vm.rankingEntries}
                    highlightAgentId={vm.selectedAgent ?? undefined}
                    highlightRank={vm.insight.agentRank}
                    totalAgents={vm.insight.totalAgents}
                  />
                </Suspense>
              </section>

              {/* Bloco 4 — Detalhe do Agente (lazy) */}
              {vm.selectedAgent && (
                <Suspense fallback={<div className="h-48 animate-pulse bg-muted rounded-lg" />}>
                  <AgenteDetalheSection agente={vm.selectedAgent} />
                </Suspense>
              )}
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