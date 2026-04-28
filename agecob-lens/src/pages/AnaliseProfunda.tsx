import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AnaliseProfunda() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-3">
            <SidebarTrigger />
            <h1 className="text-sm font-semibold text-foreground tracking-tight">
              Análise profunda
            </h1>
          </header>

          <main className="flex-1 bg-background p-6">
            <Card>
              <CardHeader>
                <CardTitle>Análise profunda (W.I.P.)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>Área reservada para estudos e implementação de Machine Learning e Deep Learning.</p>
                <p>W.I.P.: em construção.</p>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
