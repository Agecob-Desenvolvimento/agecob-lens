export type MetricUnit = "BRL" | "%" | "count";

export type InsightSeverity = "positive" | "warning" | "critical";

export interface ExecutiveKpi {
  label: string;
  value: number;
  unit: MetricUnit;
  formula?: string;
  priority: "primary" | "secondary";
  trend?: "up" | "down" | "stable";
  hint?: string;
}

export interface InsightSlot {
  text: string;
  severity: InsightSeverity;
  headline?: string;
}

export interface ActionSlot {
  text: string;
  severity: "action";
  headline?: string;
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
