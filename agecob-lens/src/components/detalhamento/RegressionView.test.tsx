import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RegressionView } from "./RegressionView";
import { MOCK_REGRESSION_POINTS } from "./regressionMocks";

describe("RegressionView", () => {
  it("renders regression line for drawable models", () => {
    render(<RegressionView points={MOCK_REGRESSION_POINTS} />);
    expect(screen.getByTestId("regression-line")).toBeInTheDocument();
  });

  it("shows stats panel with R² treino, teste, ajustado", () => {
    render(<RegressionView points={MOCK_REGRESSION_POINTS} />);
    expect(screen.getByTestId("stat-r2")).toBeInTheDocument();
    expect(screen.getByTestId("stat-testr2")).toBeInTheDocument();
    expect(screen.getByTestId("stat-adjr2")).toBeInTheDocument();
    expect(screen.getByTestId("stat-n")).toHaveTextContent(String(MOCK_REGRESSION_POINTS.length));
  });

  it("renders one dot per clean point", () => {
    render(<RegressionView points={MOCK_REGRESSION_POINTS} />);
    expect(screen.getAllByTestId("regression-dot")).toHaveLength(MOCK_REGRESSION_POINTS.length);
  });

  it("renders model selector with all 5 models", () => {
    render(<RegressionView points={MOCK_REGRESSION_POINTS} />);
    const select = screen.getByTestId("model-selector") as HTMLSelectElement;
    expect(select.options).toHaveLength(5);
    expect(select.value).toBe("simple"); // default
  });

  it("shows coefficients table", () => {
    render(<RegressionView points={MOCK_REGRESSION_POINTS} />);
    expect(screen.getByTestId("coef-table")).toBeInTheDocument();
  });

  it("shows non-drawable note for volume model", () => {
    render(<RegressionView points={MOCK_REGRESSION_POINTS} />);
    const select = screen.getByTestId("model-selector") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "volume" } });
    expect(screen.getByTestId("non-drawable-note")).toBeInTheDocument();
  });

  it("colors a clearly subperforming point rose", () => {
    // Tight linear set so the off-trend point exceeds the 95% band.
    const onLine = Array.from({ length: 12 }, (_, i) => {
      const eff = 0.2 + i * 0.05;
      return {
        id: `l${i}`, nome: `Lin ${i}`, eficiencia: eff, valor: eff * 200_000,
        excPct: 2, acordos: 10, acionamentos: 400, contatos: 360, cpc: 90, conversao: 4.5,
      };
    });
    const points = [
      ...onLine,
      {
        id: "sub", nome: "Sub Perf", eficiencia: 0.65, valor: 20_000,
        excPct: 2, acordos: 8, acionamentos: 300, contatos: 250, cpc: 83, conversao: 2.7,
      },
    ];
    render(<RegressionView points={points} />);
    const dots = screen.getAllByTestId("regression-dot");
    const hasRose = dots.some((d) => d.getAttribute("data-color") === "#ef4444");
    expect(hasRose).toBe(true);
  });

  it("renders insufficient-data message for < 2 raw points", () => {
    render(<RegressionView points={[MOCK_REGRESSION_POINTS[0]]} />);
    expect(screen.getByText(/Dados insuficientes/i)).toBeInTheDocument();
  });

  it("shows clean-data badge when points have nulls", () => {
    const messy = [
      ...MOCK_REGRESSION_POINTS,
      { id: "dup", nome: "Duplicate", eficiencia: 0.5, valor: 100_000, excPct: 5, acordos: 10, acionamentos: 400, contatos: 350, cpc: 87.5, conversao: 4.0 },
      { id: "dup", nome: "Duplicate 2", eficiencia: 0.6, valor: 120_000, excPct: 3, acordos: 12, acionamentos: 450, contatos: 400, cpc: 88.9, conversao: 4.2 },
      { id: "nan", nome: "NaN Row", eficiencia: NaN, valor: 0, excPct: 0, acordos: 0, acionamentos: 0, contatos: 0, cpc: 0, conversao: 0 },
    ];
    render(<RegressionView points={messy} />);
    expect(screen.getByTestId("clean-badge")).toBeInTheDocument();
    expect(screen.getByTestId("clean-badge").textContent).toMatch(/nulos/);
    expect(screen.getByTestId("clean-badge").textContent).toMatch(/dup/);
  });

  it("shows tooltip on hover", () => {
    render(<RegressionView points={MOCK_REGRESSION_POINTS} />);
    fireEvent.mouseEnter(screen.getAllByTestId("regression-dot")[0]);
    expect(screen.getByTestId("regression-tooltip")).toBeInTheDocument();
  });
});
