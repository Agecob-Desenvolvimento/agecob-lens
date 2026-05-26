/**
 * Simulated time-series hooks for endpoints that DON'T EXIST in the backend yet.
 *
 * Every hook returns `isSimulated: true` + the endpoint name that would be
 * needed. Gate: VITE_USE_MOCKS must be "true" AND import.meta.env.DEV.
 * Remove this entire file in Phase 7 once backend exposes:
 *   - /dashboard/serie/cpc-anomalia
 *   - /dashboard/serie/cpc-conv-dual
 *   - /dashboard/serie/agent-daily
 *   - /dashboard/serie/ab-overlay
 */

import { useMemo } from "react";
import {
  mockCpcAnomaliaBanda,
  mockCpcConvDualAxis,
  mockAgentDailySeries,
  mockAbOverlay,
  type CpcSeriePoint,
  type CpcConvDualPoint,
  type AgentDailyPoint,
  type AbOverlayPoint,
} from "@/mocks/executiveData";

const MOCK_GATE =
  Boolean(import.meta.env.DEV) &&
  String(import.meta.env.VITE_USE_MOCKS ?? "").toLowerCase() === "true";

export interface SimulatedSeries<T> {
  isSimulated: true;
  endpointMissing: string;
  data: T;
}

export interface UseSimulatedSeriesResult {
  cpcAnomaliaBanda: SimulatedSeries<CpcSeriePoint[]> | undefined;
  cpcConvDual: SimulatedSeries<CpcConvDualPoint[]> | undefined;
  agentDaily: SimulatedSeries<AgentDailyPoint[]> | undefined;
  abOverlay: SimulatedSeries<AbOverlayPoint[]> | undefined;
}

/** CPC anomaly band + dual-axis CPC/Conv — for Analise page. */
export function useSimulatedAnalise(): Pick<UseSimulatedSeriesResult, "cpcAnomaliaBanda" | "cpcConvDual"> {
  return useMemo(() => {
    if (!MOCK_GATE) return { cpcAnomaliaBanda: undefined, cpcConvDual: undefined };
    return {
      cpcAnomaliaBanda: mockCpcAnomaliaBanda(),
      cpcConvDual: mockCpcConvDualAxis(),
    };
  }, []);
}

/** Agent daily series — for Detalhamento page. */
export function useSimulatedAgentDaily(agente: string): Pick<UseSimulatedSeriesResult, "agentDaily"> {
  return useMemo(() => {
    if (!MOCK_GATE) return { agentDaily: undefined };
    return { agentDaily: mockAgentDailySeries(agente) };
  }, [agente]);
}

/** A/B overlay series — for Comparacao page. */
export function useSimulatedAbOverlay(agente: string, agenteB: string): Pick<UseSimulatedSeriesResult, "abOverlay"> {
  return useMemo(() => {
    if (!MOCK_GATE) return { abOverlay: undefined };
    return { abOverlay: mockAbOverlay(agente, agenteB) };
  }, [agente, agenteB]);
}
