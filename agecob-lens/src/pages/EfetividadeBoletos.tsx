import { lazy, Suspense, useMemo, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import ExecutiveHeader from "@/components/executive/ExecutiveHeader";
import SectionHeader from "@/components/executive/SectionHeader";
import ApiDebugBanner from "@/components/executive/ApiDebugBanner";
import { cn } from "@/lib/utils";
import { BoletosKpiStrip } from "@/components/analise/BoletosKpiStrip";
import { useEfetividadeViewModel, type TipoParcela } from "@/hooks/useEfetividadeViewModel";

const EfetividadeDiariaChart = lazy(() => import("@/components/analise/EfetividadeDiariaChart").then((m) => ({ default: m.EfetividadeDiariaChart })));
const PortfolioSection = lazy(() => import("@/components/analise/PortfolioSection").then((m) => ({ default: m.PortfolioSection })));
const BoletosQuebradosChart = lazy(() => import("@/components/analise/BoletosQuebradosChart").then((m) => ({ default: m.BoletosQuebradosChart })));
const FunilConversaoFinanceira = lazy(() => import("@/components/analise/FunilConversaoFinanceira").then((m) => ({ default: m.FunilConversaoFinanceira })));
// FunilFinanceiroBoleto aparcado — reativar quando necessário
// const FunilFinanceiroBoleto = lazy(() => import("@/components/analise/FunilFinanceiroBoleto").then((m) => ({ default: m.FunilFinanceiroBoleto })));
const EfetividadeHistoricaChart = lazy(() => import("@/components/analise/EfetividadeHistoricaChart").then((m) => ({ default: m.EfetividadeHistoricaChart })));
const WaterfallPerdasChart = lazy(() => import("@/components/analise/WaterfallPerdasChart").then((m) => ({ default: m.WaterfallPerdasChart })));
const CurvaQuebraAtrasoChart = lazy(() => import("@/components/analise/CurvaQuebraAtrasoChart").then((m) => ({ default: m.CurvaQuebraAtrasoChart })));

const CHART_FALLBACK = <div className="h-64 animate-pulse bg-muted rounded-lg" />;

const TIPOS = ["Primeira Parcela", "Colchão"] as const;

function tipoToApi(t: (typeof TIPOS)[number]): TipoParcela {
  return t === "Colchão" ? "colchao" : "primeira";
}

export default function EfetividadeBoletos() {
  const [tipoLabel, setTipoLabel] = useState<(typeof TIPOS)[number]>("Primeira Parcela");
  const vm = useEfetividadeViewModel(tipoToApi(tipoLabel));

  // Derived waterfall stages from KPI data
  const waterfallStages = useMemo(() => {
    const k = vm.resumoKpis;
    if (!k) return [];
    const perdido = k.amount_maturing - k.amount_received;
    return [
      { label: "Acordado", value: k.amount_maturing, color: "#0284c7" },
      { label: "Não Pago", value: -perdido, color: "#f43f5e" },
      { label: "= Pago", value: 0, color: "#059669" },
    ];
  }, [vm.resumoKpis]);



  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <ExecutiveHeader title="Análise & Efetividade" />

          <div className="flex-1 overflow-y-auto bg-background">
            <div className="mx-auto max-w-[1600px] w-full p-6 space-y-6">
              <ApiDebugBanner error={vm.error} warnings={[]} />

              {/* Tipo filter */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Tipo</span>
                <div className="inline-flex overflow-hidden rounded-md border border-border">
                  {TIPOS.map((t) => {
                    const active = tipoLabel === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTipoLabel(t)}
                        aria-pressed={active}
                        className={cn(
                          "px-4 py-1.5 text-xs font-semibold transition-colors",
                          active ? "bg-sky-500 text-white" : "bg-card text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Efetividade de Boletos */}
              <section className="space-y-3">
                <SectionHeader
                  title="Efetividade de Boletos"
                  description="KPIs de boletos gerados, pagos, conversão e efetividade no período."
                />
                <BoletosKpiStrip kpis={vm.kpis} />
              </section>

              {/* Efetividade Diária */}
              <Suspense fallback={CHART_FALLBACK}>
                <EfetividadeDiariaChart
                  data={vm.diaria}
                  title={`Efetividade Diária por Data de Vencimento — ${vm.diaria.length > 0 ? vm.diaria[0].dia : ""} — ${vm.diaria.length > 0 ? vm.diaria[vm.diaria.length - 1].dia : ""}`}
                />
              </Suspense>

              {/* Série Histórica */}
              <Suspense fallback={CHART_FALLBACK}>
                <EfetividadeHistoricaChart data={vm.tendencia} />
              </Suspense>

              {/* Funil Operacional */}
              <Suspense fallback={CHART_FALLBACK}>
                <FunilConversaoFinanceira
                  acordos={vm.resumoKpis?.total_acordos ?? 0}
                  boletosEmitidos={vm.resumoKpis?.generated ?? 0}
                  boletosPagos={vm.resumoKpis?.paid_on_time ?? 0}
                />
              </Suspense>

              {/* Análise Avançada: Waterfall + Curva de Quebra */}
              <section className="space-y-3">
                <SectionHeader
                  title="Análise Avançada"
                  description="Diagnóstico de perdas financeiras e curva de quebra por faixa de atraso."
                />
                <Suspense fallback={CHART_FALLBACK}>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <WaterfallPerdasChart stages={waterfallStages} />
                    <CurvaQuebraAtrasoChart data={vm.curvaQuebra} />
                  </div>
                </Suspense>
              </section>

              {/* Portfólio */}
              <section className="space-y-3">
                <SectionHeader
                  title="Portfólio"
                  description="Acordos, exceções e rejeitados agrupados por portfólio (CAMPO010)."
                />
                <Suspense fallback={CHART_FALLBACK}>
                  <PortfolioSection
                    portfolioValor={vm.portfolioValor}
                    excecoesPorPortfolio={vm.portfolioExcecoes}
                    rejeitadosPorPortfolio={vm.portfolioRejeitados}
                    loading={vm.loadingPortfolio}
                  />
                </Suspense>
              </section>

              {/* Boletos Quebrados */}
              <section className="space-y-3">
                <SectionHeader
                  title="Boletos Quebrados"
                  description="Acordos que não foram mantidos — análise por portfólio com perfil do devedor."
                />
                <Suspense fallback={CHART_FALLBACK}>
                  <BoletosQuebradosChart
                    portfolioRows={vm.boletosQuebrados}
                    loading={vm.loadingQuebrados}
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