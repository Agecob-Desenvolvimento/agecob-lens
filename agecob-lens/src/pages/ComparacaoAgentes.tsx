import { lazy, Suspense, useState } from "react";
import FilterBar from "@/components/FilterBar";
import { type DatabaseOption } from "@/services/api";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import LazyVisibleSection from "@/components/performance/LazyVisibleSection";
import { ROUTE_LOAD_PRIORITY } from "@/config/loadPriorities";
import { useRefreshGuard } from "@/hooks/useRefreshGuard";
import { trackEvent } from "@/services/analytics";
import ExecutiveHeader from "@/components/executive/ExecutiveHeader";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";

const AgentComparisonDashboard = lazy(() => import("@/components/AgentComparisonDashboard"));

export default function ComparacaoAgentes() {
  const { category, dateFrom, dateTo } = useGlobalFilters();
  const db: DatabaseOption =
    category === "AUTOS"
      ? "COBwebRCBAUTOS"
      : category === "CONSUMER"
        ? "COBwebRCBCONSUMER"
        : "todos";
  const [carteira, setCarteira] = useState("Geral");
  const [refreshTick, setRefreshTick] = useState(0);
  const { guardedRefresh, refreshing, remainingMs } = useRefreshGuard(async () => {
    const startedAt = performance.now();
    trackEvent("refresh_clicked", { page: "/comparacao-agentes" });
    try {
      setRefreshTick((prev) => prev + 1);
      trackEvent("refresh_success", { page: "/comparacao-agentes", duration_ms: Math.round(performance.now() - startedAt) });
      window.dispatchEvent(new CustomEvent("dashboard:refresh", { detail: { route: "/comparacao-agentes" } }));
    } catch {
      trackEvent("refresh_error", { page: "/comparacao-agentes", duration_ms: Math.round(performance.now() - startedAt) });
    }
  });

  const handleCarteiraChange = (nextCarteira: string) => {
    trackEvent("filter_changed", { page: "/comparacao-agentes", filter_name: "carteira", value: nextCarteira });
    setCarteira(nextCarteira);
  };

  const filterChips = [
    { label: "Categoria", value: category },
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <ExecutiveHeader
            title="Comparação de Agentes"
            onRefresh={guardedRefresh}
            refreshing={refreshing}
            refreshHint={remainingMs > 0 ? `Aguarde ${Math.ceil(remainingMs / 1000)}s` : "Atualizar"}
            period="Hoje"
            filters={filterChips}
          />

          <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 w-full">
            <FilterBar
              carteira={carteira}
              onCarteiraChange={handleCarteiraChange}
            />

            <LazyVisibleSection
              id="comparacao-dashboard"
              scope="/comparacao-agentes"
              priority={ROUTE_LOAD_PRIORITY["/comparacao-agentes"].dashboard}
              fallback={<div className="text-sm text-muted-foreground">Preparando dashboard...</div>}
            >
              <Suspense fallback={<div className="text-sm text-muted-foreground">Carregando comparação...</div>}>
                <AgentComparisonDashboard key={`${db}-${dateFrom}-${dateTo}-${refreshTick}`} db={db} dateFrom={dateFrom} dateTo={dateTo} />
              </Suspense>
            </LazyVisibleSection>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
