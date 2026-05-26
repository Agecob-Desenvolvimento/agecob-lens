/**
 * Shared types and mock data for ImprovedScatterPlot and RegressionView.
 *
 * ScatterPoint carries all raw predictor fields so the RegressionView can
 * build multiple models (simple, polynomial, log-log, volume, full) from
 * the same dataset.
 */
export interface ScatterPoint {
  id: string;
  nome: string;
  /** Composite efficiency = sqrt(CPC% × Conv%) / 100  (0–1) */
  eficiencia: number;
  /** Agreement value (BRL) — the regression target */
  valor: number;
  /** Exception % */
  excPct: number;
  /** Number of agreements */
  acordos: number;
  // ── Raw predictors for multi-variable regression ──
  /** Number of triggers/attempts */
  acionamentos: number;
  /** Number of contacts made */
  contatos: number;
  /** CPC % (qtd_contatos / qtd_acionamentos × 100) */
  cpc: number;
  /** Conversion % (qtd_acordos / qtd_acionamentos × 100) */
  conversao: number;
}

export const MOCK_REGRESSION_POINTS: ScatterPoint[] = [
  { id: "a1", nome: "Ana Souza", eficiencia: 0.45, valor: 120_000, excPct: 3.2, acordos: 18, acionamentos: 420, contatos: 380, cpc: 90.5, conversao: 4.3 },
  { id: "a2", nome: "Bruno Lima", eficiencia: 0.62, valor: 180_000, excPct: 8.1, acordos: 26, acionamentos: 510, contatos: 460, cpc: 90.2, conversao: 5.1 },
  { id: "a3", nome: "Carla Reis", eficiencia: 0.31, valor: 60_000, excPct: 17.5, acordos: 9, acionamentos: 380, contatos: 310, cpc: 81.6, conversao: 2.4 },
  { id: "a4", nome: "Diego Alves", eficiencia: 0.78, valor: 240_000, excPct: 4.4, acordos: 33, acionamentos: 680, contatos: 630, cpc: 92.6, conversao: 4.9 },
  { id: "a5", nome: "Eva Castro", eficiencia: 0.55, valor: 150_000, excPct: 11.0, acordos: 21, acionamentos: 550, contatos: 490, cpc: 89.1, conversao: 3.8 },
  { id: "a6", nome: "Felipe Rocha", eficiencia: 0.40, valor: 80_000, excPct: 22.0, acordos: 12, acionamentos: 310, contatos: 260, cpc: 83.9, conversao: 3.9 },
  { id: "a7", nome: "Gabriela Pinto", eficiencia: 0.70, valor: 210_000, excPct: 6.0, acordos: 28, acionamentos: 590, contatos: 540, cpc: 91.5, conversao: 4.7 },
  { id: "a8", nome: "Heitor Vaz", eficiencia: 0.50, valor: 100_000, excPct: 9.5, acordos: 16, acionamentos: 400, contatos: 350, cpc: 87.5, conversao: 4.0 },
];
