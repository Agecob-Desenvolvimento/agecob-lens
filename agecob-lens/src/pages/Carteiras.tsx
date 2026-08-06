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
import {
  fetchRealPorPortfolio,
  fetchAcordosDetalheGlobal,
  type RealPorPortfolioRow,
  type QuebradoDetalheRow,
} from "@/services/api";
import { todayStr, formatMesLabel } from "@/lib/dates";
import { DIAS_UTEIS_MES } from "@/lib/metrics";
import ReportDownloadDialog from "@/components/executive/ReportDownloadDialog";
import type { ReportSection } from "@/lib/csvReport";

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
  const [mesSelecionado, setMesSelecionado] = useState<string | null>(null);

  const { metasFiltradas, isMedia, mediaRow, envelopeMeta, meses, mesEfetivo, isLoading: metasLoading } =
    useMetasData(selectedPortfolio, mesSelecionado ?? undefined);

  // Real = acordos do MÊS selecionado (meta do PDF é mensal, não diária).
  const { from: realFrom, to: realTo } = mesEfetivo ? mesRange(mesEfetivo) : { from: "", to: "" };
  const { data: realData } = useQuery({
    queryKey: ["real-por-portfolio", selectedDatabase, realFrom, realTo],
    queryFn: () => fetchRealPorPortfolio(selectedDatabase, realFrom, realTo),
    staleTime: 60_000,
    enabled: metasFiltradas.length > 0 && !!selectedDatabase && !!mesEfetivo,
  });
  const dadosReais = useMemo(() => {
    if (!realData?.data) return undefined;
    const map: Record<string, RealPorPortfolioRow> = {};
    for (const row of realData.data) map[row.portfolio_name] = row;
    return map;
  }, [realData]);

  // Meta do dia: geração de 1ª parcela de HOJE (sempre hoje, independe do mês
  // selecionado nas barras) somada nas carteiras exibidas. Compara com meta/dia.
  const hoje = todayStr();
  const { data: realHojeData } = useQuery({
    queryKey: ["real-por-portfolio", selectedDatabase, hoje, hoje],
    queryFn: () => fetchRealPorPortfolio(selectedDatabase, hoje, hoje),
    staleTime: 60_000,
    enabled: metasFiltradas.length > 0 && !!selectedDatabase,
  });
  const geracaoHojeTotal = useMemo(() => {
    if (!realHojeData?.data) return null;
    const map: Record<string, RealPorPortfolioRow> = {};
    for (const row of realHojeData.data) map[row.portfolio_name] = row;
    return metasFiltradas.reduce(
      (soma, m) => soma + (map[m.portfolio]?.valor_primeira_parcela ?? 0),
      0,
    );
  }, [realHojeData, metasFiltradas]);

  // Acordos individuais do mês (1 linha por acordo, com a carteira) — base da
  // seção "Acordos por Carteira" do relatório.
  const { data: acordosDetalheData } = useQuery({
    queryKey: ["acordos-detalhe-todos", selectedDatabase, realFrom, realTo],
    queryFn: () => fetchAcordosDetalheGlobal(selectedDatabase, realFrom, realTo),
    staleTime: 60_000,
    enabled: !!selectedDatabase && !!mesEfetivo,
  });
  const acordosDetalhe = useMemo<QuebradoDetalheRow[]>(() => {
    const rows = acordosDetalheData?.data ?? [];
    const filtradas = selectedPortfolio
      ? rows.filter((r) => r.portfolio_name === selectedPortfolio)
      : rows;
    return [...filtradas].sort((a, b) =>
      (a.portfolio_name ?? "").localeCompare(b.portfolio_name ?? "") ||
      b.valor_primeira_parcela - a.valor_primeira_parcela,
    );
  }, [acordosDetalheData, selectedPortfolio]);

  const totalMetaCaixa = useMemo(
    () => metasFiltradas.reduce((s, m) => s + m.meta_caixa, 0),
    [metasFiltradas],
  );

  const reportSections = useMemo<ReportSection[]>(() => {
    const metaDia = totalMetaCaixa > 0 ? totalMetaCaixa / DIAS_UTEIS_MES : 0;
    return [
      {
        id: "meta-vs-real",
        label: "Meta vs Real por Carteira (mês)",
        available: metasFiltradas.length > 0,
        build: () => ({
          columns: [
            "Portfólio", "Grupo", "Negociadores", "Meta Caixa (R$)",
            "Caixa Recebido Mês (R$)", "1ª Parcela Mês (R$)", "Qtd Acordos", "Atingimento (%)",
          ],
          rows: metasFiltradas.map((m) => {
            const r = dadosReais?.[m.portfolio];
            const ating = m.meta_caixa > 0 && r ? (r.valor_recebido / m.meta_caixa) * 100 : "";
            return [
              m.portfolio, m.grupo ?? "", m.qtd_negociadores, m.meta_caixa,
              r?.valor_recebido ?? "", r?.valor_primeira_parcela ?? "", r?.qtd_acordos ?? "", ating,
            ];
          }),
        }),
      },
      {
        id: "meta-dia",
        label: "Meta do Dia (agregado)",
        available: totalMetaCaixa > 0,
        build: () => ({
          columns: ["Métrica", "Valor"],
          rows: [
            ["Total Meta Caixa do mês (R$)", totalMetaCaixa],
            [`Meta do dia (R$): Meta Caixa ÷ ${DIAS_UTEIS_MES}`, metaDia],
            ["1ª Parcela gerada hoje (R$)", geracaoHojeTotal ?? ""],
            [
              "Atingimento do dia (%)",
              metaDia > 0 && geracaoHojeTotal != null ? (geracaoHojeTotal / metaDia) * 100 : "",
            ],
          ],
        }),
      },
      {
        id: "acordos-carteira",
        label: "Acordos por Carteira (individual, mês)",
        available: acordosDetalhe.length > 0,
        build: () => ({
          columns: [
            "Carteira", "Nº Recebimento", "Devedor", "CPF", "Agente", "Matrícula",
            "Valor 1ª Parcela (R$)", "Valor Total Acordo (R$)", "Parcelas",
            "Data Acordo", "Vencimento",
          ],
          rows: acordosDetalhe.map((a) => [
            a.portfolio_name ?? "—", a.NR_RECEBIMENTO, a.nome_devedor, a.cpf_mask,
            a.agente, a.matricula, a.valor_primeira_parcela, a.valor_total,
            a.total_parcelas, a.data_acordo ?? "", a.data_vencimento ?? "",
          ]),
        }),
      },
    ];
  }, [metasFiltradas, dadosReais, totalMetaCaixa, geracaoHojeTotal, acordosDetalhe]);

  const reportMeta = useMemo(
    () => ({
      "Relatório": "Carteiras · Meta vs Real",
      "Mês": mesEfetivo ? formatMesLabel(mesEfetivo) : "—",
      "Banco": selectedDatabase,
      "Carteira": selectedPortfolio ?? "Todas",
      "Trimestre metas": envelopeMeta?.periodo ?? "—",
      "Gerado em": new Date().toLocaleString("pt-BR"),
    }),
    [mesEfetivo, selectedDatabase, selectedPortfolio, envelopeMeta],
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <ExecutiveHeader title="Carteiras · Meta vs Real" />

          <div className="flex-1 overflow-y-auto bg-background">
            <div className="mx-auto max-w-[1600px] w-full p-6 space-y-7">
              <div className="flex justify-end">
                <ReportDownloadDialog
                  meta={reportMeta}
                  sections={reportSections}
                  filename={`relatorio-carteiras-${mesEfetivo ?? "sem-mes"}.csv`}
                />
              </div>

              <section>
                <BlockHeader
                  number="1"
                  title="Atingimento de Metas por Carteira"
                  description="Meta trimestral (PDF) vs valor gerado no mês: quais carteiras estão atrás do alvo."
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
                  meses={meses}
                  mesSelecionado={mesEfetivo}
                  onMesChange={setMesSelecionado}
                  dadosReais={dadosReais}
                  geracaoHojeTotal={geracaoHojeTotal}
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
