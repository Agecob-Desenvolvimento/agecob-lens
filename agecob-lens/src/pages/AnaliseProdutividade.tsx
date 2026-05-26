import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import ExecutiveHeader from "@/components/executive/ExecutiveHeader";
import SectionHeader from "@/components/executive/SectionHeader";
import ApiDebugBanner from "@/components/executive/ApiDebugBanner";
import HomeKpiStrip from "@/components/executive/HomeKpiStrip";
import ExecutiveRankingTable from "@/components/executive/ExecutiveRankingTable";
import HandoffFinanceiroGroupedBar from "@/components/executive/HandoffFinanceiroGroupedBar";
import HandoffEficienciaGroupedBar from "@/components/executive/HandoffEficienciaGroupedBar";
import { cn } from "@/lib/utils";
import { useAnaliseViewModel } from "@/hooks/useAnaliseViewModel";

export default function AnaliseProdutividade() {
  const vm = useAnaliseViewModel();
  const navigate = useNavigate();

  const kpiPrimary = [
    { label: "CPC %", value: vm.kpiCpc, unit: "percent" as const },
    { label: "Conversão %", value: vm.kpiConversao, unit: "percent" as const },
  ];

  const kpiSecondary = [
    { label: "Ticket Médio", value: vm.kpiTicket, unit: "BRL" as const },
    { label: "Acionamentos", value: vm.kpiAcionamentos, unit: "count" as const },
    { label: "Contatos", value: vm.kpiContatos, unit: "count" as const },
    { label: "Acordos", value: vm.kpiAcordos, unit: "count" as const },
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <ExecutiveHeader title="Análise de Produtividade" />

          <div className="flex-1 overflow-y-auto bg-background">
            <div className="mx-auto max-w-[1600px] w-full p-6 space-y-6">
              <ApiDebugBanner error={vm.error} warnings={vm.warnings} />

              {/* BU Filter */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Unidade</span>
                <div className="inline-flex overflow-hidden rounded-md border border-border">
                  {vm.buOptions.map((bu) => {
                    const active = vm.selectedBu === bu;
                    return (
                      <button
                        key={bu}
                        type="button"
                        onClick={() => vm.setSelectedBu(bu)}
                        aria-pressed={active}
                        className={cn(
                          "px-3 py-1.5 text-xs font-semibold transition-colors",
                          active ? "bg-sky-500 text-white" : "bg-card text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {bu === "(Todos)" ? "Todas" : bu}
                      </button>
                    );
                  })}
                </div>
              </div>

              <HomeKpiStrip primary={kpiPrimary} secondary={kpiSecondary} />

              {/* Financeiro + Eficiência */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <HandoffFinanceiroGroupedBar
                  title="Valor por Unidade de Negócio"
                  data={vm.financeiroData}
                  empty={vm.financeiroData.length === 0}
                  loading={vm.loading}
                />
                <HandoffEficienciaGroupedBar
                  title="CPC % e Conversão % por Unidade de Negócio"
                  data={vm.eficienciaData}
                  summary={{ cpcAvg: vm.kpiCpc, conversaoAvg: vm.kpiConversao }}
                  empty={vm.eficienciaData.length === 0}
                  loading={vm.loading}
                />
              </div>

              {/* Ranking CPC */}
              <section className="space-y-3">
                <SectionHeader
                  title="Top 10 Agentes por CPC"
                  unit="%"
                  description="Ranking por contato/acionamento. Clique para abrir ficha do agente."
                />
                <ExecutiveRankingTable
                  title="Top 10 Agentes por CPC"
                  rows={vm.cpcRanking}
                  primaryColumnLabel="CPC %"
                  secondaryColumnLabel="Conversão %"
                  maxRows={10}
                  loading={vm.loading}
                  empty={vm.cpcRanking.length === 0}
                  renderActions={(row) => (
                    <button
                      type="button"
                      onClick={() => navigate(`/detalhamento-agentes?agente=${encodeURIComponent(row.label)}`)}
                      className="p-1.5 rounded hover:bg-muted transition-colors opacity-50 hover:opacity-100"
                      title="Abrir ficha"
                      aria-label={`Abrir ficha de ${row.label}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  )}
                  actionsColumnLabel=""
                />
              </section>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
