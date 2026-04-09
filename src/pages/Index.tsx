import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import DashboardModule from "@/components/DashboardModule";
import { MODULES } from "@/config/api";
import { type DatabaseOption, fetchHealth } from "@/services/api";

const DB_OPTIONS: { value: DatabaseOption; label: string }[] = [
  { value: "COBwebRCBAUTOS", label: "COBwebRCBAUTOS" },
  { value: "COBwebRCBCONSUMER", label: "COBwebRCBCONSUMER" },
  { value: "todos", label: "Todos" },
];

export default function Index() {
  const [db, setDb] = useState<DatabaseOption>("todos");
  const [healthOk, setHealthOk] = useState(true);

  useEffect(() => {
    setHealthOk(true);
    fetchHealth(db)
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Agecob</h1>
        <span className="text-sm text-muted-foreground capitalize">{today}</span>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Database selector */}
        <Tabs value={db} onValueChange={(v) => setDb(v as DatabaseOption)}>
          <TabsList>
            {DB_OPTIONS.map((opt) => (
              <TabsTrigger key={opt.value} value={opt.value}>
                {opt.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Health warning */}
        {!healthOk && (
          <Alert className="border-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.1)]">
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
            <AlertDescription className="text-[hsl(var(--warning))]">
              Atenção: não foi possível conectar ao banco de dados selecionado.
            </AlertDescription>
          </Alert>
        )}

        {/* Module grid */}
        <div className="grid grid-cols-1 gap-6">
          {MODULES.map((mod) => (
            <DashboardModule key={mod.id} config={mod} db={db} />
          ))}
        </div>
      </div>
    </div>
  );
}
