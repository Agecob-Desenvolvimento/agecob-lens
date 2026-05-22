export interface Point {
  x: number;
  y: number;
}

export interface RegressionFit {
  slope: number;
  intercept: number;
  r2: number;
  /** standard error of residuals (for confidence band) */
  se: number;
  /** predict y for a given x */
  predict: (x: number) => number;
}

/**
 * OLS linear regression. Returns slope, intercept, R² and residual SE.
 * Empty / collinear inputs return zeroed fit.
 */
export function linearRegression(points: Point[]): RegressionFit {
  const n = points.length;
  if (n < 2) {
    return { slope: 0, intercept: 0, r2: 0, se: 0, predict: () => 0 };
  }
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    num += dx * (p.y - meanY);
    den += dx * dx;
  }
  if (den === 0) {
    return { slope: 0, intercept: meanY, r2: 0, se: 0, predict: () => meanY };
  }
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  let ssRes = 0;
  let ssTot = 0;
  for (const p of points) {
    const pred = slope * p.x + intercept;
    ssRes += (p.y - pred) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const se = Math.sqrt(ssRes / Math.max(1, n - 2));
  return { slope, intercept, r2, se, predict: (x: number) => slope * x + intercept };
}

/**
 * Residual = observed - predicted. Positive = above the trend line.
 */
export function residual(p: Point, fit: RegressionFit): number {
  return p.y - fit.predict(p.x);
}
