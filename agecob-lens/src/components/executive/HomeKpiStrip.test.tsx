import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomeKpiStrip, type HomeKpiPrimary, type HomeKpiSecondary } from "./HomeKpiStrip";

const primary: HomeKpiPrimary[] = [
  {
    label: "Valor Acordos",
    value: 1_611_575.51,
    unit: "BRL",
    baseline: { value: 0.12, label: "meta", betterWhen: "up" },
  },
  {
    label: "1ª Parcela",
    value: 320_347.39,
    unit: "BRL",
    baseline: { value: -0.04, label: "ontem", betterWhen: "up" },
  },
];

const secondary: HomeKpiSecondary[] = [
  {
    label: "CPC",
    value: 43.5,
    unit: "percent",
    baseline: { value: 0.05, label: "média 14d", betterWhen: "up" },
  },
  {
    label: "Conversão",
    value: 1.2,
    unit: "percent",
    baseline: { value: -0.48, label: "meta", betterWhen: "up" },
  },
  {
    label: "Ticket Médio",
    value: 4526.9,
    unit: "BRL",
    baseline: { value: 0.02, label: "média 14d", betterWhen: "up" },
  },
  {
    label: "Exceções",
    value: 1.3,
    unit: "percent",
    baseline: { value: 0.08, label: "meta", betterWhen: "down" },
  },
  {
    label: "Qtd Acordos",
    value: 356,
    unit: "count",
  },
  {
    label: "Gap de Performance",
    value: 89_000,
    unit: "BRL",
  },
  {
    label: "Qtd Acionamentos",
    value: 30_166,
    unit: "count",
    baseline: { value: 0.003, label: "média 14d", betterWhen: "flat" },
  },
];

describe("HomeKpiStrip", () => {
  it("renders 2 primary labels and 7 secondary labels", () => {
    render(<HomeKpiStrip primary={primary} secondary={secondary} />);
    expect(screen.getByText("Valor Acordos")).toBeInTheDocument();
    expect(screen.getByText("1ª Parcela")).toBeInTheDocument();
    for (const s of secondary) {
      expect(screen.getByText(s.label)).toBeInTheDocument();
    }
  });

  it("formats BRL primary as compact (>= 100k)", () => {
    render(<HomeKpiStrip primary={primary} secondary={[]} />);
    // formatBRLCompact(1_611_575.51) → "R$ 1,61 mi"
    expect(screen.getByText(/R\$\s*1,61\s*mi/)).toBeInTheDocument();
  });

  it("formats percent secondary with comma + %", () => {
    render(<HomeKpiStrip primary={[]} secondary={secondary} />);
    expect(screen.getByText("43,5%")).toBeInTheDocument();
    expect(screen.getByText("1,2%")).toBeInTheDocument();
  });

  it("formats count >= 10k as compact k", () => {
    render(<HomeKpiStrip primary={[]} secondary={secondary} />);
    expect(screen.getByText("30,2k")).toBeInTheDocument();
  });

  it("formats count < 10k with locale grouping", () => {
    render(<HomeKpiStrip primary={[]} secondary={secondary} />);
    expect(screen.getByText("356")).toBeInTheDocument();
  });

  it("colors delta emerald when direction matches betterWhen=up", () => {
    render(
      <HomeKpiStrip
        primary={[]}
        secondary={[
          {
            label: "Up Good",
            value: 10,
            unit: "count",
            baseline: { value: 0.05, label: "x", betterWhen: "up" },
          },
        ]}
      />,
    );
    const row = screen.getByText("Up Good").parentElement!;
    expect(row.querySelector(".text-success-fg")).not.toBeNull();
  });

  it("colors delta rose when direction opposes betterWhen", () => {
    render(
      <HomeKpiStrip
        primary={[]}
        secondary={[
          {
            label: "Down Bad",
            value: 10,
            unit: "count",
            baseline: { value: -0.05, label: "x", betterWhen: "up" },
          },
        ]}
      />,
    );
    const row = screen.getByText("Down Bad").parentElement!;
    expect(row.querySelector(".text-danger-fg")).not.toBeNull();
  });

  it("colors delta muted/slate when direction is flat", () => {
    render(
      <HomeKpiStrip
        primary={[]}
        secondary={[
          {
            label: "Flat",
            value: 10,
            unit: "count",
            baseline: { value: 0.001, label: "x", betterWhen: "up" },
          },
        ]}
      />,
    );
    const row = screen.getByText("Flat").parentElement!;
    expect(row.querySelector(".text-success-fg")).toBeNull();
    expect(row.querySelector(".text-danger-fg")).toBeNull();
    expect(row.querySelector(".text-muted-foreground")).not.toBeNull();
  });

  it("inverts delta semantic when primary betterWhen=down (downward = good)", () => {
    render(
      <HomeKpiStrip
        primary={[
          {
            label: "Inverted Primary",
            value: 100,
            unit: "BRL",
            baseline: { value: -0.05, label: "x", betterWhen: "down" as const },
          },
        ]}
        secondary={[]}
      />,
    );
    // baseline.value < 0 → direction "down". betterWhen "down" → positive.
    // KpiDeltaBadge with inverted=true: down → success
    const label = screen.getByText("Inverted Primary").closest("div")!;
    // Find any descendant with success class
    const card = label.parentElement!;
    expect(card.querySelector(".text-success-fg")).not.toBeNull();
  });

  it("renders em-dash when value is null", () => {
    render(
      <HomeKpiStrip
        primary={[{ label: "Empty", value: null, unit: "BRL" }]}
        secondary={[]}
      />,
    );
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
