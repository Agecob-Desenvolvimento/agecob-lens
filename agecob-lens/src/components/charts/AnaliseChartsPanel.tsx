import { useQueries } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import {
  type DatabaseOption,
  fetchAcordosPorPortfolio,
  fetchExcecoesPorAgente,
  fetchExcecoesPorPortfolio,
  fetchExcecoesSemPortfolio,
  fetchRejeitadosPorPortfolio,
} from "@/services/api";
import { type ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";
import {
  aggregateTotals,
  buFromSource,
  calcCpc,
  calcConversao,
  fmtBRL,
  shortAgentName,
} from "@/lib/metrics";
import SectionHeader from "@/components/executive/SectionHeader";
import HorizontalRankingChart from "@/components/executive/HorizontalRankingChart";
import GroupedVolumeChart, { type GroupedVolumeDatum } from "@/components/executive/GroupedVolumeChart";
import BuEfficiencyChart, { type BuEfficiencyDatum } from "@/components/executive/BuEfficiencyChart";

interface AnaliseChartsPanelProps {
  rows: ProdutividadeRowWithSource[];
  db: DatabaseOption;
  dateFrom?: string;
  dateTo?: string;
}

const COLOR_AUTOS = "hsl(142, 71%, 38%)";
const COLOR_CONSUMER = "hsl(142, 65%, 65%)";
const COLOR_PORTFOLIO = "hsl(142, 71%, 38%)";
const COLOR_EXCEPTION = "hsl(0, 75%, 55%)";
const COLOR_REJECTED = "hsl(25, 85%, 50%)";

export default function AnaliseChartsPanel({ rows, db, dateFrom, dateTo }: AnaliseChartsPanelProps) {
  const [qExcPort, qExcAg, qAcdPort, qRejPort, qExcNull] = useQueries({
    queries: [
      { queryKey: ["excecoes-por-portfolio", db, dateFrom, dateTo] as const, queryFn: () => fetchExcecoesPorPortfolio(db, dateFrom, dateTo) },
      { queryKey: ["excecoes-por-agente", db, dateFrom, dateTo] as const, queryFn: () => fetchExcecoesPorAgente(db, dateFrom, dateTo) },
      { queryKey: ["acordos-por-portfolio", db, dateFrom, dateTo] as const, queryFn: () => fetchAcordosPorPortfolio(db, dateFrom, dateTo) },
      { queryKey: ["rejeitados-por-portfolio", db, dateFrom, dateTo] as const, queryFn: () => fetchRejeitadosPorPortfolio(db, dateFrom, dateTo) },
      { queryKey: ["excecoes-sem-portfolio", db, dateFrom, dateTo] as const, queryFn: () => fetchExcecoesSemPortfolio(db, dateFrom, dateTo) },
    ],
  });

  const errs = [qExcPort, qExcAg, qAcdPort, qRejPort, qExcNull]
    .filter((q) => q.isError)
    .map((q) => (q.error as Error)?.message ?? "Falha")
    .join(" | ");

  // BU aggregations
  const buMap = new Map<"AUTOS" | "CONSUMER", ProdutividadeRowWithSource[]>();
  rows.forEach((row) => {
    const bu = buFromSource(row.source);
    const arr = buMap.get(bu) ?? [];
    arr.push(row);
    buMap.set(bu, arr);
  });
  const buOrder: ("AUTOS" | "CONSUMER")[] = ["AUTOS", "CONSUMER"];
  const buEfficiency: BuEfficiencyDatum[] = buOrder
    .filter((bu) => buMap.has(bu))
    .map((bu) => {
      const t = aggregateTotals(buMap.get(bu) ?? []);
      return { name: bu, cpc: calcCpc(t), conversao: calcConversao(t) };
    });
  const buVolume: GroupedVolumeDatum[] = buOrder
    .filter((bu) => buMap.has(bu))
    .map((bu) => {
      const t = aggregateTotals(buMap.get(bu) ?? []);
      return { name: bu, qtd_acionamentos: t.qtd_acionamentos, qtd_contatos: t.qtd_contatos };
    });
  const totalsAll = aggregateTotals(rows);
  const cpcAvg = calcCpc(totalsAll);
  const convAvg = calcConversao(totalsAll);

  // A1: portfolio agreed value — all portfolios, secondary = qtd_acordos
  const portfolioData = (qAcdPort.data?.data ?? [])
    .map((r) => ({
      name: r.portfolio_name,
      value: Number(r.valor_acordos || 0),
      secondaryValue: Number(r.qtd_acordos || 0),
      secondaryUnit: "count" as const,
    }))
    .sort((a, b) => b.value - a.value);

  // C1: exceptions by portfolio — primary = valor_excecoes; secondary = qtd
  const excPortfolioData = (qExcPort.data?.data ?? [])
    .filter((r) => Number(r.qtd_excecoes || 0) > 0)
    .map((r) => ({
      name: r.portfolio_name,
      value: Number(r.valor_excecoes || 0),
      secondaryValue: Number(r.qtd_excecoes || 0),
      secondaryUnit: "count" as const,
    }))
    .sort((a, b) => b.value - a.value);

  const excPortfolioLoaded = !qExcPort.isLoading && !qExcPort.isError;
  const excPortfolioZero = excPortfolioLoaded && excPortfolioData.length === 0;

  // Rejeitados por portfolio — ID_REC_STATUS = 7; primary = valor_rejeitados; secondary = qtd
  const rejPortfolioData = (qRejPort.data?.data ?? [])
    .filter((r) => Number(r.qtd_rejeitados || 0) > 0)
    .map((r) => ({
      name: r.portfolio_name,
      value: Number(r.valor_rejeitados || 0),
      secondaryValue: Number(r.qtd_rejeitados || 0),
      secondaryUnit: "count" as const,
    }))
    .sort((a, b) => b.value - a.value);

  const rejPortfolioLoaded = !qRejPort.isLoading && !qRejPort.isError;
  const rejPortfolioZero = rejPortfolioLoaded && rejPortfolioData.length === 0;

  const excSemPortfolio = qExcNull.data?.data ?? [];

  // C2: exception rate by agent (qtd_excecoes / qtd_acordos) — top 10
  const excAgenteData = rows
    .filter((r) => Number(r.qtd_acordos || 0) > 0 && Number(r.qtd_excecoes || 0) > 0)
    .map((r) => ({
      name: shortAgentName(r.NOME),
      value: (Number(r.qtd_excecoes || 0) * 100) / Number(r.qtd_acordos || 1),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {errs ? (
        <div className="flex items-start gap-2 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Falha parcial em endpoints: {errs}</span>
        </div>
      ) : null}

      <section className="space-y-3">
        <SectionHeader
          title="Portfólio"
          description="Acordos, exceções e rejeitados agrupados por portfólio (CAMPO010)."
        />
        {excSemPortfolio.length > 0 ? (
          <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-300">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
              <div className="space-y-1">
                <div className="font-semibold">
                  {excSemPortfolio.length} exceção{excSemPortfolio.length > 1 ? "ões" : ""} sem portfólio (CAMPO010 nulo) — não contabilizada{excSemPortfolio.length > 1 ? "s" : ""} no gráfico.
                </div>
                <div className="text-xs text-amber-800/90 dark:text-amber-300/80">
                  Cadastrar o portfólio em DIV_AUX.CAMPO010 no sistema-fonte para o registro voltar a aparecer:
                </div>
                <ul className="text-xs space-y-0.5 pt-1">
                  {excSemPortfolio.slice(0, 10).map((r) => (
                    <li key={r.NR_RECEBIMENTO} className="font-mono">
                      • NR {r.NR_RECEBIMENTO} · CPF {r.cpf_mask} · {r.nome_devedor} · {fmtBRL(Number(r.valor_primeira_parcela || 0))} · agente {r.agente}
                    </li>
                  ))}
                  {excSemPortfolio.length > 10 ? (
                    <li className="text-amber-800/70 dark:text-amber-300/60">… +{excSemPortfolio.length - 10} outros</li>
                  ) : null}
                </ul>
              </div>
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <HorizontalRankingChart
            title="Valor de Acordos por Portfólio"
            data={portfolioData}
            unit="BRL"
            defaultColor={COLOR_PORTFOLIO}
            empty={portfolioData.length === 0}
          />
          {excPortfolioZero ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-300/50 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
              <span className="font-semibold">Nenhuma exceção registrada hoje.</span>
            </div>
          ) : (
            <HorizontalRankingChart
              title="Exceções por Portfólio (Valor)"
              data={excPortfolioData}
              unit="BRL"
              defaultColor={COLOR_EXCEPTION}
              empty={excPortfolioData.length === 0}
            />
          )}
          {rejPortfolioZero ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-300/50 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
              <span className="font-semibold">Nenhum acordo rejeitado hoje.</span>
            </div>
          ) : (
            <HorizontalRankingChart
              title="Rejeitados por Portfólio (Valor)"
              data={rejPortfolioData}
              unit="BRL"
              defaultColor={COLOR_REJECTED}
              empty={rejPortfolioData.length === 0}
            />
          )}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Eficiência"
          description="Volume de esforço (acionamentos/contatos) e taxas (contato/Conversão) por unidade de negócio."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <GroupedVolumeChart
            title="Volume por Unidade de Negócio"
            data={buVolume}
            empty={buVolume.length === 0}
          />
          <BuEfficiencyChart
            title="Taxa de contato % e Conversão % por Unidade de Negócio"
            data={buEfficiency}
            cpcAverage={cpcAvg}
            conversaoAverage={convAvg}
            empty={buEfficiency.length === 0}
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Risco / Qualidade"
          description="Taxa de exceções por agente (% sobre acordos)."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <HorizontalRankingChart
            title="Top 10 Agentes por Taxa de Exceção (%)"
            data={excAgenteData}
            unit="%"
            defaultColor={COLOR_EXCEPTION}
            empty={excAgenteData.length === 0}
          />
        </div>
      </section>
    </div>
  );
}

// Suppress unused warnings for legacy color tokens kept for future BU coloring
void COLOR_AUTOS;
void COLOR_CONSUMER;
