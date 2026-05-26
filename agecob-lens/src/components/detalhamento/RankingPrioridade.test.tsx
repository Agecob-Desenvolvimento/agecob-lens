import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RankingPrioridade } from "./RankingPrioridade";
import { MOCK_RANKING_ENTRIES } from "./acaoMocks";

describe("RankingPrioridade", () => {
  it("respects topN limit", () => {
    render(<RankingPrioridade entries={MOCK_RANKING_ENTRIES} topN={5} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("sorts by risk score descending (worst agent first)", () => {
    render(<RankingPrioridade entries={MOCK_RANKING_ENTRIES} topN={MOCK_RANKING_ENTRIES.length} />);
    const items = screen.getAllByRole("listitem");
    const firstScore = Number(within(items[0]).getAllByText(/^\d+$/).pop()?.textContent);
    const lastScore = Number(within(items[items.length - 1]).getAllByText(/^\d+$/).pop()?.textContent);
    expect(firstScore).toBeGreaterThanOrEqual(lastScore);
  });

  it("colors sparkline by trend direction", () => {
    const entries = [
      { id: "up", nome: "Up Trend", cpc: 20, conversao: 0.5, reprov: 5, acordos: 20, trend7d: [10, 20, 30, 40, 50, 60, 70] },
      { id: "dn", nome: "Down Trend", cpc: 20, conversao: 0.5, reprov: 5, acordos: 20, trend7d: [70, 60, 50, 40, 30, 20, 10] },
    ];
    render(<RankingPrioridade entries={entries} />);
    const sparks = screen.getAllByTestId("sparkline");
    const trends = sparks.map((s) => s.getAttribute("data-trend"));
    expect(trends).toContain("up");
    expect(trends).toContain("down");
  });

  it("renders empty state", () => {
    render(<RankingPrioridade entries={[]} />);
    expect(screen.getByText(/Sem dados/i)).toBeInTheDocument();
  });
});
