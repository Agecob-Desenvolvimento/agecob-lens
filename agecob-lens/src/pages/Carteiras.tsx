import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import ExecutiveHeader from "@/components/executive/ExecutiveHeader";
import BlockHeader from "@/components/executive/BlockHeader";
import { PortfolioFilter } from "@/components/detalhamento/PortfolioFilter";
import { MetaVsRealPanel } from "@/components/detalhamento/MetaVsRealPanel";
import { usePortfolioList } from "@/hooks/usePortfolioList";
import { useMetasData } from "@/hooks/useMetasData";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { fetchRealPorPortfolio, type RealPorPortfolioRow } from "@/services/api";

/** Trimestre corrente no formato do PDF (ex: "2T26"). */
function trimestreAtual(): string {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${q}T${String(now.getFullYear()).slice(2)}`;
}

/** Range do mês selecionado ("202606" → 2026-06-01 a 2026-06-30) para casar
 *  o real (acordos do mês) com a meta mensal do PDF. */
function mesRange(mes: string): { from: string; to: string } {
  const ano = mes.slice(0, 4);
  const m = mes.slice(4, 6);
  const ultimoDia = new Date(Number(ano), Number(m), 0).getDate();
  return { from: `${ano}-${m}-01`, to: `${ano}-${m}-${String(ultimoDia).padStart(2, "0")}` };
}

export default function Carteiras() {
  const { selectedDatabase } = useGlobalFilters();
  const { portfolios, loading: portfolioLoading } = usePortfolioList(selectedDatabase);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string | null>(null);
  const [mesSelecionado, setMesSelecionado] = useState<"202604" | "202605" | "202606">("202606");

  const { metasFiltradas, isMedia, mediaRow, envelopeMeta, isLoading: metasLoading } =
    useMetasData(selectedPortfolio, mesSelecionado);

  // Real = acordos do MÊS selecionado (meta do PDF é mensal, não diária).
  const { from: realFrom, to: realTo } = mesRange(mesSelecionado);
  const { data: realData } = useQuery({
    queryKey: ["real-por-portfolio", selectedDatabase, realFrom, realTo],
    queryFn: () => fetchRealPorPortfolio(selectedDatabase, realFrom, realTo),
    staleTime: 60_000,
    enabled: metasFiltradas.length > 0 && !!selectedDatabase,
  });
  const dadosReais = useMemo(() => {
    if (!realData?.data) return undefined;
    const map: Record<string, RealPorPortfolioRow> = {};
    for (const row of realData.data) map[row.portfolio_name] = row;
    return map;
  }, [realData]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <ExecutiveHeader title="Carteiras — Meta vs Real" />

          <div className="flex-1 overflow-y-auto bg-background">
            <div className="mx-auto max-w-[1600px] w-full p-6 space-y-7">
              <section>
                <BlockHeader
                  number="1"
                  title="Atingimento de Metas por Carteira"
                  description="Meta trimestral (PDF) vs valor gerado no mês — quais carteiras estão atrás do alvo."
                />

                <div className="mb-3">
                  <PortfolioFilter
                    portfolios={portfolios}
                    selected={selectedPortfolio}
                    onSelect={setSelectedPortfolio}
                    loading={portfolioLoading}
                  />
                </div>

                <MetaVsRealPanel
                  mediaRow={mediaRow}
                  metasFiltradas={metasFiltradas}
                  isMedia={isMedia}
                  mesSelecionado={mesSelecionado}
                  onMesChange={setMesSelecionado}
                  dadosReais={dadosReais}
                  loading={metasLoading}
                  periodoMetas={envelopeMeta?.periodo ?? null}
                  trimestreAtual={trimestreAtual()}
                />
              </section>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
