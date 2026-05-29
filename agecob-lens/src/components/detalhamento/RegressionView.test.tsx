import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RegressionView } from "./RegressionView";
import { MOCK_REGRESSION_POINTS } from "./regressionMocks";
import type { RegressionEnvelope } from "@/services/api";

vi.mock("@/services/api", () => ({
  fetchRegressionModels: vi.fn(),
}));

import { fetchRegressionModels } from "@/services/api";

const mockedFetch = fetchRegressionModels as ReturnType<typeof vi.fn>;

function mockApiResponse(overrides: Partial<RegressionEnvelope["data"][0]> = {}) {
  const data: RegressionEnvelope = {
    meta: { generated_at: "2026-01-01T00:00:00Z", total_rows: 1, sources: [], filters: { date: "today" } },
    data: [{
      meta: { raw_count: 8, clean_count: 8, removed_nulls: 0, removed_duplicates: 0, removed_outliers: 0 },
      modelos: [
        { id: "simple", label: "Simples", description: "valor ~ eficiencia", drawable: true,
          r2_train: 0.06, r2_test: 0.05, adj_r2: 0.04, cv_train_n: 5, cv_test_n: 3,
          intercept: 50000, intercept_se: 12000, coefficients: [{ name: "x", value: 0.5, se: 0.1 }] },
        { id: "loglog", label: "Log-Log", description: "ln(valor) ~ ln(eficiencia)", drawable: true,
          r2_train: 0.07, r2_test: 0.06, adj_r2: 0.05, cv_train_n: 5, cv_test_n: 3,
          intercept: 10.5, intercept_se: 1.2, coefficients: [{ name: "ln(x)", value: 2.1, se: 0.3 }] },
        { id: "poly2", label: "Polinomial", description: "valor ~ eficiencia + eficiencia2", drawable: true,
          r2_train: 0.10, r2_test: 0.08, adj_r2: 0.07, cv_train_n: 5, cv_test_n: 3,
          intercept: 30000, intercept_se: 15000,
          coefficients: [{ name: "x", value: 0.3, se: 0.15 }, { name: "x2", value: 0.1, se: 0.05 }] },
        { id: "volume", label: "Volume", description: "valor ~ acionamentos + contatos", drawable: false,
          r2_train: 0.55, r2_test: 0.50, adj_r2: 0.48, cv_train_n: 5, cv_test_n: 3,
          intercept: -50000, intercept_se: 20000,
          coefficients: [{ name: "acionamentos", value: 200, se: 50 }, { name: "contatos", value: 150, se: 60 }] },
        { id: "full", label: "Completo", description: "valor ~ acionam. + contatos + cpc + conv.", drawable: false,
          r2_train: 0.65, r2_test: 0.60, adj_r2: 0.58, cv_train_n: 5, cv_test_n: 3,
          intercept: -80000, intercept_se: 25000,
          coefficients: [
            { name: "acionamentos", value: 180, se: 55 }, { name: "contatos", value: 140, se: 65 },
            { name: "cpc", value: 300, se: 100 }, { name: "conversao", value: 2000, se: 800 },
          ] },
      ],
      ...overrides,
    }],
    errors: [],
  };
  mockedFetch.mockResolvedValue(data);
}

describe("RegressionView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiResponse();
  });

  it("renders scatter plot with dots", async () => {
    render(<RegressionView points={MOCK_REGRESSION_POINTS} />);
    await waitFor(() => {
      expect(screen.getAllByTestId("regression-dot")).toHaveLength(MOCK_REGRESSION_POINTS.length);
    });
  });

  it("shows insight bar with model selector and R2", async () => {
    render(<RegressionView points={MOCK_REGRESSION_POINTS} />);
    await waitFor(() => {
      expect(screen.getByTestId("insight-bar")).toBeInTheDocument();
      expect(screen.getByTestId("model-selector")).toBeInTheDocument();
    });
  });

  it("default model is volume", async () => {
    render(<RegressionView points={MOCK_REGRESSION_POINTS} />);
    await waitFor(() => {
      const select = screen.getByTestId("model-selector") as HTMLSelectElement;
      expect(select.value).toBe("volume");
    });
  });

  it("shows business insight text", async () => {
    render(<RegressionView points={MOCK_REGRESSION_POINTS} />);
    await waitFor(() => {
      expect(screen.getByTestId("insight-text")).toBeInTheDocument();
    });
  });

  it("shows non-drawable note for volume model", async () => {
    render(<RegressionView points={MOCK_REGRESSION_POINTS} />);
    await waitFor(() => expect(screen.getByTestId("model-selector")).toBeInTheDocument());
    // volume is already default and non-drawable
    expect(screen.getByTestId("non-drawable-note")).toBeInTheDocument();
  });

  it("switches to simple model and shows regression line", async () => {
    render(<RegressionView points={MOCK_REGRESSION_POINTS} />);
    await waitFor(() => expect(screen.getByTestId("model-selector")).toBeInTheDocument());
    const select = screen.getByTestId("model-selector") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "simple" } });
    await waitFor(() => {
      expect(screen.getByTestId("regression-line")).toBeInTheDocument();
    });
  });

  it("coefficient table hidden by default, shown on toggle click", async () => {
    render(<RegressionView points={MOCK_REGRESSION_POINTS} />);
    await waitFor(() => expect(screen.getByTestId("toggle-details")).toBeInTheDocument());
    expect(screen.queryByTestId("coef-table")).toBeNull();
    fireEvent.click(screen.getByTestId("toggle-details"));
    expect(screen.getByTestId("coef-table")).toBeInTheDocument();
  });

  it("colors subperforming point rose", async () => {
    const onLine = Array.from({ length: 12 }, (_, i) => {
      const eff = 0.2 + i * 0.05;
      return {
        id: `l${i}`, nome: `Lin ${i}`, eficiencia: eff, valor: eff * 200_000,
        excPct: 2, acordos: 10, acionamentos: 400, contatos: 360, cpc: 90, conversao: 4.5,
      };
    });
    const points = [...onLine, {
      id: "sub", nome: "Sub Perf", eficiencia: 0.65, valor: 20_000,
      excPct: 2, acordos: 8, acionamentos: 300, contatos: 250, cpc: 83, conversao: 2.7,
    }];
    render(<RegressionView points={points} />);
    await waitFor(() => {
      const dots = screen.getAllByTestId("regression-dot");
      expect(dots.some((d) => d.getAttribute("data-color") === "#ef4444")).toBe(true);
    });
  });

  it("renders insufficient-data message for < 2 points", () => {
    render(<RegressionView points={[MOCK_REGRESSION_POINTS[0]]} />);
    expect(screen.getByText(/Dados insuficientes/i)).toBeInTheDocument();
  });

  it("shows clean badge when API reports removals", async () => {
    mockApiResponse({ meta: { raw_count: 12, clean_count: 10, removed_nulls: 1, removed_duplicates: 0, removed_outliers: 1 } });
    render(<RegressionView points={MOCK_REGRESSION_POINTS} />);
    await waitFor(() => expect(screen.getByTestId("clean-badge")).toBeInTheDocument());
  });

  it("shows mock hint when API fails", async () => {
    mockedFetch.mockRejectedValue(new Error("Network error"));
    render(<RegressionView points={MOCK_REGRESSION_POINTS} />);
    await waitFor(() => expect(screen.getByTestId("mock-hint")).toBeInTheDocument());
  });
});
