/**
 * Per-page ViewModel contracts.
 *
 * Each ViewModel is the fully-derived data shape a page renders.
 * Pages consume only these types — never raw API rows directly.
 */

import type { HomeKpiPrimary, HomeKpiSecondary } from "@/components/executive/HomeKpiStrip";
import type { HandoffFinanceiroDatum } from "@/components/executive/HandoffFinanceiroGroupedBar";
import type { HandoffEficienciaDatum } from "@/components/executive/HandoffEficienciaGroupedBar";
import type { BarDatum } from "@/selectors/homeSelectors";

// ── Home (Index.tsx) ────────────────────────────────────────────

export interface HomeViewModel {
  loading: boolean;
  error: string | null;
  warnings: string[];
  refresh: () => Promise<void>;
  kpiPrimary: HomeKpiPrimary[];
  kpiSecondary: HomeKpiSecondary[];
  insight:
    | { variant: "critical"; metric?: { value: string; label: string }; description: string; cta?: { label: string } }
    | { variant: "positive"; metric?: { value: string; label: string }; description: string; cta?: { label: string } }
    | { variant: "neutral" };
  financeiroData: HandoffFinanceiroDatum[];
  eficienciaData: HandoffEficienciaDatum[];
  cpcAvg: number;
  convAvg: number;
  top10PrimeiraParcela: BarDatum[];
  portfolio1aParcela: BarDatum[];
  excecoesPorPortfolio: BarDatum[];
  rejeitadosPorPortfolio: BarDatum[];
  loadingPpAgente: boolean;
  loadingAcdPort: boolean;
  loadingExcPort: boolean;
  loadingRejPort: boolean;
}
