import { describe, expect, it } from "vitest";
import {
  linearRegression,
  residual,
  multipleRegression,
  polynomialRegression,
  logLogRegression,
  adjustedR2,
  cleanRegressionData,
  crossValidate,
} from "./regression";

// ── linearRegression (existing — keep coverage) ──────────────────────────

describe("linearRegression", () => {
  it("fits perfect line: y = 2x + 1", () => {
    const fit = linearRegression([
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 7 },
    ]);
    expect(fit.slope).toBeCloseTo(2, 6);
    expect(fit.intercept).toBeCloseTo(1, 6);
    expect(fit.r2).toBeCloseTo(1, 6);
    expect(fit.se).toBeCloseTo(0, 6);
    expect(fit.predict(10)).toBeCloseTo(21, 6);
  });

  it("returns zeroed fit for empty input", () => {
    const fit = linearRegression([]);
    expect(fit.slope).toBe(0);
    expect(fit.intercept).toBe(0);
    expect(fit.r2).toBe(0);
    expect(fit.predict(123)).toBe(0);
  });

  it("returns flat fit at meanY for collinear-x input", () => {
    const fit = linearRegression([
      { x: 5, y: 10 },
      { x: 5, y: 20 },
    ]);
    expect(fit.slope).toBe(0);
    expect(fit.intercept).toBe(15);
    expect(fit.predict(99)).toBe(15);
  });

  it("computes residual relative to fit", () => {
    const fit = linearRegression([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
    expect(residual({ x: 1, y: 3 }, fit)).toBeCloseTo(2, 6);
    expect(residual({ x: 2, y: 1 }, fit)).toBeCloseTo(-1, 6);
  });
});

// ── multipleRegression ───────────────────────────────────────────────────

describe("multipleRegression", () => {
  it("fits perfect plane: y = 3 + 2*x1 + 5*x2", () => {
    // y = 3 + 2*x1 + 5*x2
    const X = [
      [1, 1],
      [2, 3],
      [0, 2],
      [4, 0],
      [3, 4],
    ];
    const y = X.map(([x1, x2]) => 3 + 2 * x1 + 5 * x2);
    const fit = multipleRegression(X, y, ["x1", "x2"]);
    expect(fit.r2).toBeCloseTo(1, 8);
    expect(fit.adjR2).toBeCloseTo(1, 8);
    expect(fit.intercept).toBeCloseTo(3, 6);
    expect(fit.coefficients[0].value).toBeCloseTo(2, 6);
    expect(fit.coefficients[1].value).toBeCloseTo(5, 6);
    expect(fit.n).toBe(5);
    expect(fit.p).toBe(2);
  });

  it("returns zeroed fit for insufficient data", () => {
    const fit = multipleRegression([[1]], [10], ["x"]);
    expect(fit.r2).toBe(0);
    expect(fit.coefficients).toHaveLength(1);
    expect(fit.coefficients[0].value).toBe(0);
  });

  it("handles singular matrix gracefully", () => {
    // All same x — singular X'X
    const X = [[5], [5], [5], [5]];
    const y = [10, 20, 30, 40];
    const fit = multipleRegression(X, y, ["x"]);
    // Should return meanY as intercept, zero coefficients
    expect(fit.intercept).toBeCloseTo(25, 4);
    expect(fit.coefficients[0].value).toBe(0);
  });

  it("produces standard errors for coefficients", () => {
    const X = [
      [420, 380],
      [510, 460],
      [380, 310],
      [680, 630],
      [550, 490],
      [310, 260],
      [590, 540],
      [400, 350],
    ];
    const y = [120000, 180000, 60000, 240000, 150000, 80000, 210000, 100000];
    const fit = multipleRegression(X, y, ["acionamentos", "contatos"]);
    expect(fit.coefficients).toHaveLength(2);
    expect(fit.coefficients[0].se).toBeGreaterThan(0);
    expect(fit.coefficients[1].se).toBeGreaterThan(0);
    expect(fit.interceptSe).toBeGreaterThan(0);
  });

  it("predict works with variable names", () => {
    // y = 3 + 2*x1 + 5*x2 — need n ≥ p+2 = 4 points
    const X = [
      [1, 1],   // = 10
      [2, 3],   // = 22
      [0, 2],   // = 13
      [4, 0],   // = 11
    ];
    const exactY = [3 + 2 * 1 + 5 * 1, 3 + 2 * 2 + 5 * 3, 3 + 2 * 0 + 5 * 2, 3 + 2 * 4 + 5 * 0];
    const fit = multipleRegression(X, exactY, ["x1", "x2"]);
    expect(fit.predict({ x1: 1, x2: 1 })).toBeCloseTo(3 + 2 * 1 + 5 * 1, 4);
    expect(fit.predict({ x1: 2, x2: 3 })).toBeCloseTo(3 + 2 * 2 + 5 * 3, 4);
    expect(fit.predict({ x1: 0, x2: 0 })).toBeCloseTo(3, 4);
  });
});

// ── polynomialRegression ─────────────────────────────────────────────────

describe("polynomialRegression", () => {
  it("fits y = x² exactly with degree 2", () => {
    const x = [0, 1, 2, 3, 4];
    const y = x.map((v) => v * v);
    const fit = polynomialRegression(x, y, 2);
    expect(fit.r2).toBeCloseTo(1, 8);
    expect(fit.adjR2).toBeCloseTo(1, 8);
  });

  it("fits y = 1 + 2x + 3x² with degree 2", () => {
    const x = [0, 1, 2, 3, 4, 5];
    const y = x.map((v) => 1 + 2 * v + 3 * v * v);
    const fit = polynomialRegression(x, y, 2);
    expect(fit.r2).toBeCloseTo(1, 8);
    expect(fit.coefficients[0].name).toBe("x^1");
    expect(fit.coefficients[1].name).toBe("x^2");
  });

  it("throws for degree < 1", () => {
    expect(() => polynomialRegression([1, 2], [3, 4], 0)).toThrow();
  });
});

// ── logLogRegression ─────────────────────────────────────────────────────

describe("logLogRegression", () => {
  it("fits power law y = 2 * x^3 exactly", () => {
    // y = 2 * x^3 → ln(y) = ln(2) + 3*ln(x)
    const x = [1, 2, 4, 8, 16];
    const y = x.map((v) => 2 * Math.pow(v, 3));
    const fit = logLogRegression(x, y);
    expect(fit.r2).toBeCloseTo(1, 8);
  });

  it("handles small positive values without NaN", () => {
    const x = [0.01, 0.1, 1, 10];
    const y = [5, 10, 100, 200];
    const fit = logLogRegression(x, y);
    expect(isFinite(fit.r2)).toBe(true);
    expect(fit.r2).toBeGreaterThanOrEqual(0);
  });
});

// ── adjustedR2 ───────────────────────────────────────────────────────────

describe("adjustedR2", () => {
  it("equals R² when p=0", () => {
    expect(adjustedR2(0.8, 50, 0)).toBeCloseTo(0.8, 6);
  });

  it("penalizes for more predictors", () => {
    const adj = adjustedR2(0.8, 50, 5);
    expect(adj).toBeLessThan(0.8);
    expect(adj).toBeGreaterThan(0);
  });

  it("returns 0 for n = p+1", () => {
    const adj = adjustedR2(0.5, 3, 2);
    expect(adj).toBe(0);
  });
});

// ── cleanRegressionData ──────────────────────────────────────────────────

describe("cleanRegressionData", () => {
  type TestRow = {
    id: string;
    a: number;
    b: number;
  };

  it("removes null/NaN values", () => {
    const rows: TestRow[] = [
      { id: "1", a: 1, b: 2 },
      { id: "2", a: NaN, b: 3 },
      { id: "3", a: 5, b: null as unknown as number },
      { id: "4", a: undefined as unknown as number, b: 10 },
    ];
    const { clean, removed } = cleanRegressionData(rows, ["a", "b"]);
    expect(clean).toHaveLength(1);
    expect(clean[0].id).toBe("1");
    expect(removed.nulls).toBe(3);
  });

  it("removes duplicates by id", () => {
    const rows: TestRow[] = [
      { id: "x", a: 1, b: 2 },
      { id: "y", a: 3, b: 4 },
      { id: "x", a: 5, b: 6 },
    ];
    const { clean, removed } = cleanRegressionData(rows, ["a", "b"]);
    expect(clean).toHaveLength(2);
    expect(removed.duplicates).toBe(1);
  });

  it("removes IQR outliers", () => {
    // 10 normal values + 1 extreme outlier
    const rows: TestRow[] = Array.from({ length: 10 }, (_, i) => ({
      id: `n${i}`,
      a: 50 + i,
      b: 100 + i * 2,
    }));
    rows.push({ id: "out", a: 500, b: 1000 }); // way outside IQR
    const { clean, removed } = cleanRegressionData(rows, ["a", "b"]);
    expect(removed.outliers).toBeGreaterThanOrEqual(1);
    expect(clean.find((r) => r.id === "out")).toBeUndefined();
  });

  it("returns all rows when data is clean", () => {
    const rows: TestRow[] = [
      { id: "1", a: 10, b: 20 },
      { id: "2", a: 15, b: 25 },
      { id: "3", a: 12, b: 22 },
      { id: "4", a: 18, b: 28 },
    ];
    const { clean, removed } = cleanRegressionData(rows, ["a", "b"]);
    expect(clean).toHaveLength(4);
    expect(removed.nulls).toBe(0);
    expect(removed.duplicates).toBe(0);
    expect(removed.outliers).toBe(0);
  });
});

// ── crossValidate ────────────────────────────────────────────────────────

describe("crossValidate", () => {
  it("splits 70/30 and returns train/test R²", () => {
    // y = 10 + 3*x — strong linear relationship
    const X = Array.from({ length: 20 }, (_, i) => [i + 1]);
    const y = X.map(([x]) => 10 + 3 * x);
    const result = crossValidate(X, y, ["x"], 0.7, 42);
    expect(result.trainN).toBe(14);
    expect(result.testN).toBe(6);
    expect(result.trainR2).toBeCloseTo(1, 4);
    expect(result.testR2).toBeCloseTo(1, 4);
  });

  it("returns zero for tiny datasets", () => {
    const result = crossValidate([[1]], [10], ["x"], 0.7);
    expect(result.trainR2).toBe(0);
    expect(result.testR2).toBe(0);
  });

  it("is reproducible with same seed", () => {
    const X = Array.from({ length: 30 }, (_, i) => [Math.random() * 100]);
    const y = X.map(([x]) => 50 + 0.3 * x);
    const r1 = crossValidate(X, y, ["x"], 0.7, 42);
    const r2 = crossValidate(X, y, ["x"], 0.7, 42);
    expect(r1.trainR2).toBe(r2.trainR2);
    expect(r1.testR2).toBe(r2.testR2);
  });
});
