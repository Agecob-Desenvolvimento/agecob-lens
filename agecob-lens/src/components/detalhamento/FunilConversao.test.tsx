import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FunilConversao } from "./FunilConversao";
import { MOCK_FUNIL } from "./diagnosticoMocks";

describe("FunilConversao", () => {
  it("renders the 5 funnel stages", () => {
    render(<FunilConversao data={MOCK_FUNIL} />);
    expect(screen.getByTestId("funil-step-Acionamentos")).toBeInTheDocument();
    expect(screen.getByTestId("funil-step-Contato")).toBeInTheDocument();
    expect(screen.getByTestId("funil-step-CPC")).toBeInTheDocument();
    expect(screen.getByTestId("funil-step-Acordos")).toBeInTheDocument();
    expect(screen.getByTestId("funil-step-1ª Parcela")).toBeInTheDocument();
  });

  it("shows CPC-rate percentage on the CPC stage", () => {
    render(<FunilConversao data={MOCK_FUNIL} />);
    // taxa CPC = contatos(RPC) / alo = 13939 / 20000 = 69.7%
    expect(screen.getByText(/Taxa CPC: 69,7%|Taxa CPC: 69\.7%/)).toBeInTheDocument();
  });
});
