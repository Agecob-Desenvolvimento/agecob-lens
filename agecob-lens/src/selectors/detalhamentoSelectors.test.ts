import { describe, expect, it } from "vitest";
import {
  selectAgentNames,
  selectAgentPercentile,
  selectBuRows,
  selectTeamRanking,
} from "./detalhamentoSelectors";
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
  row({ NOME: "Carla", source: "COBwebRCBAUTOS", qtd_acionamentos: 20, qtd_contatos: 10, qtd_acordos: 4, valor_acordos: 1000 }),
  row({ NOME: "Ana", source: "COBwebRCBAUTOS", qtd_acionamentos: 15, qtd_contatos: 12, qtd_acordos: 6, valor_acordos: 3000 }),
  row({ NOME: "Bruno", source: "COBwebRCBAUTOS", qtd_acionamentos: 5, qtd_contatos: 4, qtd_acordos: 1, valor_acordos: 200 }),
  row({ NOME: "Diego", source: "COBwebRCBCONSUMER", qtd_acionamentos: 50, qtd_contatos: 40, qtd_acordos: 10, valor_acordos: 5000 }),
  row({ NOME: "  ", source: "COBwebRCBCONSUMER" }),
];

describe("selectAgentNames", () => {
  it("returns unique trimmed names sorted pt-BR", () => {
    expect(selectAgentNames(rows)).toEqual(["Ana", "Bruno", "Carla", "Diego"]);
  });

  it("filters out empty/whitespace names", () => {
    const out = selectAgentNames(rows);
    expect(out).not.toContain("");
    expect(out).not.toContain("  ");
  });

  it("returns empty array for empty input", () => {
    expect(selectAgentNames([])).toEqual([]);
  });

  it("dedupes repeated names", () => {
    const dup = [
      row({ NOME: "Ana", source: "COBwebRCBAUTOS" }),
      row({ NOME: "Ana", source: "COBwebRCBCONSUMER" }),
    ];
    expect(selectAgentNames(dup)).toEqual(["Ana"]);
  });
});

describe("selectBuRows", () => {
  it("returns rows matching BU AUTOS", () => {
    const out = selectBuRows(rows, "AUTOS");
    expect(out).toHaveLength(3);
    expect(out.every((r) => r.source === "COBwebRCBAUTOS")).toBe(true);
  });

  it("returns rows matching BU CONSUMER", () => {
    const out = selectBuRows(rows, "CONSUMER");
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.source === "COBwebRCBCONSUMER")).toBe(true);
  });

  it("returns empty array when bu is null", () => {
    expect(selectBuRows(rows, null)).toEqual([]);
  });
});

describe("selectAgentPercentile", () => {
  it("returns null when agent is Todos", () => {
    expect(selectAgentPercentile(rows, "Todos", selectBuRows(rows, "AUTOS"))).toBeNull();
  });

  it("returns null when buRows empty", () => {
    expect(selectAgentPercentile(rows, "Ana", [])).toBeNull();
  });

  it("computes valor and CPC percentiles for an agent in BU AUTOS", () => {
    const buRows = selectBuRows(rows, "AUTOS");
    const out = selectAgentPercentile(rows, "Ana", buRows);
    expect(out).not.toBeNull();
    expect(out!.totalBU).toBe(3);
    // Ana = top valor (rank 1 of 3) → round(1/3 * 100) = 33
    expect(out!.valorPct).toBe(33);
    // CPC: Ana 12/15 = 80%, Carla 10/20 = 50% (Bruno excluded, <10 acionamentos)
    // Ana rank 1 of 2 → round(1/2 * 100) = 50
    expect(out!.cpcPct).toBe(50);
  });

  it("returns null cpcPct when agent below minAcionamentos", () => {
    const buRows = selectBuRows(rows, "AUTOS");
    const out = selectAgentPercentile(rows, "Bruno", buRows);
    expect(out).not.toBeNull();
    expect(out!.cpcPct).toBeNull();
    expect(out!.valorPct).toBe(100);
  });

  it("respects custom minAcionamentos threshold", () => {
    const buRows = selectBuRows(rows, "AUTOS");
    const out = selectAgentPercentile(rows, "Bruno", buRows, 1);
    expect(out!.cpcPct).not.toBeNull();
  });
});

describe("selectTeamRanking", () => {
  it("sorts descending by valor_acordos and maps to RankingRow", () => {
    const buRows = selectBuRows(rows, "AUTOS");
    const out = selectTeamRanking(buRows);
    expect(out[0].label).toBe("Ana");
    expect(out[0].rank).toBe(1);
    expect(out[0].primaryValue).toBe(3000);
    expect(out[0].primaryUnit).toBe("BRL");
    expect(out[0].secondaryUnit).toBe("count");
    expect(out[1].label).toBe("Carla");
    expect(out[2].label).toBe("Bruno");
  });

  it("excludes rows with valor_acordos <= 0", () => {
    const buRows = selectBuRows(rows, "CONSUMER");
    const out = selectTeamRanking(buRows);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("Diego");
  });

  it("respects n slice limit", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      row({
        NOME: `Agent ${String(i).padStart(2, "0")}`,
        source: "COBwebRCBAUTOS",
        valor_acordos: 1000 - i,
        qtd_acordos: 1,
      }),
    );
    expect(selectTeamRanking(many, 5)).toHaveLength(5);
  });

  it("returns empty array when no rows have valor", () => {
    expect(selectTeamRanking([])).toEqual([]);
  });
});
