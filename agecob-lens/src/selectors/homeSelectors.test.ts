import { describe, expect, it } from "vitest";
import {
  selectBuEfficiencyData,
  selectBuValueData,
  selectTopAgentesPorPrimeiraParcela,
  selectTopByValor,
  selectTopPortfolioPorExcecoes,
  selectTopPortfolioPorRejeitados,
  selectTopPortfolioPorValor,
} from "./homeSelectors";
import type { ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";

function row(overrides: Partial<ProdutividadeRowWithSource> & { NOME: string; source: ProdutividadeRowWithSource["source"] }): ProdutividadeRowWithSource {
  return {
    CHAVE: overrides.NOME,
    NOME: overrides.NOME,
    qtd_acionamentos: 0,
    qtd_contatos: 0,
    cpc_percentual: 0,
    qtd_acordos: 0,
    acordos_percentual: 0,
    valor_acordos: 0,
    acordo_medio: 0,
    parcelamento_medio: 0,
    desconto_medio_percentual: 0,
    valor_primeira_parcela: 0,
    qtd_excecoes: 0,
    valor_excecoes: 0,
    valor_primeira_parcela_excecoes: 0,
    ...overrides,
  };
}

describe("selectTopByValor", () => {
  it("filters zero-value rows, sorts desc, slices to n, and maps to RankingRow", () => {
    const rows = [
      row({ NOME: "Alice Silva", source: "COBwebRCBAUTOS", valor_acordos: 1000, qtd_acordos: 2 }),
      row({ NOME: "Bob Costa", source: "COBwebRCBAUTOS", valor_acordos: 5000, qtd_acordos: 4 }),
      row({ NOME: "Carlos Dias", source: "COBwebRCBCONSUMER", valor_acordos: 0, qtd_acordos: 0 }),
      row({ NOME: "Diana Eus", source: "COBwebRCBCONSUMER", valor_acordos: 250, qtd_acordos: 1 }),
    ];
    const top = selectTopByValor(rows, 10);
    expect(top).toHaveLength(3);
    expect(top[0].rank).toBe(1);
    expect(top[0].label).toBe("Bob C.");
    expect(top[0].primaryValue).toBe(5000);
    expect(top[0].primaryUnit).toBe("BRL");
    expect(top[0].secondaryValue).toBe(4);
    expect(top[0].secondaryUnit).toBe("count");
    expect(top.map((r) => r.label)).toEqual(["Bob C.", "Alice S.", "Diana E."]);
  });

  it("respects the slice limit", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      row({ NOME: `Agent ${i}`, source: "COBwebRCBAUTOS", valor_acordos: (15 - i) * 100, qtd_acordos: 1 }),
    );
    const top = selectTopByValor(rows, 5);
    expect(top).toHaveLength(5);
    expect(top[0].primaryValue).toBe(1500);
    expect(top[4].primaryValue).toBe(1100);
  });

  it("returns an empty array when all rows are zero", () => {
    expect(selectTopByValor([row({ NOME: "X", source: "COBwebRCBAUTOS" })])).toEqual([]);
  });
});

describe("selectBuValueData / selectBuEfficiencyData", () => {
  const rows: ProdutividadeRowWithSource[] = [
    row({ NOME: "A", source: "COBwebRCBAUTOS", valor_acordos: 1000, valor_primeira_parcela: 100, qtd_acionamentos: 10, qtd_contatos: 4, qtd_acordos: 2 }),
    row({ NOME: "B", source: "COBwebRCBAUTOS", valor_acordos: 2000, valor_primeira_parcela: 200, qtd_acionamentos: 20, qtd_contatos: 8, qtd_acordos: 4 }),
    row({ NOME: "C", source: "COBwebRCBCONSUMER", valor_acordos: 5000, valor_primeira_parcela: 500, qtd_acionamentos: 50, qtd_contatos: 25, qtd_acordos: 10 }),
  ];

  it("groups by BU with AUTOS before CONSUMER", () => {
    const value = selectBuValueData(rows);
    expect(value.map((d) => d.name)).toEqual(["AUTOS", "CONSUMER"]);
    expect(value[0]).toMatchObject({ name: "AUTOS", valor_acordos: 3000, valor_primeira_parcela: 300 });
    expect(value[1]).toMatchObject({ name: "CONSUMER", valor_acordos: 5000, valor_primeira_parcela: 500 });
  });

  it("computes CPC and Conversão per BU", () => {
    const eff = selectBuEfficiencyData(rows);
    expect(eff[0].name).toBe("AUTOS");
    expect(eff[0].cpc).toBeCloseTo(40, 5); // 12/30 * 100
    expect(eff[0].conversao).toBeCloseTo(20, 5); // 6/30 * 100
    expect(eff[1].name).toBe("CONSUMER");
    expect(eff[1].cpc).toBeCloseTo(50, 5);
    expect(eff[1].conversao).toBeCloseTo(20, 5);
  });

  it("omits BUs with no rows", () => {
    const onlyAutos = rows.filter((r) => r.source === "COBwebRCBAUTOS");
    expect(selectBuValueData(onlyAutos).map((d) => d.name)).toEqual(["AUTOS"]);
  });
});

describe("selectTopAgentesPorPrimeiraParcela", () => {
  it("sorts desc by valor and shortens agent name", () => {
    const out = selectTopAgentesPorPrimeiraParcela(
      [
        { agente: "Joao Silva", qtd_acordos_primeira_parcela: 2, valor_primeira_parcela: 300 },
        { agente: "Maria Souza", qtd_acordos_primeira_parcela: 5, valor_primeira_parcela: 900 },
      ],
      10,
    );
    expect(out[0].label).toBe("Maria S.");
    expect(out[0].value).toBe(900);
    expect(out[1].value).toBe(300);
  });
});

describe("portfolio selectors", () => {
  it("selectTopPortfolioPorValor sorts desc by valor_acordos", () => {
    const out = selectTopPortfolioPorValor(
      [
        { portfolio_name: "P1", qtd_acordos: 1, valor_acordos: 100 },
        { portfolio_name: "P2", qtd_acordos: 2, valor_acordos: 500 },
      ],
      10,
    );
    expect(out.map((r) => r.label)).toEqual(["P2", "P1"]);
  });

  it("selectTopPortfolioPorExcecoes filters zero qtd and sorts desc", () => {
    const out = selectTopPortfolioPorExcecoes(
      [
        { portfolio_name: "X", qtd_excecoes: 0, valor_excecoes: 0 },
        { portfolio_name: "Y", qtd_excecoes: 5, valor_excecoes: 100 },
        { portfolio_name: "Z", qtd_excecoes: 3, valor_excecoes: 50 },
      ],
      10,
    );
    expect(out.map((r) => r.label)).toEqual(["Y", "Z"]);
  });

  it("selectTopPortfolioPorRejeitados filters zero qtd and sorts desc", () => {
    const out = selectTopPortfolioPorRejeitados(
      [
        { portfolio_name: "X", qtd_rejeitados: 0, valor_rejeitados: 0 },
        { portfolio_name: "Y", qtd_rejeitados: 7, valor_rejeitados: 200 },
      ],
      10,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ label: "Y", value: 7 });
  });
});
