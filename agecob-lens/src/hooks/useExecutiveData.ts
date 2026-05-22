/**
 * Single orchestrator hook for the executive dashboard routes.
 *
 * Routes (queryKey roots):
 *   - "home"          → Index.tsx
 *   - "analise"       → AnaliseProdutividade.tsx
 *   - "detalhamento"  → DetalhamentoAgentes.tsx
 *   - "comparacao"    → ComparacaoAgentes.tsx
 *
 * Provides the data each route needs as a common shape:
 *   { rows, simulated, loading, error, warnings, refresh }
 *
 * Real-data sources reuse existing endpoints from @/services/api (no contract
 * change). When VITE_USE_MOCKS === "true" AND import.meta.env.DEV, the hook
 * skips network calls and returns mock-mirrored envelopes.
 *
 * `simulated` carries the 4 deferred Onda C items (anomaly band, dual-axis,
 * agent daily, A/B overlay) — always marked isSimulated: true with a
 * console.warn on first read, regardless of mock gate, because no real
 * endpoint exists yet.
 */

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  type DatabaseOption,
  fetchProdutividade,
  type ProdutividadeRow,
} from "@/services/api";
import {
  mockProdutividade,
  mockCpcAnomaliaBanda,
  mockCpcConvDualAxis,
  mockAgentDailySeries,
  mockAbOverlay,
  type CpcSeriePoint,
  type CpcConvDualPoint,
  type AgentDailyPoint,
  type AbOverlayPoint,
} from "@/mocks/executiveData";

export type ExecutiveRoute = "home" | "analise" | "detalhamento" | "comparacao";

export interface ExecutiveRowWithSource extends ProdutividadeRow {
  source: Exclude<DatabaseOption, "todos">;
}

export interface SimulatedSeries<T> {
  isSimulated: true;
  endpointMissing: string;
  data: T;
}

export interface UseExecutiveDataParams {
  route: ExecutiveRoute;
  db: DatabaseOption;
  dateFrom?: string;
  dateTo?: string;
  assessoria?: string;
  /** Detalhamento + Comparação consumers */
  agente?: string;
  agenteB?: string;
}

export interface UseExecutiveDataResult {
  rows: ExecutiveRowWithSource[];
  simulated: {
    cpcAnomaliaBanda?: SimulatedSeries<CpcSeriePoint[]>;
    cpcConvDual?: SimulatedSeries<CpcConvDualPoint[]>;
    agentDaily?: SimulatedSeries<AgentDailyPoint[]>;
    abOverlay?: SimulatedSeries<AbOverlayPoint[]>;
  };
  loading: boolean;
  error: string | null;
  warnings: string[];
  refresh: () => Promise<void>;
}

const MOCK_GATE =
  Boolean(import.meta.env.DEV) &&
  String(import.meta.env.VITE_USE_MOCKS ?? "").toLowerCase() === "true";

function dbTargets(db: DatabaseOption): Exclude<DatabaseOption, "todos">[] {
  if (db === "todos") return ["COBwebRCBAUTOS", "COBwebRCBCONSUMER"];
  return [db];
}

export function useExecutiveData(params: UseExecutiveDataParams): UseExecutiveDataResult {
  const { route, db, dateFrom = "", dateTo = "", assessoria, agente, agenteB } = params;
  const targets = useMemo(() => dbTargets(db), [db]);

  const prodQueries = useQueries({
    queries: targets.map((target) => ({
      queryKey: ["executive", route, "produtividade", target, dateFrom, dateTo, assessoria ?? ""] as const,
      queryFn: () => {
        if (MOCK_GATE) return Promise.resolve(mockProdutividade(target));
        const filters: { assessoria?: string; dateFrom?: string; dateTo?: string } = {};
        if (assessoria && assessoria !== "Todas") filters.assessoria = assessoria;
        if (dateFrom) filters.dateFrom = dateFrom;
        if (dateTo) filters.dateTo = dateTo;
        return fetchProdutividade(target, Object.keys(filters).length ? filters : undefined);
      },
    })),
  });

  const loading = prodQueries.some((q) => q.isLoading);

  const rows = useMemo<ExecutiveRowWithSource[]>(() => {
    const acc: ExecutiveRowWithSource[] = [];
    prodQueries.forEach((q, i) => {
      const source = targets[i];
      if (q.data?.data) q.data.data.forEach((row) => acc.push({ ...row, source }));
    });
    return acc;
  }, [prodQueries, targets]);

  const warnings = useMemo<string[]>(() => {
    const acc: string[] = [];
    prodQueries.forEach((q, i) => {
      if (q.isError) {
        const msg = (q.error as Error)?.message ?? "unknown error";
        acc.push(`${targets[i]}: produtividade failed (${msg})`);
      }
    });
    return acc;
  }, [prodQueries, targets]);

  const allFailed = prodQueries.length > 0 && prodQueries.every((q) => q.isError);
  const error = rows.length === 0 && allFailed ? warnings[0] ?? "No data sources" : null;

  const simulated = useMemo<UseExecutiveDataResult["simulated"]>(() => {
    if (route === "analise") {
      return {
        cpcAnomaliaBanda: mockCpcAnomaliaBanda(),
        cpcConvDual: mockCpcConvDualAxis(),
      };
    }
    if (route === "detalhamento" && agente) {
      return { agentDaily: mockAgentDailySeries(agente) };
    }
    if (route === "comparacao" && agente && agenteB) {
      return { abOverlay: mockAbOverlay(agente, agenteB) };
    }
    return {};
  }, [route, agente, agenteB]);

  const refresh = async () => {
    await Promise.all(prodQueries.map((q) => q.refetch()));
  };

  return { rows, simulated, loading, error, warnings, refresh };
}
