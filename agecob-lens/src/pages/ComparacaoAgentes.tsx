import { lazy, Suspense, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FilterBar from "@/components/FilterBar";
import { type DatabaseOption } from "@/services/api";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import LazyVisibleSection from "@/components/performance/LazyVisibleSection";
import { ROUTE_LOAD_PRIORITY } from "@/config/loadPriorities";
import { useRefreshGuard } from "@/hooks/useRefreshGuard";
import { trackEvent } from "@/services/analytics";
import ExecutiveHeader from "@/components/executive/ExecutiveHeader";

const AgentComparisonDashboard = lazy(() => import("@/components/AgentComparisonDashboard"));

const DB_OPTIONS: { value: DatabaseOption; label: string }[] = [
  { value: "COBwebRCBAUTOS", label: "AUTOS" },
  { value: "COBwebRCBCONSUMER", label: "CONSUMER" },
  { value: "todos", label: "Todos" },
];

export default function ComparacaoAgentes() {
  const [db, setDb] = useState<DatabaseOption>("todos");
  const [carteira, setCarteira] = useState("Geral");
  const [assessoria, setAssessoria] = useState("todos");
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

  const handleDbChange = (nextDb: DatabaseOption) => {
    trackEvent("filter_changed", { page: "/comparacao-agentes", filter_name: "categoria_db", value: nextDb });
    setDb(nextDb);
  };

  const handleCarteiraChange = (nextCarteira: string) => {
    trackEvent("filter_changed", { page: "/comparacao-agentes", filter_name: "carteira", value: nextCarteira });
    setCarteira(nextCarteira);
  };

  const handleAssessoriaChange = (nextAssessoria: string) => {
    trackEvent("filter_changed", { page: "/comparacao-agentes", filter_name: "assessoria", value: nextAssessoria });
    setAssessoria(nextAssessoria);
  };

  const filterChips = [
    { label: "BU", value: DB_OPTIONS.find((o) => o.value === db)?.label ?? db },
    ...(assessoria !== "todos" ? [{ label: "Assessoria", value: assessoria }] : []),
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
            <Tabs value={db} onValueChange={(v) => handleDbChange(v as DatabaseOption)}>
              <TabsList>
                {DB_OPTIONS.map((opt) => (
                  <TabsTrigger key={opt.value} value={opt.value}>
                    {opt.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <FilterBar
              carteira={carteira}
              onCarteiraChange={handleCarteiraChange}
              assessoria={assessoria}
              onAssessoriaChange={handleAssessoriaChange}
            />

            <LazyVisibleSection
              id="comparacao-dashboard"
              scope="/comparacao-agentes"
              priority={ROUTE_LOAD_PRIORITY["/comparacao-agentes"].dashboard}
              fallback={<div className="text-sm text-muted-foreground">Preparando dashboard...</div>}
            >
              <Suspense fallback={<div className="text-sm text-muted-foreground">Carregando comparação...</div>}>
                <AgentComparisonDashboard key={`${db}-${assessoria}-${refreshTick}`} db={db} assessoria={assessoria} />
              </Suspense>
            </LazyVisibleSection>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
