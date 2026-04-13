import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadQueue } from "@/lib/loadQueue";
import { routeHeatManager } from "@/lib/routeHeatManager";

const Index = lazy(() => import("./pages/Index.tsx"));
const ComparacaoAgentes = lazy(() => import("./pages/ComparacaoAgentes.tsx"));
const DetalhamentoAgentes = lazy(() => import("./pages/DetalhamentoAgentes.tsx"));
const AnaliseProdutividade = lazy(() => import("./pages/AnaliseProdutividade.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const queryClient = new QueryClient();

function AppRoutes() {
  const location = useLocation();

  useEffect(() => {
    const unregister = [
      "/",
      "/comparacao-agentes",
      "/detalhamento-agentes",
      "/analise-produtividade",
    ].map((route) =>
      routeHeatManager.registerCleanup(route, () => {
        loadQueue.cancelScope(route);
      }),
    );
    return () => unregister.forEach((fn) => fn());
  }, []);

  useEffect(() => {
    const { warm } = routeHeatManager.promoteHot(location.pathname);
    const allRoutes = ["/", "/comparacao-agentes", "/detalhamento-agentes", "/analise-produtividade"];
    allRoutes
      .filter((scope) => scope !== location.pathname && scope !== warm)
      .forEach((scope) => loadQueue.cancelScope(scope));

    if (warm) {
      loadQueue.enqueue(`warm:${warm}`, warm, "normal", async () => {
        if (warm === "/comparacao-agentes") await import("./pages/ComparacaoAgentes.tsx");
        if (warm === "/detalhamento-agentes") await import("./pages/DetalhamentoAgentes.tsx");
        if (warm === "/analise-produtividade") await import("./pages/AnaliseProdutividade.tsx");
        return true;
      }).catch(() => {});
    }
  }, [location.pathname]);

  useEffect(() => {
    const prefetch = () => {
      import("./pages/ComparacaoAgentes.tsx");
      import("./pages/AnaliseProdutividade.tsx");
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
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
