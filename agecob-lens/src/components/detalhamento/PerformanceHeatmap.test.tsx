import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PerformanceHeatmap, buildPercentileMap, classifyCell } from "./PerformanceHeatmap";
import { MOCK_AGENTS_ENRICHED } from "./heatmapMocks";

describe("buildPercentileMap", () => {
  it("ranks values by percentile (below + half of equals)", () => {
    const map = buildPercentileMap([10, 20, 20, 30]);
    expect(map.get(10)).toBe(13); // (0 + 0.5×1)/4 ×100
    expect(map.get(20)).toBe(50); // (1 + 0.5×2)/4 ×100
    expect(map.get(30)).toBe(88); // (3 + 0.5×1)/4 ×100
  });

  // Regressão: NaN !== NaN fazia o loop de ranking nunca avançar → main thread travada.
  it("terminates and stays finite when input contains NaN/Infinity", () => {
    const map = buildPercentileMap([Number.NaN, 10, Number.POSITIVE_INFINITY, 20]);
    expect(map.size).toBeGreaterThan(0);
    for (const rank of map.values()) {
      expect(Number.isFinite(rank)).toBe(true);
    }
  });
});

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
    // 13 botões de métrica (exclui o sort da coluna Agente)
    const buttons = screen
      .getAllByTestId(/^sort-/)
      .filter((b) => b.getAttribute("data-testid") !== "sort-nome");
    expect(buttons).toHaveLength(13);
  });

  it("sorts agents alphabetically when clicking the Agente header", () => {
    render(<PerformanceHeatmap agents={MOCK_AGENTS_ENRICHED} />);
    fireEvent.click(screen.getByTestId("heatmap-maximize"));
    fireEvent.click(screen.getByTestId("sort-nome"));
    expect(screen.getByTestId("sort-indicator-nome")).toBeInTheDocument();
    const expected = [...MOCK_AGENTS_ENRICHED]
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }))
      .map((a) => `heatmap-row-${a.id}`);
    const rows = screen
      .getAllByTestId(/^heatmap-row-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(rows).toEqual(expected);
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
