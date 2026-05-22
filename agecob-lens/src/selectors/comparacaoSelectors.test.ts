import { describe, expect, it } from "vitest";
import {
  selectAgentRow,
  selectComparacaoTotals,
  selectRadarDimensions,
  selectTopByValorAgentName,
} from "./comparacaoSelectors";
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
  row({ NOME: "Ana", source: "COBwebRCBAUTOS", qtd_acionamentos: 20, qtd_contatos: 10, qtd_acordos: 5, valor_acordos: 5000 }),
  row({ NOME: "Bruno", source: "COBwebRCBAUTOS", qtd_acionamentos: 10, qtd_contatos: 8, qtd_acordos: 2, valor_acordos: 2000 }),
  row({ NOME: "Carla", source: "COBwebRCBCONSUMER", qtd_acionamentos: 40, qtd_contatos: 30, qtd_acordos: 8, valor_acordos: 8000 }),
];

describe("selectAgentRow", () => {
  it("returns matching row by trimmed name", () => {
    expect(selectAgentRow(rows, "Ana")?.valor_acordos).toBe(5000);
  });

  it("returns null when agente empty", () => {
    expect(selectAgentRow(rows, "")).toBeNull();
  });

  it("returns null when agente missing", () => {
    expect(selectAgentRow(rows, "Zed")).toBeNull();
  });
});

describe("selectComparacaoTotals", () => {
  it("aggregates totals for a single agent", () => {
    const out = selectComparacaoTotals(rows, "Ana");
    expect(out).not.toBeNull();
    expect(out!.valor_acordos).toBe(5000);
    expect(out!.qtd_acordos).toBe(5);
  });

  it("returns null when agente empty", () => {
    expect(selectComparacaoTotals(rows, "")).toBeNull();
  });

  it("returns null when agente not found", () => {
    expect(selectComparacaoTotals(rows, "Zed")).toBeNull();
  });
});

describe("selectTopByValorAgentName", () => {
  it("returns the top agent name by valor", () => {
    expect(selectTopByValorAgentName(rows, 0)).toBe("Carla");
    expect(selectTopByValorAgentName(rows, 1)).toBe("Ana");
  });

  it("excludes zero valor rows", () => {
    const data = [row({ NOME: "Z", source: "COBwebRCBAUTOS" })];
    expect(selectTopByValorAgentName(data, 0)).toBeNull();
  });

  it("returns null when index out of range", () => {
    expect(selectTopByValorAgentName(rows, 99)).toBeNull();
  });
});

describe("selectRadarDimensions", () => {
  it("returns empty array when either side empty", () => {
    expect(selectRadarDimensions([rows[0]], [], rows)).toEqual([]);
    expect(selectRadarDimensions([], [rows[0]], rows)).toEqual([]);
  });

  it("returns 5 dimensions in fixed order", () => {
    const out = selectRadarDimensions([rows[0]], [rows[1]], rows);
    expect(out).toHaveLength(5);
    expect(out.map((p) => p.dim)).toEqual(["Valor", "Qtd", "CPC", "Conversão", "Ticket"]);
  });

  it("normalizes to 0..100 using team max", () => {
    const out = selectRadarDimensions([rows[0]], [rows[1]], rows);
    const valor = out.find((p) => p.dim === "Valor")!;
    // Carla has maxValor 8000; Ana 5000 → 63; Bruno 2000 → 25
    expect(valor.agentA).toBe(63);
    expect(valor.agentB).toBe(25);
    expect(valor.rawA).toBe(5000);
    expect(valor.rawB).toBe(2000);
    expect(valor.unit).toBe("BRL");
  });

  it("carries raw values and unit per dimension", () => {
    const out = selectRadarDimensions([rows[0]], [rows[1]], rows);
    const cpc = out.find((p) => p.dim === "CPC")!;
    expect(cpc.unit).toBe("%");
    // Ana CPC = 10/20*100 = 50; Bruno = 8/10*100 = 80
    expect(cpc.rawA).toBeCloseTo(50, 5);
    expect(cpc.rawB).toBeCloseTo(80, 5);
  });
});
