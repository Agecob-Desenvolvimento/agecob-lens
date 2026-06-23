import { describe, expect, it } from "vitest";
import {
  TODOS_BU,
  filterByBu,
  selectBuOptions,
  selectTopByCpc,
} from "./analiseSelectors";
import type { ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";

function row(
  overrides: Partial<ProdutividadeRowWithSource> & {
    NOME: string;
    source: ProdutividadeRowWithSource["source"];
  },
): ProdutividadeRowWithSource {
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

const rows: ProdutividadeRowWithSource[] = [
  row({ NOME: "A", source: "COBwebRCBAUTOS", qtd_acionamentos: 20, qtd_alo: 20, qtd_contatos: 10, qtd_acordos: 4 }),
  row({ NOME: "B", source: "COBwebRCBAUTOS", qtd_acionamentos: 5, qtd_alo: 5, qtd_contatos: 5, qtd_acordos: 2 }),
  row({ NOME: "C", source: "COBwebRCBCONSUMER", qtd_acionamentos: 50, qtd_alo: 50, qtd_contatos: 40, qtd_acordos: 10, qtd_boletos_pagos: 10 }),
  row({ NOME: "D", source: "COBwebRCBCONSUMER", qtd_acionamentos: 0, qtd_alo: 0, qtd_contatos: 0, qtd_acordos: 0 }),
];

describe("filterByBu", () => {
  it("returns all rows for (Todos)", () => {
    expect(filterByBu(rows, TODOS_BU)).toHaveLength(4);
  });

  it("filters by source", () => {
    const autos = filterByBu(rows, "COBwebRCBAUTOS");
    expect(autos).toHaveLength(2);
    expect(autos.every((r) => r.source === "COBwebRCBAUTOS")).toBe(true);
  });

  it("returns empty array when no row matches", () => {
    expect(filterByBu(rows, "DOES_NOT_EXIST")).toHaveLength(0);
  });
});

describe("selectBuOptions", () => {
  it("returns unique sources", () => {
    expect(selectBuOptions(rows).sort()).toEqual(["COBwebRCBAUTOS", "COBwebRCBCONSUMER"]);
  });

  it("returns empty array for empty rows", () => {
    expect(selectBuOptions([])).toEqual([]);
  });
});

describe("selectTopByCpc", () => {
  it("excludes rows below minAcionamentos threshold", () => {
    const out = selectTopByCpc(rows, 10, 10);
    expect(out.map((r) => r.label)).not.toContain("B");
    expect(out.map((r) => r.label)).not.toContain("D");
  });

  it("sorts descending by CPC and maps to RankingRow", () => {
    const out = selectTopByCpc(rows, 10, 10);
    expect(out[0].label).toBe("C");
    expect(out[0].primaryValue).toBeCloseTo(80, 5);
    expect(out[0].primaryUnit).toBe("%");
    expect(out[0].secondaryValue).toBeCloseTo(25, 5);
    expect(out[0].secondaryUnit).toBe("%");
    expect(out[0].rank).toBe(1);
    expect(out[1].label).toBe("A");
    expect(out[1].primaryValue).toBeCloseTo(50, 5);
  });

  it("respects n slice limit", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      row({
        NOME: `Agent ${i}`,
        source: "COBwebRCBAUTOS",
        qtd_acionamentos: 20,
        qtd_contatos: 20 - i,
        qtd_acordos: 5,
      }),
    );
    expect(selectTopByCpc(many, 5, 10)).toHaveLength(5);
  });

  it("custom minAcionamentos lowers threshold", () => {
    const out = selectTopByCpc(rows, 10, 1);
    expect(out.map((r) => r.label)).toContain("B");
  });

  it("returns empty array when all rows below threshold", () => {
    const below = [row({ NOME: "X", source: "COBwebRCBAUTOS", qtd_acionamentos: 1 })];
    expect(selectTopByCpc(below, 10, 10)).toEqual([]);
  });
});
