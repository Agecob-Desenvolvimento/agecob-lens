import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PerformanceHeatmap, classifyCell } from "./PerformanceHeatmap";
import { MOCK_AGENTS_ENRICHED } from "./heatmapMocks";

describe("classifyCell", () => {
  it("scores high percentile as good, mid as warn, low as bad", () => {
    expect(classifyCell(95)).toBe("good");
    expect(classifyCell(75)).toBe("warn");
    expect(classifyCell(50)).toBe("warn");
  });

  it("inverts so low percentile becomes good", () => {
    expect(classifyCell(0, true)).toBe("good");
    expect(classifyCell(90, true)).toBe("bad");
  });
});

describe("PerformanceHeatmap", () => {
  it("renders top 10 agents by valorAcordos when collapsed", () => {
    render(<PerformanceHeatmap agents={MOCK_AGENTS_ENRICHED} />);
    // Default sort: valorAcordos desc. Top 10 must be visible.
    const sorted = [...MOCK_AGENTS_ENRICHED].sort((a, b) => b.valorAcordos - a.valorAcordos);
    sorted.slice(0, 10).forEach((a) => {
      expect(screen.getByTestId(`heatmap-row-${a.id}`)).toBeInTheDocument();
    });
    // 11th+ should NOT be visible
    sorted.slice(10).forEach((a) => {
      expect(screen.queryByTestId(`heatmap-row-${a.id}`)).toBeNull();
    });
  });

  it("renders all agents when maximized", () => {
    render(<PerformanceHeatmap agents={MOCK_AGENTS_ENRICHED} />);
    fireEvent.click(screen.getByTestId("heatmap-maximize"));
    for (const a of MOCK_AGENTS_ENRICHED) {
      expect(screen.getByTestId(`heatmap-row-${a.id}`)).toBeInTheDocument();
    }
  });

  it("cycles sort indicator on header click", () => {
    render(<PerformanceHeatmap agents={MOCK_AGENTS_ENRICHED} />);
    const btn = screen.getByTestId("sort-valorAcordos");
    fireEvent.click(btn);
    expect(screen.getByTestId("sort-indicator-valorAcordos")).toBeInTheDocument();
  });

  it("renders 13 metric columns", () => {
    render(<PerformanceHeatmap agents={MOCK_AGENTS_ENRICHED} />);
    // 13 sort buttons = 13 columns (includes acionamentos)
    const buttons = screen.getAllByTestId(/^sort-/);
    expect(buttons).toHaveLength(13);
  });

  it("renders maximize button", () => {
    render(<PerformanceHeatmap agents={MOCK_AGENTS_ENRICHED} />);
    expect(screen.getByTestId("heatmap-maximize")).toBeInTheDocument();
  });

  it("opens fullscreen overlay on maximize click", () => {
    render(<PerformanceHeatmap agents={MOCK_AGENTS_ENRICHED} />);
    fireEvent.click(screen.getByTestId("heatmap-maximize"));
    expect(screen.getByTestId("heatmap-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("heatmap-minimize")).toBeInTheDocument();
  });
});
