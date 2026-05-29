import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FunilConversao } from "./FunilConversao";
import { MOCK_FUNIL } from "./diagnosticoMocks";

describe("FunilConversao", () => {
  it("renders the 4 funnel stages", () => {
    render(<FunilConversao data={MOCK_FUNIL} />);
    expect(screen.getByTestId("funil-step-Acionamentos")).toBeInTheDocument();
    expect(screen.getByTestId("funil-step-Contatos")).toBeInTheDocument();
    expect(screen.getByTestId("funil-step-Acordos")).toBeInTheDocument();
    expect(screen.getByTestId("funil-step-1ª Parcela")).toBeInTheDocument();
  });

  it("shows contact-rate percentage on the Contatos stage", () => {
    render(<FunilConversao data={MOCK_FUNIL} />);
    // taxa de contato = 13939 / 31967 = 43.6%
    expect(screen.getByText(/Taxa contato: 43,6%|Taxa contato: 43\.6%/)).toBeInTheDocument();
  });
});
