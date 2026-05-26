import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HandoffFinanceiroGroupedBar } from "./HandoffFinanceiroGroupedBar";

// Recharts ResponsiveContainer relies on layout measurement that jsdom does not
// implement. Replace it with a fixed-size wrapper so the BarChart actually mounts.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 300 }}>{children}</div>
    ),
  };
});

describe("HandoffFinanceiroGroupedBar", () => {
  const data = [
    { bu: "AUTOS", valorAcordos: 1560000, primeiraParcela: 288900 },
    { bu: "CONSUMER", valorAcordos: 50100, primeiraParcela: 31500 },
  ];

  it("renders the title", () => {
    render(<HandoffFinanceiroGroupedBar data={data} title="Valor por UN" />);
    expect(screen.getByText("Valor por UN")).toBeInTheDocument();
  });

  it("renders a chart container for non-empty data", () => {
    const { container } = render(<HandoffFinanceiroGroupedBar data={data} />);
    // ChartShell with non-empty data renders the recharts wrapper div
    expect(container.querySelector(".recharts-wrapper, [style*='width: 600px']"))
      .not.toBeNull();
    expect(screen.queryByText(/Sem dados/i)).toBeNull();
  });

  it("shows empty state when data is empty", () => {
    render(<HandoffFinanceiroGroupedBar data={[]} />);
    expect(screen.getByText(/Sem dados/i)).toBeInTheDocument();
  });

  it("shows empty state when explicitly empty", () => {
    render(<HandoffFinanceiroGroupedBar data={data} empty />);
    expect(screen.getByText(/Sem dados/i)).toBeInTheDocument();
  });

  it("shows skeleton when loading and does not render chart", () => {
    const { container } = render(
      <HandoffFinanceiroGroupedBar data={data} loading />,
    );
    expect(screen.queryByText(/Sem dados/i)).toBeNull();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
