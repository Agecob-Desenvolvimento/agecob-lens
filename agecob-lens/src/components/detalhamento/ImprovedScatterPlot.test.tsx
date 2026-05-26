import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ImprovedScatterPlot } from "./ImprovedScatterPlot";
import { MOCK_REGRESSION_POINTS } from "./regressionMocks";

describe("ImprovedScatterPlot", () => {
  it("renders one dot per point", () => {
    render(<ImprovedScatterPlot points={MOCK_REGRESSION_POINTS} />);
    expect(screen.getAllByTestId("scatter-dot")).toHaveLength(MOCK_REGRESSION_POINTS.length);
  });

  it("colors dots by exception threshold", () => {
    const points = [
      { id: "g", nome: "Good", eficiencia: 0.5, valor: 100_000, excPct: 3, acordos: 10 },
      { id: "y", nome: "Mid", eficiencia: 0.5, valor: 100_000, excPct: 9, acordos: 10 },
      { id: "r", nome: "Bad", eficiencia: 0.5, valor: 100_000, excPct: 20, acordos: 10 },
    ];
    render(<ImprovedScatterPlot points={points} />);
    const colors = screen.getAllByTestId("scatter-dot").map((d) => d.getAttribute("data-color"));
    expect(colors).toContain("#22c55e");
    expect(colors).toContain("#f59e0b");
    expect(colors).toContain("#ef4444");
  });

  it("shows tooltip on hover", () => {
    render(<ImprovedScatterPlot points={MOCK_REGRESSION_POINTS} />);
    fireEvent.mouseEnter(screen.getAllByTestId("scatter-dot")[0]);
    expect(screen.getByTestId("scatter-tooltip")).toBeInTheDocument();
  });

  it("renders empty state for no points", () => {
    render(<ImprovedScatterPlot points={[]} />);
    expect(screen.getByText(/Sem dados/i)).toBeInTheDocument();
  });
});
