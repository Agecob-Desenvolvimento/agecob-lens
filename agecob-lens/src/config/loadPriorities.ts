export type LoadPriority = "high" | "normal" | "low";

export const ROUTE_LOAD_PRIORITY = {
  "/": {
    shell: "high",
    kpis: "high",
    productivityCards: "normal",
    charts: "low",
  },
  "/comparacao-agentes": {
    shell: "high",
    filters: "high",
    dashboard: "normal",
    charts: "low",
  },
  "/detalhamento-agentes": {
    shell: "high",
    filters: "high",
    table: "normal",
    charts: "low",
  },
  "/analise-produtividade": {
    shell: "high",
    filters: "high",
    kpis: "normal",
    charts: "low",
  },
} as const satisfies Record<string, Record<string, LoadPriority>>;
