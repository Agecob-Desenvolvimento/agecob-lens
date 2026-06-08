/**
 * Cluster A (Phase 2) — derive the 5 legacy por-portfolio shapes from a single
 * portfolio-rollup payload, WITHOUT changing any metric definition.
 *
 * Status slices (canonical, from settings/business rules — do not alter):
 *   acordos / 1ª parcela -> (1, 2, 3, 10, 12)   exceções -> 5   rejeitados -> 7   quebrados -> 2
 *   (acordos = valores GERADOS: inclui QUEBRA=2 e QUEBRA AUTOMÁTICA=10; status 2
 *    alimenta tanto o slice acordos quanto o slice quebrados — baldes distintos.)
 *
 * `valor` is additive (parity unconditional). `qtd` for the multi-status slice
 * (1,2,3,10,12) is summed across statuses — exact iff no NR_RECEBIMENTO spans two
 * generated statuses in the same portfolio (gated by the parity harness).
 *
 * Output field names match the legacy interfaces in services/api.ts exactly, so
 * ViewModels/selectors consume the derived arrays unchanged. Ordering is NOT
 * applied here — every consumer already re-sorts client-side (parity preserved).
 */
import type {
  PortfolioRollupRow,
  AcordosPorPortfolioRow,
  PrimeiraParcelaPorPortfolioRow,
  ExcecoesPorPortfolioRow,
  RejeitadosPorPortfolioRow,
  QuebradosPorPortfolioRow,
} from "@/services/api";

const STATUS_GERADOS = [1, 2, 3, 10, 12];
const STATUS_EXCECAO = 5;
const STATUS_REJEITADO = 7;
const STATUS_QUEBRADO = 2;

interface Agg {
  qtd: number;
  valor: number;
}

/** Group rows whose status passes `keep`, summing qtd+valor per portfolio_name. */
function groupByPortfolio(
  rows: PortfolioRollupRow[],
  keep: (status: number) => boolean,
): Map<string, Agg> {
  const map = new Map<string, Agg>();
  for (const r of rows) {
    if (!keep(Number(r.id_rec_status))) continue;
    const cur = map.get(r.portfolio_name) ?? { qtd: 0, valor: 0 };
    cur.qtd += Number(r.qtd || 0);
    cur.valor += Number(r.valor || 0);
    map.set(r.portfolio_name, cur);
  }
  return map;
}

export function deriveAcordosPorPortfolio(rows: PortfolioRollupRow[]): AcordosPorPortfolioRow[] {
  const g = groupByPortfolio(rows, (s) => STATUS_GERADOS.includes(s));
  return [...g.entries()].map(([portfolio_name, a]) => ({
    portfolio_name,
    qtd_acordos: a.qtd,
    valor_acordos: a.valor,
  }));
}

export function derivePrimeiraParcelaPorPortfolio(
  rows: PortfolioRollupRow[],
): PrimeiraParcelaPorPortfolioRow[] {
  const g = groupByPortfolio(rows, (s) => STATUS_GERADOS.includes(s));
  return [...g.entries()].map(([portfolio_name, a]) => ({
    portfolio_name,
    qtd_acordos: a.qtd,
    valor_primeira_parcela: a.valor,
  }));
}

export function deriveExcecoesPorPortfolio(rows: PortfolioRollupRow[]): ExcecoesPorPortfolioRow[] {
  const g = groupByPortfolio(rows, (s) => s === STATUS_EXCECAO);
  return [...g.entries()].map(([portfolio_name, a]) => ({
    portfolio_name,
    qtd_excecoes: a.qtd,
    valor_excecoes: a.valor,
  }));
}

export function deriveRejeitadosPorPortfolio(rows: PortfolioRollupRow[]): RejeitadosPorPortfolioRow[] {
  const g = groupByPortfolio(rows, (s) => s === STATUS_REJEITADO);
  return [...g.entries()].map(([portfolio_name, a]) => ({
    portfolio_name,
    qtd_rejeitados: a.qtd,
    valor_rejeitados: a.valor,
  }));
}

export function deriveQuebradosPorPortfolio(rows: PortfolioRollupRow[]): QuebradosPorPortfolioRow[] {
  const g = groupByPortfolio(rows, (s) => s === STATUS_QUEBRADO);
  return [...g.entries()].map(([portfolio_name, a]) => ({
    portfolio_name,
    qtd_quebrados: a.qtd,
    valor_quebrados: a.valor,
  }));
}
