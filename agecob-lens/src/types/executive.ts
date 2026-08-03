export type MetricUnit = "BRL" | "%" | "count";

export type InsightSeverity = "positive" | "warning" | "critical";

export interface KpiDelta {
  value: number;
  direction: "up" | "down" | "flat";
  baselineLabel: string;
  inverted?: boolean;
}

export interface ExecutiveKpi {
  label: string;
  value: number;
  unit: MetricUnit;
  formula?: string;
  priority: "primary" | "secondary";
  trend?: "up" | "down" | "stable";
  hint?: string;
  delta?: KpiDelta;
}

export interface InsightSlot {
  text: string;
  severity: InsightSeverity;
  headline?: string;
  /** Nome curto do indicador (ex.: "Conversão"), usado quando 2 slots dividem 1 card. */
  label?: string;
}

export interface ActionSlot {
  text: string;
  severity: "action";
  headline?: string;
  /** DOM id of the section this action should scroll to, when applicable. */
  anchor?: string;
}

export interface InsightEngineOutput {
  insight1: InsightSlot | null;
  insight2: InsightSlot | null;
  action: ActionSlot | null;
  empty: boolean;
}

export interface RankingRow {
  rank: number;
  label: string;
  primaryValue: number;
  primaryUnit: MetricUnit;
  secondaryValue?: number;
  secondaryUnit?: MetricUnit;
}
