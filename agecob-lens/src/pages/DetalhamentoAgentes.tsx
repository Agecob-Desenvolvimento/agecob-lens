import { lazy, Suspense, useState, useCallback, useMemo } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
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
import { MetaEditor, applyCustomMetas, type CustomMetas } from "@/components/detalhamento/MetaEditor";

const FunilConversao = lazy(() => import("@/components/detalhamento/FunilConversao").then((m) => ({ default: m.FunilConversao })));
const BulletChartsPanel = lazy(() => import("@/components/detalhamento/BulletChartsPanel").then((m) => ({ default: m.BulletChartsPanel })));
const RadarDesempenho = lazy(() => import("@/components/detalhamento/RadarDesempenho").then((m) => ({ default: m.RadarDesempenho })));
const PerformanceHeatmap = lazy(() => import("@/components/detalhamento/PerformanceHeatmap").then((m) => ({ default: m.PerformanceHeatmap })));
const ImprovedScatterPlot = lazy(() => import("@/components/detalhamento/ImprovedScatterPlot").then((m) => ({ default: m.ImprovedScatterPlot })));
const RankingPrioridade = lazy(() => import("@/components/detalhamento/RankingPrioridade").then((m) => ({ default: m.RankingPrioridade })));
const ParetoChart = lazy(() => import("@/components/detalhamento/ParetoChart").then((m) => ({ default: m.ParetoChart })));
const AgenteDetalheSection = lazy(() => import("@/components/detalhamento/AgenteDetalheSection"));

const CHART_FALLBACK = <div className="h-64 animate-pulse bg-muted rounded-lg" />;

const STORAGE_KEY = "agdash-custom-metas";

function loadCustomMetas(): CustomMetas {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { cpc: null, conversao: null, primeiraParcela: null, excecoes: null };
}

export default function DetalhamentoAgentes() {
  const vm = useDetalhamentoViewModel();
  const { selectedDatabase } = useGlobalFilters();
  const { portfolios, loading: portfolioLoading } = usePortfolioList(selectedDatabase);
  const [customMetas, setCustomMetas] = useState<CustomMetas>(loadCustomMetas);

  const metas = useMemo(
    () => applyCustomMetas(vm.metas, customMetas),
    [vm.metas, customMetas],
  );

  const handleMetaChange = useCallback((overrides: CustomMetas) => {
    setCustomMetas(overrides);
  }, []);

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
              />

              {/* Bloco 1 — Diagnóstico Individual */}
              <section>
                <BlockHeader
                  number="1"
                  title="Diagnóstico Individual"
                  description="Entender o porquê do desempenho — diagnóstico multidimensional."
                />

                <div className="mb-4">
                  <ExecutiveInsightCard
                    variant={vm.insight.variant}
                    title={vm.insight.title}
                    description={vm.insight.description}
                  />
                </div>

                <Suspense fallback={CHART_FALLBACK}>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <FunilConversao data={vm.funil} />
                    <BulletChartsPanel data={metas} />
                  </div>

                  <MetaEditor current={vm.metas} onChange={handleMetaChange} />

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
                  description="Onde cada agente está no time — padrões visuais e validação estatística."
                />
                <Suspense fallback={CHART_FALLBACK}>
                  <div className="space-y-3">
                    <PerformanceHeatmap
                      agents={vm.heatmapAgents}
                      highlightId={vm.selectedAgent ?? undefined}
                    />
                    <ImprovedScatterPlot
                      points={vm.scatterPoints}
                      highlightId={vm.selectedAgent ?? undefined}
                    />
                  </div>
                </Suspense>
              </section>

              {/* Bloco 3 — Ação */}
              <section>
                <BlockHeader
                  number="3"
                  title="Ação"
                  description="Quem atender primeiro — fila de prioridade e concentração de resultado."
                />
                <Suspense fallback={CHART_FALLBACK}>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <RankingPrioridade
                      entries={vm.rankingEntries}
                      highlightAgentId={vm.selectedAgent ?? undefined}
                      highlightRank={vm.insight.agentRank}
                      totalAgents={vm.insight.totalAgents}
                    />
                    <ParetoChart points={vm.paretoPoints} />
                  </div>
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
    </SidebarProvider>
  );
}