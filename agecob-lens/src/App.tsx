import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadQueue } from "@/lib/loadQueue";
import { routeHeatManager } from "@/lib/routeHeatManager";
import { trackPageView } from "@/services/analytics";
import { GlobalFiltersProvider } from "@/contexts/GlobalFiltersContext";
import { NotificationProvider } from "@/contexts/NotificationProvider";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";

const Index = lazy(() => import("./pages/Index.tsx"));
const DetalhamentoAgentes = lazy(() => import("./pages/DetalhamentoAgentes.tsx"));
const EfetividadeBoletos = lazy(() => import("./pages/EfetividadeBoletos.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const ALL_ROUTES = ["/", "/detalhamento-agentes", "/efetividade-boletos"];

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

function WrapRoute({ children, routeName }: { children: React.ReactNode; routeName: string }) {
  return <RouteErrorBoundary routeName={routeName}>{children}</RouteErrorBoundary>;
}

function V2Gate({ children }: { children: React.ReactNode }) {
  const [params] = useSearchParams();
  const v2 = params.get("v2");
  if (v2 === "0") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-3 max-w-sm">
          <p className="text-sm text-muted-foreground">Dashboard Executivo v2 está desligado.</p>
          <p className="text-xs text-muted-foreground">Use <code className="bg-muted px-1 rounded">?v2=1</code> para ativar.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function AppRoutes() {
  const location = useLocation();

  useEffect(() => {
    const unregister = ALL_ROUTES.map((route) =>
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
    ALL_ROUTES
      .filter((scope) => scope !== location.pathname && scope !== warm)
      .forEach((scope) => loadQueue.cancelScope(scope));

    const warmImports: Record<string, () => Promise<unknown>> = {
      "/detalhamento-agentes": () => import("./pages/DetalhamentoAgentes.tsx"),
      "/efetividade-boletos": () => import("./pages/EfetividadeBoletos.tsx"),
    };
    const fn = warmImports[warm];
    if (fn) {
      loadQueue.enqueue(`warm:${warm}`, warm, "normal", async () => { await fn(); return true; });
    }
  }, [location.pathname]);

  useEffect(() => {
    const prefetch = () => {
      import("./pages/DetalhamentoAgentes.tsx");
      import("./pages/EfetividadeBoletos.tsx");
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
      <V2Gate>
        <Routes>
          <Route path="/" element={<WrapRoute routeName="/"><Index /></WrapRoute>} />
          <Route path="/detalhamento-agentes" element={<WrapRoute routeName="/detalhamento-agentes"><DetalhamentoAgentes /></WrapRoute>} />
          <Route path="/efetividade-boletos" element={<WrapRoute routeName="/efetividade-boletos"><EfetividadeBoletos /></WrapRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </V2Gate>
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
