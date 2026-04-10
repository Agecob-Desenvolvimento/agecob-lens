import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import FilterBar from "@/components/FilterBar";
import AgentComparisonDashboard from "@/components/AgentComparisonDashboard";
import { type DatabaseOption, apiFetch } from "@/config/api";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

const DB_OPTIONS: { value: DatabaseOption; label: string }[] = [
  { value: "COBwebRCBAUTOS", label: "COBwebRCBAUTOS" },
  { value: "COBwebRCBCONSUMER", label: "COBwebRCBCONSUMER" },
  { value: "todos", label: "Todos" },
];

export default function ComparacaoAgentes() {
  const [db, setDb] = useState<DatabaseOption>("todos");
  const [healthOk, setHealthOk] = useState(true);
  const [category, setCategory] = useState("Todas");
  const [carteira, setCarteira] = useState("Geral");
  const [assessoria, setAssessoria] = useState("963:AGECOB_LP");

  useEffect(() => {
    setHealthOk(true);
    apiFetch(`/health/db/${db}`)
      .then(() => setHealthOk(true))
      .catch(() => setHealthOk(false));
  }, [db]);

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

            {!healthOk && (
              <Alert className="border-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.1)]">
                <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
                <AlertDescription className="text-[hsl(var(--warning))]">
                  Atenção: não foi possível conectar ao banco de dados selecionado.
                </AlertDescription>
              </Alert>
            )}

            <div className="text-center py-2">
              <span className="text-2xl font-bold tracking-widest text-foreground">AGECOB</span>
            </div>

            <AgentComparisonDashboard db={db} />
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
