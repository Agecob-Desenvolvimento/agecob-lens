import { lazy, Suspense, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FilterBar from "@/components/FilterBar";
import { type DatabaseOption } from "@/services/api";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import LazyVisibleSection from "@/components/performance/LazyVisibleSection";
import { ROUTE_LOAD_PRIORITY } from "@/config/loadPriorities";

const AgentComparisonDashboard = lazy(() => import("@/components/AgentComparisonDashboard"));

const DB_OPTIONS: { value: DatabaseOption; label: string }[] = [
  { value: "COBwebRCBAUTOS", label: "COBwebRCBAUTOS" },
  { value: "COBwebRCBCONSUMER", label: "COBwebRCBCONSUMER" },
  { value: "todos", label: "Todos" },
];

export default function ComparacaoAgentes() {
  const [db, setDb] = useState<DatabaseOption>("todos");
  const [category, setCategory] = useState("Todas");
  const [carteira, setCarteira] = useState("Geral");
  const [assessoria, setAssessoria] = useState("todos");

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="border-b border-border px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <h1 className="text-xl font-bold tracking-tight text-foreground">Agecob</h1>
            </div>
            <span className="text-sm text-muted-foreground capitalize">{today}</span>
          </header>

          <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 w-full">
            <Tabs value={db} onValueChange={(v) => setDb(v as DatabaseOption)}>
              <TabsList>
                {DB_OPTIONS.map((opt) => (
                  <TabsTrigger key={opt.value} value={opt.value}>
                    {opt.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <FilterBar
              category={category}
              onCategoryChange={setCategory}
              carteira={carteira}
              onCarteiraChange={setCarteira}
              assessoria={assessoria}
              onAssessoriaChange={setAssessoria}
            />

            <div className="text-center py-2">
              <span className="text-2xl font-bold tracking-widest text-foreground">AGECOB</span>
            </div>

            <LazyVisibleSection
              id="comparacao-dashboard"
              scope="/comparacao-agentes"
              priority={ROUTE_LOAD_PRIORITY["/comparacao-agentes"].dashboard}
              fallback={<div className="text-sm text-muted-foreground">Preparando dashboard...</div>}
            >
              <Suspense fallback={<div className="text-sm text-muted-foreground">Carregando comparacao...</div>}>
                <AgentComparisonDashboard db={db} assessoria={assessoria} />
              </Suspense>
            </LazyVisibleSection>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
