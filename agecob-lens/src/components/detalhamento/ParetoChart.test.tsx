import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ParetoChart } from "./ParetoChart";
import { MOCK_PARETO_POINTS } from "./acaoMocks";

describe("ParetoChart", () => {
  it("renders one bar per point", () => {
    render(<ParetoChart points={MOCK_PARETO_POINTS} />);
    expect(screen.getAllByTestId("pareto-bar")).toHaveLength(MOCK_PARETO_POINTS.length);
  });

  it("marks leading bars as within-80% and trailing as outside", () => {
    render(<ParetoChart points={MOCK_PARETO_POINTS} />);
    const bars = screen.getAllByTestId("pareto-bar");
    expect(bars[0].getAttribute("data-within80")).toBe("true");
    expect(bars[bars.length - 1].getAttribute("data-within80")).toBe("false");
  });

  it("renders 80% reference line and summary", () => {
    render(<ParetoChart points={MOCK_PARETO_POINTS} />);
    expect(screen.getByTestId("pareto-80line")).toBeInTheDocument();
    expect(screen.getByTestId("pareto-summary")).toHaveTextContent(/agentes geram 80% do valor/i);
    expect(screen.getByTestId("pareto-summary")).toHaveTextContent(/Concentração Top 3/i);
  });

  it("renders empty state", () => {
    render(<ParetoChart points={[]} />);
    expect(screen.getByText(/Sem dados/i)).toBeInTheDocument();
  });

  it("renders maximize button", () => {
    render(<ParetoChart points={MOCK_PARETO_POINTS} />);
    expect(screen.getByTestId("pareto-maximize")).toBeInTheDocument();
    expect(screen.getByTestId("pareto-maximize")).toHaveTextContent("Tela cheia");
  });

  it("opens fullscreen overlay on maximize click", () => {
    render(<ParetoChart points={MOCK_PARETO_POINTS} />);
    fireEvent.click(screen.getByTestId("pareto-maximize"));
    expect(screen.getByTestId("pareto-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("pareto-minimize")).toBeInTheDocument();
    // Chart rendered in both overlay + background card → 2× bars
    expect(screen.getAllByTestId("pareto-bar").length).toBeGreaterThanOrEqual(MOCK_PARETO_POINTS.length);
  });

  it("closes overlay on minimize click", () => {
    render(<ParetoChart points={MOCK_PARETO_POINTS} />);
    fireEvent.click(screen.getByTestId("pareto-maximize"));
    expect(screen.getByTestId("pareto-overlay")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("pareto-minimize"));
    expect(screen.queryByTestId("pareto-overlay")).not.toBeInTheDocument();
  });
});
