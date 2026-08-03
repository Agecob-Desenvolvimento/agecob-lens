/**
 * Per-page ViewModel contracts.
 *
 * Each ViewModel is the fully-derived data shape a page renders.
 * Pages consume only these types — never raw API rows directly.
 */

import type { HomeKpiPrimary, HomeKpiSecondary } from "@/components/executive/HomeKpiStrip";
import type { HandoffFinanceiroDatum } from "@/components/executive/HandoffFinanceiroGroupedBar";
import type { HandoffEficienciaDatum } from "@/components/executive/HandoffEficienciaGroupedBar";
import type { BarDatum, FunnelDatum, QuebradoPortfolioDatum } from "@/selectors/homeSelectors";
import type { ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";
import type { PrimeiraParcelaPorPortfolioRow } from "@/services/api";

/** Risk dimensions per portfolio for the Rentabilidade & Risco chart. */
export interface PortfolioRiskEntry {
  excecoes: number;
  quebrados: number;
  rejeitados: number;
}

// ── Home (Index.tsx) ────────────────────────────────────────────

type HomeInsightCard =
  | { variant: "critical"; metric?: { value: string; label: string }; secondaryMetric?: { value: string; label: string }; description: string; cta?: { label: string; anchor?: string } }
  | { variant: "positive"; metric?: { value: string; label: string }; description: string; cta?: { label: string; anchor?: string } }
  | { variant: "neutral" };

export interface HomeViewModel {
  loading: boolean;
  error: string | null;
  warnings: string[];
  refresh: () => Promise<void>;
  kpiPrimary: HomeKpiPrimary[];
  kpiSecondary: HomeKpiSecondary[];
  /** Cash conversion index: 1ª Parcela Recebida / 1ª Parcela Emitida * 100 */
  indiceConversaoCaixa: number | null;
  insight: HomeInsightCard;
  financeiroData: HandoffFinanceiroDatum[];
  eficienciaData: HandoffEficienciaDatum[];
  funnelData: FunnelDatum[];
  cpcAvg: number;
  convAvg: number;
  /** Agent-level rows for the active filter — raw extract for the CSV report. */
  produtividadeRows: ProdutividadeRowWithSource[];
  top10PrimeiraParcela: BarDatum[];
  portfolio1aParcela: BarDatum[];
  excecoesPorPortfolio: BarDatum[];
  rejeitadosPorPortfolio: BarDatum[];
  excecoesPorPortfolioValor: BarDatum[];
  rejeitadosPorPortfolioValor: BarDatum[];
  quebradosPorPortfolio: QuebradoPortfolioDatum[];
  loadingPpAgente: boolean;
  loadingAcdPort: boolean;
  loadingExcPort: boolean;
  loadingRejPort: boolean;
  loadingQbrPort: boolean;
  ppPortfolioRows: PrimeiraParcelaPorPortfolioRow[];
  portfolioRiskMap: Map<string, PortfolioRiskEntry>;
  loadingPpPortfolio: boolean;
  benchByBu: Map<string, { cpc: number | null; conversao: number | null }>;
}