import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HandoffTopAgentes1aParcela } from "./HandoffTopAgentes1aParcela";

describe("HandoffTopAgentes1aParcela", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    label: `Agente ${i + 1}`,
    value: (10 - i) * 10000,
  }));

  it("renders one row per item", () => {
    render(<HandoffTopAgentes1aParcela rows={rows} />);
    rows.forEach((r) => {
      expect(screen.getByText(r.label)).toBeInTheDocument();
    });
  });

  it("renders BRL-formatted values for each row", () => {
    render(<HandoffTopAgentes1aParcela rows={rows} />);
    const matches = screen.getAllByText(/R\$\s/);
    expect(matches.length).toBe(rows.length);
  });

  it("renders the title", () => {
    render(
      <HandoffTopAgentes1aParcela rows={rows} title="Top 10 1ª Parcela" />,
    );
    expect(screen.getByText("Top 10 1ª Parcela")).toBeInTheDocument();
  });

  it("shows empty state when rows is empty", () => {
    render(<HandoffTopAgentes1aParcela rows={[]} />);
    expect(screen.getByText(/Sem dados/i)).toBeInTheDocument();
  });

  it("shows skeleton when loading and hides data rows", () => {
    const { container } = render(
      <HandoffTopAgentes1aParcela rows={rows} loading />,
    );
    expect(screen.queryByText("Agente 1")).toBeNull();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("does not sort or slice — renders rows in the order provided", () => {
    const custom = [
      { label: "Zeta", value: 100 },
      { label: "Alfa", value: 999 },
      { label: "Mid", value: 500 },
    ];
    const { container } = render(<HandoffTopAgentes1aParcela rows={custom} />);
    const labels = Array.from(
      container.querySelectorAll<HTMLSpanElement>("span[title]"),
    ).map((el) => el.textContent);
    expect(labels).toEqual(["Zeta", "Alfa", "Mid"]);
  });
});
