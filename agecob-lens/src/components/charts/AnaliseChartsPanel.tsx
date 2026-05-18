import { useQueries } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import {
  type DatabaseOption,
  fetchAcordosPorPortfolio,
  fetchExcecoesPorAgente,
  fetchExcecoesPorPortfolio,
  fetchPrimeiraParcelaPorAgente,
} from "@/services/api";
import { type ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";
import {
  aggregateTotals,
  buFromSource,
  calcCpc,
  calcConversao,
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
const COLOR_FIRST_INSTALLMENT = "hsl(142, 65%, 55%)";
const COLOR_EXCEPTION = "hsl(0, 75%, 55%)";

export default function AnaliseChartsPanel({ rows, db, dateFrom, dateTo }: AnaliseChartsPanelProps) {
  const [qExcPort, qExcAg, qAcdPort, qPpAg] = useQueries({
    queries: [
      { queryKey: ["excecoes-por-portfolio", db, dateFrom, dateTo] as const, queryFn: () => fetchExcecoesPorPortfolio(db, dateFrom, dateTo) },
      { queryKey: ["excecoes-por-agente", db, dateFrom, dateTo] as const, queryFn: () => fetchExcecoesPorAgente(db, dateFrom, dateTo) },
      { queryKey: ["acordos-por-portfolio", db, dateFrom, dateTo] as const, queryFn: () => fetchAcordosPorPortfolio(db, dateFrom, dateTo) },
      { queryKey: ["primeira-parcela-por-agente", db, dateFrom, dateTo] as const, queryFn: () => fetchPrimeiraParcelaPorAgente(db, undefined, dateFrom, dateTo) },
    ],
  });

  const errs = [qExcPort, qExcAg, qAcdPort, qPpAg]
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

  // A2: top 10 agents by first installment — secondary = qtd_acordos
  const ppAgenteData = (qPpAg.data?.data ?? [])
    .slice(0, 10)
    .map((r) => ({
      name: shortAgentName(r.agente),
      value: Number(r.valor_primeira_parcela || 0),
      secondaryValue: Number(r.qtd_acordos_primeira_parcela || 0),
      secondaryUnit: "count" as const,
    }));

  // C1: exceptions by portfolio — secondary = valor_excecoes; all portfolios with > 0
  const excPortfolioData = (qExcPort.data?.data ?? [])
    .filter((r) => Number(r.qtd_excecoes || 0) > 0)
    .map((r) => ({
      name: r.portfolio_name,
      value: Number(r.qtd_excecoes || 0),
      secondaryValue: Number(r.valor_excecoes || 0),
      secondaryUnit: "BRL" as const,
    }))
    .sort((a, b) => b.value - a.value);

  const excPortfolioLoaded = !qExcPort.isLoading && !qExcPort.isError;
  const excPortfolioZero = excPortfolioLoaded && excPortfolioData.length === 0;

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
          title="Financeiro"
          description="Resultados em valor de acordos e entrada de caixa (1ª parcela)."
          unit="BRL"
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <HorizontalRankingChart
            title="Valor de Acordos por Portfólio"
            data={portfolioData}
            unit="BRL"
            defaultColor={COLOR_PORTFOLIO}
            empty={portfolioData.length === 0}
          />
          <HorizontalRankingChart
            title="Top 10 Agentes por 1ª Parcela"
            data={ppAgenteData}
            unit="BRL"
            defaultColor={COLOR_FIRST_INSTALLMENT}
            empty={ppAgenteData.length === 0}
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Eficiência"
          description="Volume de esforço (acionamentos/contatos) e taxas (CPC/Conversão) por unidade de negócio."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <GroupedVolumeChart
            title="Volume por Unidade de Negócio"
            data={buVolume}
            empty={buVolume.length === 0}
          />
          <BuEfficiencyChart
            title="CPC % e Conversão % por Unidade de Negócio"
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
          description="Exceções reais por portfólio (qtd + valor) e taxa de exceções por agente (% sobre acordos)."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {excPortfolioZero ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-300/50 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
              <span className="font-semibold">Nenhuma exceção registrada hoje.</span>
              <span className="text-xs text-muted-foreground ml-1">(portfólios com exceções aparecerão aqui)</span>
            </div>
          ) : (
            <HorizontalRankingChart
              title="Exceções por Portfólio (Qtd)"
              data={excPortfolioData}
              unit="count"
              defaultColor={COLOR_EXCEPTION}
              empty={excPortfolioData.length === 0}
            />
          )}
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
