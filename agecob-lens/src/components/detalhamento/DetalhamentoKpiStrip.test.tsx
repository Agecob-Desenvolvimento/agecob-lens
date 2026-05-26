import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DetalhamentoKpiStrip, type KpiDatum } from "./DetalhamentoKpiStrip";

const primary: KpiDatum[] = [
  { id: "valor_acordos", label: "Valor Acordos", value: 1_675_038.91, unit: "BRL" },
  { id: "primeira_parcela", label: "1ª Parcela", value: 333_560.16, unit: "BRL" },
  { id: "qtd_acordos", label: "Qtd Acordos", value: 372, unit: "count" },
  { id: "ticket_medio", label: "Ticket Médio", value: 4_502.79, unit: "BRL" },
];

const secondary: KpiDatum[] = [
  { id: "cpc", label: "CPC %", value: 43.6, unit: "%" },
  { id: "conversao", label: "Conversão %", value: 1.2, unit: "%" },
  { id: "qtd_acionamentos", label: "Qtd Acionamentos", value: 31_967, unit: "count" },
  { id: "qtd_contatos", label: "Qtd Contatos", value: 13_939, unit: "count" },
  { id: "qtd_excecoes", label: "Qtd Exceções", value: 3, unit: "count" },
  { id: "excecoes_valor", label: "Exceções % (Valor)", value: 1.1, unit: "%" },
];

describe("DetalhamentoKpiStrip", () => {
  it("renders 4 primary labels and 6 secondary labels", () => {
    render(<DetalhamentoKpiStrip primary={primary} secondary={secondary} />);
    for (const k of primary) {
      expect(screen.getByText(k.label)).toBeInTheDocument();
    }
    for (const k of secondary) {
      expect(screen.getByText(k.label)).toBeInTheDocument();
    }
  });

  it("formats BRL values as full BRL", () => {
    render(<DetalhamentoKpiStrip primary={primary} secondary={[]} />);
    // formatBRLCompact(..., "full") forces full BRL (R$ 1.675.038,91)
    expect(screen.getByText(/R\$\s*1\.675\.038,91/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*4\.502,79/)).toBeInTheDocument();
  });

  it("formats % values with comma + percent", () => {
    render(<DetalhamentoKpiStrip primary={[]} secondary={secondary} />);
    expect(screen.getByText("43,6%")).toBeInTheDocument();
    expect(screen.getByText("1,2%")).toBeInTheDocument();
    expect(screen.getByText("1,1%")).toBeInTheDocument();
  });

  it("formats count values with pt-BR grouping", () => {
    render(<DetalhamentoKpiStrip primary={primary} secondary={secondary} />);
    expect(screen.getByText("372")).toBeInTheDocument();
    expect(screen.getByText("31.967")).toBeInTheDocument();
    expect(screen.getByText("13.939")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
