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

  it("shows CPC conversion percentage on the Contatos stage", () => {
    render(<FunilConversao data={MOCK_FUNIL} />);
    // CPC = 13939 / 31967 = 43.6%
    expect(screen.getByText(/CPC: 43,6%|CPC: 43\.6%/)).toBeInTheDocument();
  });
});
