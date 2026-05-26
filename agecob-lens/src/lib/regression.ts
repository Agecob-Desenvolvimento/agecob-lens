// ── Matrix helpers (internal) ──────────────────────────────────────────────

/** n×m matrix represented as row-major flat array: mat[i][j] = data[i*m + j] */
type Matrix = { rows: number; cols: number; data: number[] };

function mat(rows: number, cols: number, fill = 0): Matrix {
  return { rows, cols, data: new Array(rows * cols).fill(fill) };
}

function matGet(m: Matrix, r: number, c: number): number {
  return m.data[r * m.cols + c];
}

function matSet(m: Matrix, r: number, c: number, v: number): void {
  m.data[r * m.cols + c] = v;
}

/** A·B */
function matMul(a: Matrix, b: Matrix): Matrix {
  if (a.cols !== b.rows) throw new Error(`matMul shape mismatch: ${a.rows}×${a.cols} · ${b.rows}×${b.cols}`);
  const out = mat(a.rows, b.cols);
  for (let i = 0; i < a.rows; i++) {
    for (let k = 0; k < a.cols; k++) {
      const aik = matGet(a, i, k);
      if (aik === 0) continue;
      for (let j = 0; j < b.cols; j++) {
        matSet(out, i, j, matGet(out, i, j) + aik * matGet(b, k, j));
      }
    }
  }
  return out;
}

/** Aᵀ */
function matTranspose(a: Matrix): Matrix {
  const out = mat(a.cols, a.rows);
  for (let i = 0; i < a.rows; i++)
    for (let j = 0; j < a.cols; j++)
      matSet(out, j, i, matGet(a, i, j));
  return out;
}

/** In-place Gauss-Jordan inversion of square matrix. Returns false if singular. */
function matInvert(m: Matrix): boolean {
  if (m.rows !== m.cols) throw new Error("matInvert: non-square");
  const n = m.rows;
  // Augment with identity
  const aug = mat(n, 2 * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) matSet(aug, i, j, matGet(m, i, j));
    matSet(aug, i, n + i, 1);
  }
  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col;
    let maxVal = Math.abs(matGet(aug, col, col));
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(matGet(aug, row, col));
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }
    if (maxVal < 1e-12) return false; // singular
    if (maxRow !== col) {
      for (let j = 0; j < 2 * n; j++) {
        const tmp = matGet(aug, col, j);
        matSet(aug, col, j, matGet(aug, maxRow, j));
        matSet(aug, maxRow, j, tmp);
      }
    }
    const pivot = matGet(aug, col, col);
    for (let j = 0; j < 2 * n; j++) matSet(aug, col, j, matGet(aug, col, j) / pivot);
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = matGet(aug, row, col);
      for (let j = 0; j < 2 * n; j++)
        matSet(aug, row, j, matGet(aug, row, j) - factor * matGet(aug, col, j));
    }
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      matSet(m, i, j, matGet(aug, i, n + j));
  return true;
}

// ── Public types ────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface RegressionFit {
  slope: number;
  intercept: number;
  r2: number;
  se: number;
  predict: (x: number) => number;
}

export interface CoefEstimate {
  name: string;
  value: number;
  se: number;
}

export interface MultipleRegressionResult {
  coefficients: CoefEstimate[];
  intercept: number;
  interceptSe: number;
  r2: number;
  adjR2: number;
  /** Residual standard error */
  se: number;
  n: number;
  /** Number of predictors (excluding intercept) */
  p: number;
  predict: (vars: Record<string, number>) => number;
}

export interface CrossValidationResult {
  trainR2: number;
  testR2: number;
  trainN: number;
  testN: number;
  /** Number of rows removed during cleaning */
  removedNulls: number;
  removedDuplicates: number;
  removedOutliers: number;
  totalRaw: number;
}

export interface CleanedData<T> {
  clean: T[];
  removed: { nulls: number; duplicates: number; outliers: number };
}

export interface RegressionModel {
  id: string;
  label: string;
  description: string;
  /** Fit on full (cleaned) dataset */
  fit: MultipleRegressionResult;
  /** Cross-validation result */
  cv: CrossValidationResult;
}

// ── Core OLS (simple, 1 predictor) ─────────────────────────────────────────

export function linearRegression(points: Point[]): RegressionFit {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0, se: 0, predict: () => 0 };
  let sumX = 0, sumY = 0;
  for (const p of points) { sumX += p.x; sumY += p.y; }
  const meanX = sumX / n, meanY = sumY / n;
  let num = 0, den = 0;
  for (const p of points) { const dx = p.x - meanX; num += dx * (p.y - meanY); den += dx * dx; }
  if (den === 0) return { slope: 0, intercept: meanY, r2: 0, se: 0, predict: () => meanY };
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  let ssRes = 0, ssTot = 0;
  for (const p of points) {
    const pred = slope * p.x + intercept;
    ssRes += (p.y - pred) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const se = Math.sqrt(ssRes / Math.max(1, n - 2));
  return { slope, intercept, r2, se, predict: (x: number) => slope * x + intercept };
}

export function residual(p: Point, fit: RegressionFit): number {
  return p.y - fit.predict(p.x);
}

// ── Multiple Linear Regression (OLS via normal equations) ──────────────────

/**
 * Fit y ~ X using ordinary least squares.
 * X: n×p matrix (n rows, p predictors). Intercept is added automatically.
 * names: p predictor labels. y: n target values.
 */
export function multipleRegression(
  Xraw: number[][],
  y: number[],
  names: string[],
): MultipleRegressionResult {
  const n = Xraw.length;
  const p = names.length;
  if (n < p + 2 || p === 0) {
    const zeroCoefs = names.map((nm) => ({ name: nm, value: 0, se: 0 }));
    return { coefficients: zeroCoefs, intercept: 0, interceptSe: 0, r2: 0, adjR2: 0, se: 0, n, p, predict: () => 0 };
  }

  // Build design matrix Xaug = [1 | X] (n × (p+1))
  const Xaug = mat(n, p + 1);
  for (let i = 0; i < n; i++) {
    matSet(Xaug, i, 0, 1); // intercept column
    for (let j = 0; j < p; j++) matSet(Xaug, i, j + 1, Xraw[i][j]);
  }

  // y as column vector (n×1)
  const Y = mat(n, 1);
  for (let i = 0; i < n; i++) matSet(Y, i, 0, y[i]);

  // β̂ = (XᵀX)⁻¹ Xᵀy
  const Xt = matTranspose(Xaug);
  const XtX = matMul(Xt, Xaug);
  if (!matInvert(XtX)) {
    // Singular — return zeroed fit
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    return {
      coefficients: names.map((nm) => ({ name: nm, value: 0, se: 0 })),
      intercept: meanY, interceptSe: 0, r2: 0, adjR2: 0, se: 0, n, p,
      predict: () => meanY,
    };
  }
  const XtY = matMul(Xt, Y);
  const beta = matMul(XtX, XtY); // (p+1)×1

  // Predictions and residuals
  let ssRes = 0, ssTot = 0;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  const yHat = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let pred = matGet(beta, 0, 0); // intercept
    for (let j = 0; j < p; j++) pred += matGet(beta, j + 1, 0) * Xraw[i][j];
    yHat[i] = pred;
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const adjR2 = 1 - (1 - r2) * (n - 1) / Math.max(1, n - p - 1);
  const sigma2 = ssRes / Math.max(1, n - p - 1);
  const se = Math.sqrt(sigma2);

  // Standard errors: SE(βⱼ) = σ · sqrt(diag((XᵀX)⁻¹)ⱼⱼ)
  const interceptSe = Math.sqrt(sigma2 * matGet(XtX, 0, 0));
  const coefficients: CoefEstimate[] = names.map((nm, j) => ({
    name: nm,
    value: matGet(beta, j + 1, 0),
    se: Math.sqrt(sigma2 * matGet(XtX, j + 1, j + 1)),
  }));

  const predict = (vars: Record<string, number>): number => {
    let v = matGet(beta, 0, 0);
    for (let j = 0; j < p; j++) v += matGet(beta, j + 1, 0) * (vars[names[j]] ?? 0);
    return v;
  };

  return { coefficients, intercept: matGet(beta, 0, 0), interceptSe, r2, adjR2, se, n, p, predict };
}

// ── Polynomial regression ──────────────────────────────────────────────────

export function polynomialRegression(
  x: number[],
  y: number[],
  degree: number,
): MultipleRegressionResult {
  if (degree < 1) throw new Error("degree must be >= 1");
  const n = x.length;
  const X: number[][] = [];
  const names: string[] = [];
  for (let d = 1; d <= degree; d++) {
    names.push(`x^${d}`);
  }
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let d = 1; d <= degree; d++) {
      row.push(Math.pow(x[i], d));
    }
    X.push(row);
  }
  return multipleRegression(X, y, names);
}

// ── Log-log regression ─────────────────────────────────────────────────────

export function logLogRegression(
  x: number[],
  y: number[],
): MultipleRegressionResult {
  // ln(y) ~ ln(x)  →  y = e^intercept · x^slope
  const n = x.length;
  const eps = 1e-9;
  const logX: number[][] = [];
  const logY: number[] = [];
  for (let i = 0; i < n; i++) {
    logX.push([Math.log(Math.max(x[i], eps))]);
    logY.push(Math.log(Math.max(y[i], eps)));
  }
  return multipleRegression(logX, logY, ["ln(x)"]);
}

// ── Adjusted R² ────────────────────────────────────────────────────────────

export function adjustedR2(r2: number, n: number, p: number): number {
  return 1 - (1 - r2) * (n - 1) / Math.max(1, n - p - 1);
}

// ── Data cleaning ──────────────────────────────────────────────────────────

/**
 * Clean regression data: remove nulls/NaN, duplicates (by idField), and IQR outliers.
 * Returns cleaned array + removal counts.
 *
 * @param rows       Raw data rows.
 * @param numericFields  Fields to check for null/NaN and outlier detection.
 * @param idField    Optional field for deduplication (default: 'id').
 */
export function cleanRegressionData<T extends Record<string, unknown>>(
  rows: T[],
  numericFields: (keyof T)[],
  idField: keyof T = "id" as keyof T,
): CleanedData<T> {
  const removed = { nulls: 0, duplicates: 0, outliers: 0 };
  const totalRaw = rows.length;

  // 1. Remove null/NaN/undefined in numeric fields
  let clean = rows.filter((row) => {
    for (const f of numericFields) {
      const v = row[f];
      if (v === null || v === undefined || (typeof v === "number" && !isFinite(v))) {
        removed.nulls++;
        return false;
      }
    }
    return true;
  });

  // 2. Remove duplicates by idField
  const seen = new Set<unknown>();
  clean = clean.filter((row) => {
    const id = row[idField];
    if (seen.has(id)) { removed.duplicates++; return false; }
    seen.add(id);
    return true;
  });

  // 3. IQR outlier detection (per numeric field, flag any row with outlier in any field)
  if (clean.length >= 4) {
    const outlierFlags = new Set<number>();
    for (const f of numericFields) {
      const vals = clean.map((r) => r[f] as number).sort((a, b) => a - b);
      const q1 = vals[Math.floor(vals.length * 0.25)];
      const q3 = vals[Math.floor(vals.length * 0.75)];
      const iqr = q3 - q1;
      if (iqr === 0) continue;
      const lo = q1 - 1.5 * iqr;
      const hi = q3 + 1.5 * iqr;
      clean.forEach((r, idx) => {
        const v = r[f] as number;
        if (v < lo || v > hi) outlierFlags.add(idx);
      });
    }
    // Remove outliers (in reverse to preserve indices)
    const outlierIndices = [...outlierFlags].sort((a, b) => b - a);
    for (const idx of outlierIndices) {
      clean.splice(idx, 1);
      removed.outliers++;
    }
  }

  return { clean, removed };
}

// ── Cross-validation ───────────────────────────────────────────────────────

/**
 * Seeded PRNG (Mulberry32).
 */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle with seeded RNG.
 */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Single 70/30 train-test split cross-validation.
 * Shuffles with a fixed seed (42) for reproducibility, splits, fits on train,
 * evaluates R² on both train and test sets.
 *
 * @param Xraw          n×p predictor matrix (no intercept).
 * @param y             n target values.
 * @param names         p predictor names.
 * @param trainFraction Fraction for training (default 0.7).
 * @param seed          Seed for reproducible shuffle (default 42).
 */
export function crossValidate(
  Xraw: number[][],
  y: number[],
  names: string[],
  trainFraction = 0.7,
  seed = 42,
): { trainR2: number; testR2: number; trainN: number; testN: number } {
  const n = Xraw.length;
  if (n < 4) return { trainR2: 0, testR2: 0, trainN: n, testN: 0 };

  // Build index array and shuffle
  const indices = Array.from({ length: n }, (_, i) => i);
  const rng = seededRandom(seed);
  const shuffled = shuffle(indices, rng);

  const split = Math.floor(n * trainFraction);
  const trainIdx = shuffled.slice(0, split);
  const testIdx = shuffled.slice(split);

  // R² helper
  const calcR2 = (idx: number[]): number => {
    if (idx.length < 2) return 0;
    const Xsub = idx.map((i) => Xraw[i]);
    const ysub = idx.map((i) => y[i]);
    const fit = multipleRegression(Xsub, ysub, names);
    return fit.r2;
  };

  return {
    trainR2: calcR2(trainIdx),
    testR2: calcR2(testIdx),
    trainN: trainIdx.length,
    testN: testIdx.length,
  };
}
