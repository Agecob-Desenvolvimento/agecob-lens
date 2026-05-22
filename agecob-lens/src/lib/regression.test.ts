import { describe, expect, it } from "vitest";
import { linearRegression, residual } from "./regression";

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
