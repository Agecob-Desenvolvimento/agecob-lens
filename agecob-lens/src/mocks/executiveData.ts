/**
 * Mock layer for executive routes.
 *
 * Two kinds of mocks live here:
 *   1. Shape-mirroring mocks of real contracts (ApiEnvelope<ProdutividadeRow>, …).
 *      Used as offline-dev fallback by useExecutiveData when both
 *      import.meta.env.DEV and VITE_USE_MOCKS === "true".
 *   2. Simulated mocks for endpoints that DO NOT EXIST in the backend yet
 *      (the 4 items deferred from Onda C → Onda D). These always carry
 *      isSimulated:true and emit console.warn on first read so the gap is
 *      surfaced in the backlog.
 *
 * Real contracts: see agecob-lens/docs/api-contract.md.
 */

import type {
  ApiEnvelope,
  ProdutividadeRow,
  PrimeiraParcelaDiaRow,
  AcordosPorPortfolioRow,
  ExcecoesPorPortfolioRow,
} from "@/services/api";

type SimulatedPayload<T> = {
  isSimulated: true;
  endpointMissing: string;
  data: T;
};

const warned = new Set<string>();
function warnOnce(key: string, msg: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[executiveData mock] ${msg}`);
}

const NOW_ISO = "2026-05-22T08:00:00";

function envelope<T>(rows: T[], source: string, date = "2026-05-22"): ApiEnvelope<T> {
  return {
    meta: {
      generated_at: NOW_ISO,
      total_rows: rows.length,
      sources: [source],
      filters: { date },
    },
    data: rows,
    errors: [],
  };
}

// ─────────────────────────────────────────────────────────────────
// 1. Real-contract mirrors (shape EXACT match com api.ts)
// ─────────────────────────────────────────────────────────────────

const PROD_ROWS_AUTOS: ProdutividadeRow[] = [
  {
    CHAVE: "AGENT001",
    NOME: "Ana Silva",
    qtd_acionamentos: 412,
    qtd_contatos: 158,
    cpc_percentual: 38.3,
    qtd_acordos: 41,
    acordos_percentual: 9.95,
    valor_acordos: 187_540.55,
    acordo_medio: 4_574.16,
    parcelamento_medio: 3.2,
    desconto_medio_percentual: 12.4,
    valor_primeira_parcela: 31_240.10,
    qtd_excecoes: 3,
    valor_excecoes: 9_120.00,
    valor_primeira_parcela_excecoes: 1_521.00,
  },
  {
    CHAVE: "AGENT002",
    NOME: "Bruno Costa",
    qtd_acionamentos: 388,
    qtd_contatos: 121,
    cpc_percentual: 31.2,
    qtd_acordos: 33,
    acordos_percentual: 8.5,
    valor_acordos: 142_310.00,
    acordo_medio: 4_312.42,
    parcelamento_medio: 2.8,
    desconto_medio_percentual: 10.1,
    valor_primeira_parcela: 24_018.20,
    qtd_excecoes: 5,
    valor_excecoes: 15_840.00,
    valor_primeira_parcela_excecoes: 2_640.00,
  },
  {
    CHAVE: "AGENT003",
    NOME: "Carla Mendes",
    qtd_acionamentos: 245,
    qtd_contatos: 92,
    cpc_percentual: 37.5,
    qtd_acordos: 22,
    acordos_percentual: 8.97,
    valor_acordos: 98_540.30,
    acordo_medio: 4_479.10,
    parcelamento_medio: 3.5,
    desconto_medio_percentual: 14.0,
    valor_primeira_parcela: 16_423.40,
    qtd_excecoes: 1,
    valor_excecoes: 3_120.00,
    valor_primeira_parcela_excecoes: 520.00,
  },
];

const PROD_ROWS_CONSUMER: ProdutividadeRow[] = [
  {
    CHAVE: "AGENT101",
    NOME: "Diego Pires",
    qtd_acionamentos: 502,
    qtd_contatos: 215,
    cpc_percentual: 42.8,
    qtd_acordos: 55,
    acordos_percentual: 10.96,
    valor_acordos: 218_900.40,
    acordo_medio: 3_980.01,
    parcelamento_medio: 4.1,
    desconto_medio_percentual: 15.5,
    valor_primeira_parcela: 36_483.40,
    qtd_excecoes: 6,
    valor_excecoes: 21_400.00,
    valor_primeira_parcela_excecoes: 3_566.67,
  },
  {
    CHAVE: "AGENT102",
    NOME: "Elisa Rocha",
    qtd_acionamentos: 391,
    qtd_contatos: 134,
    cpc_percentual: 34.3,
    qtd_acordos: 38,
    acordos_percentual: 9.72,
    valor_acordos: 165_220.00,
    acordo_medio: 4_348.94,
    parcelamento_medio: 3.7,
    desconto_medio_percentual: 11.8,
    valor_primeira_parcela: 27_536.66,
    qtd_excecoes: 2,
    valor_excecoes: 7_410.00,
    valor_primeira_parcela_excecoes: 1_235.00,
  },
];

export function mockProdutividade(
  db: "COBwebRCBAUTOS" | "COBwebRCBCONSUMER",
): ApiEnvelope<ProdutividadeRow> {
  return envelope(
    db === "COBwebRCBAUTOS" ? PROD_ROWS_AUTOS : PROD_ROWS_CONSUMER,
    db,
  );
}

export function mockPrimeiraParcelaDia(
  db: string,
): ApiEnvelope<PrimeiraParcelaDiaRow> {
  return envelope(
    [{ total_valor: 135_701.76, total_acordos: 189 }],
    db,
  );
}

export function mockAcordosPorPortfolio(
  db: string,
): ApiEnvelope<AcordosPorPortfolioRow> {
  return envelope(
    [
      { portfolio_name: "BMG", qtd_acordos: 62, valor_acordos: 312_410.00 },
      { portfolio_name: "ITAÚ", qtd_acordos: 41, valor_acordos: 198_540.30 },
      { portfolio_name: "BRADESCO", qtd_acordos: 38, valor_acordos: 156_700.10 },
      { portfolio_name: "SANTANDER", qtd_acordos: 27, valor_acordos: 98_120.40 },
    ],
    db,
  );
}

export function mockExcecoesPorPortfolio(
  db: string,
): ApiEnvelope<ExcecoesPorPortfolioRow> {
  return envelope(
    [
      { portfolio_name: "BMG", qtd_excecoes: 4, valor_excecoes: 18_400.00 },
      { portfolio_name: "ITAÚ", qtd_excecoes: 2, valor_excecoes: 7_120.00 },
      { portfolio_name: "BRADESCO", qtd_excecoes: 3, valor_excecoes: 11_240.10 },
    ],
    db,
  );
}

// ─────────────────────────────────────────────────────────────────
// 2. Simulated payloads — endpoints faltando no backend (Onda D defer)
// ─────────────────────────────────────────────────────────────────

export interface CpcSeriePoint {
  date: string;
  cpc: number;
  baseline_mean: number;
  baseline_lower: number;
  baseline_upper: number;
}

/**
 * Análise — anomalia CPC vs banda confiança (dia anterior + N dias).
 * Gap backend: endpoint /dashboard/serie-cpc-diaria/{db}?days=14
 */
export function mockCpcAnomaliaBanda(): SimulatedPayload<CpcSeriePoint[]> {
  warnOnce(
    "cpc-anomalia-banda",
    "CPC anomaly band uses simulated data. Missing endpoint: /dashboard/serie-cpc-diaria/{db}?days=14",
  );
  return {
    isSimulated: true,
    endpointMissing: "/dashboard/serie-cpc-diaria/{db}?days=14",
    data: Array.from({ length: 14 }, (_, i) => {
      const day = new Date("2026-05-09");
      day.setDate(day.getDate() + i);
      const baseline = 35;
      const cpc = baseline + (Math.sin(i / 2) * 5) + (i === 13 ? -9 : 0);
      return {
        date: day.toISOString().slice(0, 10),
        cpc: Number(cpc.toFixed(2)),
        baseline_mean: baseline,
        baseline_lower: baseline - 6,
        baseline_upper: baseline + 6,
      };
    }),
  };
}

export interface CpcConvDualPoint {
  date: string;
  cpc_pct: number;
  conversao_pct: number;
}

/**
 * Análise — evolução temporal CPC/Conv dual-axis.
 * Gap backend: endpoint /dashboard/serie-cpc-conversao/{db}?days=N
 */
export function mockCpcConvDualAxis(): SimulatedPayload<CpcConvDualPoint[]> {
  warnOnce(
    "cpc-conv-dual",
    "CPC/Conv dual-axis series uses simulated data. Missing endpoint: /dashboard/serie-cpc-conversao/{db}",
  );
  return {
    isSimulated: true,
    endpointMissing: "/dashboard/serie-cpc-conversao/{db}",
    data: Array.from({ length: 14 }, (_, i) => {
      const day = new Date("2026-05-09");
      day.setDate(day.getDate() + i);
      return {
        date: day.toISOString().slice(0, 10),
        cpc_pct: 35 + Math.sin(i / 2) * 5,
        conversao_pct: 9 + Math.cos(i / 3) * 1.5,
      };
    }),
  };
}

export interface AgentDailyPoint {
  date: string;
  valor_acordos: number;
  qtd_acordos: number;
  cpc_pct: number;
  conversao_pct: number;
}

/**
 * Detalhamento — evolução diária por agente (4 séries).
 * Gap backend: endpoint /dashboard/serie-agente-diaria/{db}?agente=X&days=N
 */
export function mockAgentDailySeries(
  agente: string,
): SimulatedPayload<AgentDailyPoint[]> {
  warnOnce(
    `agent-daily-${agente}`,
    `Agent daily series uses simulated data (agente=${agente}). Missing endpoint: /dashboard/serie-agente-diaria/{db}?agente=...`,
  );
  return {
    isSimulated: true,
    endpointMissing: "/dashboard/serie-agente-diaria/{db}?agente=X",
    data: Array.from({ length: 14 }, (_, i) => {
      const day = new Date("2026-05-09");
      day.setDate(day.getDate() + i);
      return {
        date: day.toISOString().slice(0, 10),
        valor_acordos: 4500 + Math.sin(i / 2) * 1500,
        qtd_acordos: Math.round(2 + Math.sin(i / 3) * 1.5),
        cpc_pct: 35 + Math.sin(i / 2) * 5,
        conversao_pct: 9 + Math.cos(i / 3) * 1.5,
      };
    }),
  };
}

export interface AbOverlayPoint {
  date: string;
  a_valor: number;
  b_valor: number;
  a_cpc: number;
  b_cpc: number;
}

/**
 * Comparação — evolução temporal sobreposta A vs B.
 * Gap backend: mesmo endpoint /dashboard/serie-agente-diaria, executado p/ A e B.
 */
export function mockAbOverlay(
  agenteA: string,
  agenteB: string,
): SimulatedPayload<AbOverlayPoint[]> {
  warnOnce(
    `ab-overlay-${agenteA}-${agenteB}`,
    `A vs B overlay uses simulated data (A=${agenteA}, B=${agenteB}). Missing endpoint: /dashboard/serie-agente-diaria/{db}?agente=...`,
  );
  return {
    isSimulated: true,
    endpointMissing: "/dashboard/serie-agente-diaria/{db}?agente=X",
    data: Array.from({ length: 14 }, (_, i) => {
      const day = new Date("2026-05-09");
      day.setDate(day.getDate() + i);
      return {
        date: day.toISOString().slice(0, 10),
        a_valor: 4500 + Math.sin(i / 2) * 1500,
        b_valor: 4200 + Math.cos(i / 2) * 1200,
        a_cpc: 35 + Math.sin(i / 2) * 5,
        b_cpc: 32 + Math.cos(i / 3) * 4,
      };
    }),
  };
}
