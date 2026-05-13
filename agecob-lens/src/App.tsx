import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadQueue } from "@/lib/loadQueue";
import { routeHeatManager } from "@/lib/routeHeatManager";
import { trackPageView } from "@/services/analytics";
import { GlobalFiltersProvider } from "@/contexts/GlobalFiltersContext";
import { NotificationProvider } from "@/contexts/NotificationProvider";

const Index = lazy(() => import("./pages/Index.tsx"));
const ComparacaoAgentes = lazy(() => import("./pages/ComparacaoAgentes.tsx"));
const DetalhamentoAgentes = lazy(() => import("./pages/DetalhamentoAgentes.tsx"));
const AnaliseProdutividade = lazy(() => import("./pages/AnaliseProdutividade.tsx"));
const AnaliseProfunda = lazy(() => import("./pages/AnaliseProfunda.tsx"));
const EfetividadeBoletos = lazy(() => import("./pages/EfetividadeBoletos.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
// Defaults pensados para dashboard operacional:
// - staleTime 60s: janelas entre trocas rápidas não refazem fetch.
// - gcTime 5min: dados saem da memória só depois de 5 min sem consumidor.
// - refetchOnWindowFocus off: o dashboard fica aberto em monitores dedicados.
// - retry 1: o backend já faz retry implícito e tem rate-limit agressivo.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

function AppRoutes() {
  const location = useLocation();

  useEffect(() => {
    const unregister = [
      "/",
      "/comparacao-agentes",
      "/detalhamento-agentes",
      "/analise-produtividade",
      "/analise-profunda",
      "/efetividade-boletos",
    ].map((route) =>
      routeHeatManager.registerCleanup(route, () => {
        loadQueue.cancelScope(route);
      }),
    );
    return () => unregister.forEach((fn) => fn());
  }, []);

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const { warm } = routeHeatManager.promoteHot(location.pathname);
    const allRoutes = ["/", "/comparacao-agentes", "/detalhamento-agentes", "/analise-produtividade", "/analise-profunda", "/efetividade-boletos"];
    allRoutes
      .filter((scope) => scope !== location.pathname && scope !== warm)
      .forEach((scope) => loadQueue.cancelScope(scope));

    if (warm) {
      loadQueue.enqueue(`warm:${warm}`, warm, "normal", async () => {
        if (warm === "/comparacao-agentes") await import("./pages/ComparacaoAgentes.tsx");
        if (warm === "/detalhamento-agentes") await import("./pages/DetalhamentoAgentes.tsx");
        if (warm === "/analise-produtividade") await import("./pages/AnaliseProdutividade.tsx");
        if (warm === "/analise-profunda") await import("./pages/AnaliseProfunda.tsx");
        return true;
      }).catch(() => {});
    }
  }, [location.pathname]);

  useEffect(() => {
    const prefetch = () => {
      import("./pages/ComparacaoAgentes.tsx");
      import("./pages/AnaliseProdutividade.tsx");
      import("./pages/AnaliseProfunda.tsx");
    };

    const idleCallback = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;

    if (idleCallback) {
      const id = idleCallback(prefetch);
      return () => {
        const cancel = (window as Window & { cancelIdleCallback?: (handle: number) => void })
          .cancelIdleCallback;
        cancel?.(id);
      };
    }

    const timeoutId = window.setTimeout(prefetch, 700);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Carregando pagina...</div>}>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/comparacao-agentes" element={<ComparacaoAgentes />} />
        <Route path="/detalhamento-agentes" element={<DetalhamentoAgentes />} />
        <Route path="/analise-produtividade" element={<AnaliseProdutividade />} />
        <Route path="/analise-profunda" element={<AnaliseProfunda />} />
        <Route path="/efetividade-boletos" element={<EfetividadeBoletos />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <GlobalFiltersProvider>
          <NotificationProvider>
            <AppRoutes />
          </NotificationProvider>
        </GlobalFiltersProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
