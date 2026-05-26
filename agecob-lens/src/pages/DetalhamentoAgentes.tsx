import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import ExecutiveHeader from "@/components/executive/ExecutiveHeader";
import BlockHeader from "@/components/executive/BlockHeader";
import ApiDebugBanner from "@/components/executive/ApiDebugBanner";
import { AgentFilterBar } from "@/components/detalhamento/AgentFilterBar";
import { DetalhamentoKpiStrip } from "@/components/detalhamento/DetalhamentoKpiStrip";
import { FunilConversao } from "@/components/detalhamento/FunilConversao";
import { BulletChartsPanel } from "@/components/detalhamento/BulletChartsPanel";
import { PerformanceHeatmap } from "@/components/detalhamento/PerformanceHeatmap";
import { ImprovedScatterPlot } from "@/components/detalhamento/ImprovedScatterPlot";
import { RegressionView } from "@/components/detalhamento/RegressionView";
import { RankingPrioridade } from "@/components/detalhamento/RankingPrioridade";
import { ParetoChart } from "@/components/detalhamento/ParetoChart";
import { useDetalhamentoViewModel } from "@/hooks/useDetalhamentoViewModel";

export default function DetalhamentoAgentes() {
  const vm = useDetalhamentoViewModel();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <ExecutiveHeader title="Detalhamento de Agentes" />

          <div className="flex-1 overflow-y-auto bg-background">
            <div className="mx-auto max-w-[1600px] w-full p-6 space-y-7">
              <ApiDebugBanner error={vm.error} warnings={vm.warnings} />

              <AgentFilterBar
                agents={vm.agentList}
                selected={vm.selectedAgent}
                onSelect={vm.setSelectedAgent}
              />

              <DetalhamentoKpiStrip
                primary={vm.kpiPrimary}
                secondary={vm.kpiSecondary}
              />

              {/* Bloco 1 — Diagnóstico Individual */}
              <section>
                <BlockHeader
                  number="1"
                  title="Diagnóstico Individual"
                  description="Entender o porquê do desempenho — funil de conversão e performance vs meta."
                />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <FunilConversao data={vm.funil} />
                  <BulletChartsPanel data={vm.metas} />
                </div>
              </section>

              {/* Bloco 2 — Contexto Comparativo */}
              <section>
                <BlockHeader
                  number="2"
                  title="Contexto Comparativo"
                  description="Onde cada agente está no time — padrões visuais e validação estatística."
                />
                <div className="space-y-3">
                  <PerformanceHeatmap
                    agents={vm.heatmapAgents}
                    highlightId={vm.selectedAgent ?? undefined}
                  />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <ImprovedScatterPlot points={vm.scatterPoints} />
                    <RegressionView points={vm.scatterPoints} />
                  </div>
                </div>
              </section>

              {/* Bloco 3 — Ação */}
              <section>
                <BlockHeader
                  number="3"
                  title="Ação"
                  description="Quem atender primeiro — fila de prioridade e concentração de resultado."
                />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <RankingPrioridade entries={vm.rankingEntries} />
                  <ParetoChart points={vm.paretoPoints} />
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
