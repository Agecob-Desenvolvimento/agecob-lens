import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HandoffPortfolio1aParcela } from "./HandoffPortfolio1aParcela";

const rows = [
  { label: "Santander Financeira", value: 1611575.51 },
  { label: "Itau Consumer", value: 320347.39 },
  { label: "Bradesco", value: 50123.45 },
];

describe("HandoffPortfolio1aParcela", () => {
  it("renders one row per item with label and BRL value", () => {
    render(<HandoffPortfolio1aParcela rows={rows} />);
    expect(screen.getAllByTestId("portfolio-row")).toHaveLength(3);
    expect(screen.getByText("Santander Financeira")).toBeInTheDocument();
    expect(screen.getByText("Itau Consumer")).toBeInTheDocument();
    // 1.611.575,51 → compact "R$ 1,61 mi"
    expect(screen.getByText(/R\$\s*1,61\s*mi/)).toBeInTheDocument();
    // 320347.39 → compact "R$ 320 mil" (or similar)
    expect(screen.getByText(/R\$\s*320/)).toBeInTheDocument();
    // 50123.45 → full BRL (< 100k threshold)
    expect(screen.getByText(/R\$\s*50\.123,45/)).toBeInTheDocument();
  });

  it("scales the first bar to 100% width when it is the maximum", () => {
    const { container } = render(<HandoffPortfolio1aParcela rows={rows} />);
    const bars = container.querySelectorAll<HTMLDivElement>("ul li > div > div");
    expect(bars).toHaveLength(3);
    expect(bars[0].style.width).toBe("100%");
    // others < 100%
    expect(bars[1].style.width).not.toBe("100%");
  });

  it("renders empty state when rows is empty", () => {
    render(<HandoffPortfolio1aParcela rows={[]} />);
    expect(screen.getByText("Sem dados para o período.")).toBeInTheDocument();
    expect(screen.queryAllByTestId("portfolio-row")).toHaveLength(0);
  });

  it("uses the provided title", () => {
    render(<HandoffPortfolio1aParcela rows={rows} title="Custom Portfolio" />);
    expect(screen.getByText("Custom Portfolio")).toBeInTheDocument();
  });
});
