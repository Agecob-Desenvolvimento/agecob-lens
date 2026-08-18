import { describe, expect, it } from "vitest";
import {
  deriveAcordosPorPortfolio,
  deriveExcecoesPorPortfolio,
  derivePrimeiraParcelaPorPortfolio,
  deriveQuebradosPorPortfolio,
  deriveRejeitadosPorPortfolio,
} from "@/lib/portfolioRollup";
import type { PortfolioRollupRow } from "@/services/api";

// Um portfólio com uma linha por status do universo do rollup (1,2,3,5,7,10,12).
// valor = status * 100 para que cada slice tenha uma soma inconfundível.
const rows: PortfolioRollupRow[] = [1, 2, 3, 5, 7, 10, 12].map((s) => ({
  portfolio_name: "Carteira A",
  id_rec_status: s,
  qtd: 1,
  valor: s * 100,
}));

describe("portfolioRollup — slices de status", () => {
  it("acordos = STATUS_GERADOS (1,2,3,10,12), inclui QUEBRA e QUEBRA AUTOMÁTICA", () => {
    const [row] = deriveAcordosPorPortfolio(rows);
    expect(row.portfolio_name).toBe("Carteira A");
    expect(row.qtd_acordos).toBe(5);
    expect(row.valor_acordos).toBe(100 + 200 + 300 + 1000 + 1200);
  });

  it("1ª parcela usa o mesmo slice de gerados que acordos", () => {
    const [row] = derivePrimeiraParcelaPorPortfolio(rows);
    expect(row.qtd_acordos).toBe(5);
    expect(row.valor_primeira_parcela).toBe(2800);
  });

  it("exceções = status 5 (PENDENTE no enum, 'Exceção' no negócio)", () => {
    expect(deriveExcecoesPorPortfolio(rows)).toEqual([
      { portfolio_name: "Carteira A", qtd_excecoes: 1, valor_excecoes: 500 },
    ]);
  });

  it("rejeitados = status 7", () => {
    expect(deriveRejeitadosPorPortfolio(rows)).toEqual([
      { portfolio_name: "Carteira A", qtd_rejeitados: 1, valor_rejeitados: 700 },
    ]);
  });

  it("quebrados = status 2, que também conta em acordos (baldes distintos)", () => {
    expect(deriveQuebradosPorPortfolio(rows)).toEqual([
      { portfolio_name: "Carteira A", qtd_quebrados: 1, valor_quebrados: 200 },
    ]);
  });

  it("soma por portfólio e ignora status fora do slice", () => {
    const multi: PortfolioRollupRow[] = [
      { portfolio_name: "A", id_rec_status: 1, qtd: 2, valor: 10 },
      { portfolio_name: "A", id_rec_status: 12, qtd: 3, valor: 5 },
      { portfolio_name: "B", id_rec_status: 7, qtd: 9, valor: 99 },
    ];
    expect(deriveAcordosPorPortfolio(multi)).toEqual([
      { portfolio_name: "A", qtd_acordos: 5, valor_acordos: 15 },
    ]);
  });

  it("payload vazio devolve lista vazia, não linha zerada", () => {
    expect(deriveAcordosPorPortfolio([])).toEqual([]);
    expect(deriveExcecoesPorPortfolio([])).toEqual([]);
  });
});
