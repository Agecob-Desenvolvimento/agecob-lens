import { describe, expect, it } from "vitest";
import { mapAcordosQuebrados } from "./quebradosSelectors";
import type { QuebradoDetalheRow } from "@/services/api";

const today = new Date("2026-05-27T00:00:00");

function row(overrides: Partial<QuebradoDetalheRow> = {}): QuebradoDetalheRow {
  return {
    NR_RECEBIMENTO: 1,
    ID_CARTEIRA: 2,
    valor_primeira_parcela: 1000,
    valor_total: 1500,
    agente: "Fulano",
    cpf_mask: "123.***.***-99",
    nome_devedor: "Devedor X",
    data_acordo: "2026-05-01",
    data_vencimento: "2026-05-20",
    ...overrides,
  };
}

describe("mapAcordosQuebrados", () => {
  it("builds id from NR/ID_CARTEIRA and keeps real fields", () => {
    const [a] = mapAcordosQuebrados([row()], "Santander", today);
    expect(a.id).toBe("1/2");
    expect(a.portfolio).toBe("Santander");
    expect(a.valorAcordo).toBe(1500);
    expect(a.cpf).toBe("123.***.***-99");
  });

  it("flags unavailable structural fields as null/dash", () => {
    const [a] = mapAcordosQuebrados([row()], "P", today);
    expect(a.valorDivida).toBeNull();
    expect(a.parcelas).toBeNull();
    expect(a.dataQuebra).toBe("—");
    expect(a.mat).toBe("—");
  });

  it("estimates alto risco + previsão when >=30 days overdue", () => {
    const [a] = mapAcordosQuebrados([row({ data_vencimento: "2026-04-01" })], "P", today);
    expect(a.diasAtraso).toBeGreaterThanOrEqual(30);
    expect(a.perfilRisco).toBe("alto");
    expect(a.previsaoQuebra).toBe(true);
  });

  it("estimates baixo risco when <=7 days overdue", () => {
    const [a] = mapAcordosQuebrados([row({ data_vencimento: "2026-05-24" })], "P", today);
    expect(a.perfilRisco).toBe("baixo");
    expect(a.previsaoQuebra).toBe(false);
  });

  it("defaults to medio with no vencimento", () => {
    const [a] = mapAcordosQuebrados([row({ data_vencimento: null })], "P", today);
    expect(a.perfilRisco).toBe("medio");
    expect(a.motivo).toMatch(/Sem data de vencimento/);
  });
});
