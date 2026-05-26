import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import ExecutiveHeader from "@/components/executive/ExecutiveHeader";
import SectionHeader from "@/components/executive/SectionHeader";
import ApiDebugBanner from "@/components/executive/ApiDebugBanner";
import ExecutiveInsightCard from "@/components/executive/ExecutiveInsightCard";
import ExecutiveRankingTable from "@/components/executive/ExecutiveRankingTable";
import { AgentFilterBar } from "@/components/detalhamento/AgentFilterBar";
import { useComparacaoViewModel } from "@/hooks/useComparacaoViewModel";
import { formatBRLCompact, fmtPct } from "@/lib/metrics";

export default function ComparacaoAgentes() {
  const vm = useComparacaoViewModel();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <ExecutiveHeader title="Comparação de Agentes" />

          <div className="flex-1 overflow-y-auto bg-background">
            <div className="mx-auto max-w-[1600px] w-full p-6 space-y-6">
              <ApiDebugBanner error={vm.error} warnings={vm.warnings} />

              {/* Agent selectors side-by-side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">
                    Agente A
                  </div>
                  <AgentFilterBar
                    agents={vm.agentList}
                    selected={vm.agenteA}
                    onSelect={vm.setAgenteA}
                  />
                  {vm.agenteA && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {vm.kpisA.map((k) => (
                        <div key={k.label} className="bg-card border rounded-md px-3 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground">{k.label}</div>
                          <div className="text-sm font-semibold tabular-nums">
                            {k.unit === "BRL" ? formatBRLCompact(k.value) : k.unit === "%" ? fmtPct(k.value) : k.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">
                    Agente B
                  </div>
                  <AgentFilterBar
                    agents={vm.agentList}
                    selected={vm.agenteB}
                    onSelect={vm.setAgenteB}
                  />
                  {vm.agenteB && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {vm.kpisB.map((k) => (
                        <div key={k.label} className="bg-card border rounded-md px-3 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground">{k.label}</div>
                          <div className="text-sm font-semibold tabular-nums">
                            {k.unit === "BRL" ? formatBRLCompact(k.value) : k.unit === "%" ? fmtPct(k.value) : k.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Veredito */}
              <ExecutiveInsightCard
                variant={vm.veredito.variant}
                description={vm.veredito.description}
                loading={vm.loading}
              />

              {/* Radar chart — simplified bar comparison */}
              {vm.radarData.length > 0 && (
                <section className="space-y-3">
                  <SectionHeader
                    title="Comparação por Dimensão"
                    unit="%"
                    description="Valores normalizados pelo máximo da equipe (BU dos selecionados)."
                  />
                  <div className="bg-card border rounded-lg p-5">
                    <div className="space-y-2">
                      {vm.radarData.map((d) => (
                        <div key={d.dim} className="flex items-center gap-3">
                          <span className="w-20 text-xs text-right text-muted-foreground">{d.dim}</span>
                          <div className="flex-1 flex items-center gap-1">
                            <div className="flex-1 h-5 bg-blue-50 rounded-sm overflow-hidden flex justify-end">
                              <div
                                className="h-full bg-blue-500 rounded-sm transition-all"
                                style={{ width: `${d.agentA}%` }}
                              />
                            </div>
                            <span className="w-8 text-[10px] tabular-nums text-center text-blue-700 font-semibold">
                              {d.agentA}
                            </span>
                          </div>
                          <div className="flex-1 flex items-center gap-1">
                            <div className="flex-1 h-5 bg-amber-50 rounded-sm overflow-hidden flex justify-end">
                              <div
                                className="h-full bg-amber-500 rounded-sm transition-all"
                                style={{ width: `${d.agentB}%` }}
                              />
                            </div>
                            <span className="w-8 text-[10px] tabular-nums text-center text-amber-700 font-semibold">
                              {d.agentB}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* Top 10 ranking */}
              <ExecutiveRankingTable
                title="Top 10 Agentes por Valor"
                rows={vm.rankingData}
                primaryColumnLabel="Valor"
                secondaryColumnLabel="Qtd"
                maxRows={10}
                loading={vm.loading}
                empty={vm.rankingData.length === 0}
              />
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
