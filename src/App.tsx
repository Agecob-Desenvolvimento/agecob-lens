import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import ComparacaoAgentes from "./pages/ComparacaoAgentes.tsx";
import AnaliseProdutividade from "./pages/AnaliseProdutividade.tsx";
import DetalhamentoAgentes from "./pages/DetalhamentoAgentes.tsx";
import NotFound from "./pages/NotFound.tsx";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/comparacao-agentes" element={<ComparacaoAgentes />} />
          <Route path="/analise-produtividade" element={<AnaliseProdutividade />} />
          <Route path="/detalhamento-agentes" element={<DetalhamentoAgentes />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
