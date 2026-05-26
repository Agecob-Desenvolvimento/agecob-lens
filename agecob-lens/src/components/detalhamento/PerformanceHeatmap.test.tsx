import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PerformanceHeatmap, classifyCell } from "./PerformanceHeatmap";
import { MOCK_AGENTS_ENRICHED } from "./heatmapMocks";

describe("classifyCell", () => {
  it("scores high relative values as good", () => {
    expect(classifyCell(95, 100)).toBe("good");
    expect(classifyCell(75, 100)).toBe("warn");
    expect(classifyCell(50, 100)).toBe("bad");
  });

  it("inverts so low values are good", () => {
    // low exception pct vs max → good
    expect(classifyCell(0, 10, true)).toBe("good");
    expect(classifyCell(9, 10, true)).toBe("bad");
  });
});

describe("PerformanceHeatmap", () => {
  it("renders one row per agent", () => {
    render(<PerformanceHeatmap agents={MOCK_AGENTS_ENRICHED} />);
    for (const a of MOCK_AGENTS_ENRICHED) {
      expect(screen.getByTestId(`heatmap-row-${a.id}`)).toBeInTheDocument();
    }
  });

  it("cycles sort indicator on header click", () => {
    render(<PerformanceHeatmap agents={MOCK_AGENTS_ENRICHED} />);
    const btn = screen.getByTestId("sort-valorAcordos");
    fireEvent.click(btn); // desc
    expect(screen.getByTestId("sort-indicator-valorAcordos")).toHaveTextContent("↓");
    fireEvent.click(btn); // asc
    expect(screen.getByTestId("sort-indicator-valorAcordos")).toHaveTextContent("↑");
    fireEvent.click(btn); // reset
    expect(screen.queryByTestId("sort-indicator-valorAcordos")).toBeNull();
  });

  it("applies inverted tone for exceptions column (0% = good)", () => {
    const zeroExc = MOCK_AGENTS_ENRICHED.find((a) => a.excecoesPct === 0);
    if (!zeroExc) throw new Error("fixture needs a zero-exception agent");
    render(<PerformanceHeatmap agents={MOCK_AGENTS_ENRICHED} />);
    const cell = screen.getByTestId(`cell-${zeroExc.id}-excecoesPct`);
    expect(cell.getAttribute("data-tone")).toBe("good");
  });
});
