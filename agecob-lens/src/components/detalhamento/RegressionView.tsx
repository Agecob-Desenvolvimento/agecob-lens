import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRLCompact } from "@/lib/metrics";
import {
  linearRegression,
  multipleRegression,
  polynomialRegression,
  logLogRegression,
  crossValidate,
  cleanRegressionData,
  type Point,
  type MultipleRegressionResult,
  type CrossValidationResult,
} from "@/lib/regression";
import type { ScatterPoint } from "./regressionMocks";

// ── Model definitions ──────────────────────────────────────────────────────

type ModelId = "simple" | "loglog" | "poly2" | "volume" | "full";

interface ModelDef {
  id: ModelId;
  label: string;
  description: string;
  /** Whether this model projects onto the eficiencia axis (can draw a 2D line) */
  drawable: boolean;
}

const MODELS: ModelDef[] = [
  { id: "simple", label: "Simples", description: "valor ~ eficiência", drawable: true },
  { id: "loglog", label: "Log-Log", description: "ln(valor) ~ ln(eficiência)", drawable: true },
  { id: "poly2", label: "Polinomial", description: "valor ~ eficiência + eficiência²", drawable: true },
  { id: "volume", label: "Volume", description: "valor ~ acionamentos + contatos", drawable: false },
  { id: "full", label: "Completo", description: "valor ~ acionam. + contatos + cpc + conv.", drawable: false },
];

// ── Fit a single model and its CV ──────────────────────────────────────────

interface ModelResult {
  def: ModelDef;
  fit: MultipleRegressionResult;
  cv: { trainR2: number; testR2: number; trainN: number; testN: number };
}

function fitModel(def: ModelDef, points: ScatterPoint[]): ModelResult {
  const X: number[][] = [];
  const y: number[] = [];
  const names: string[] = [];

  switch (def.id) {
    case "simple": {
      names.push("x");
      for (const p of points) { X.push([p.eficiencia]); y.push(p.valor); }
      break;
    }
    case "loglog": {
      names.push("ln(x)");
      const eps = 1e-9;
      for (const p of points) {
        X.push([Math.log(Math.max(p.eficiencia, eps))]);
        y.push(Math.log(Math.max(p.valor, eps)));
      }
      break;
    }
    case "poly2": {
      names.push("x"); names.push("x²");
      for (const p of points) {
        X.push([p.eficiencia, p.eficiencia * p.eficiencia]);
        y.push(p.valor);
      }
      break;
    }
    case "volume": {
      names.push("acionamentos"); names.push("contatos");
      for (const p of points) {
        X.push([p.acionamentos, p.contatos]);
        y.push(p.valor);
      }
      break;
    }
    case "full": {
      names.push("acionamentos"); names.push("contatos"); names.push("cpc"); names.push("conversao");
      for (const p of points) {
        X.push([p.acionamentos, p.contatos, p.cpc, p.conversao]);
        y.push(p.valor);
      }
      break;
    }
  }

  const fit = multipleRegression(X, y, names);
  const cv = crossValidate(X, y, names, 0.7, 42);

  return { def, fit, cv };
}

// ── Predict y from eficiencia for drawable models ──────────────────────────

function predictAtEfficiencia(
  modelId: ModelId,
  fit: MultipleRegressionResult,
  eff: number,
): number {
  switch (modelId) {
    case "simple":
      return fit.predict({ x: eff });
    case "loglog": {
      const eps = 1e-9;
      const lnY = fit.predict({ "ln(x)": Math.log(Math.max(eff, eps)) });
      return Math.exp(lnY);
    }
    case "poly2":
      return fit.predict({ x: eff, "x²": eff * eff });
    default:
      return 0;
  }
}

// ── Chart constants ────────────────────────────────────────────────────────

const W = 720;
const H = 280;
const PAD = { l: 60, r: 24, t: 16, b: 44 };

type Residual = "super" | "expected" | "sub";

function residualColor(kind: Residual): string {
  if (kind === "super") return "#22c55e";
  if (kind === "sub") return "#ef4444";
  return "#94a3b8";
}

// ── Props ──────────────────────────────────────────────────────────────────

export interface RegressionViewProps {
  points: ScatterPoint[];
  highlightId?: string;
  periodLabel?: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export function RegressionView({ points, highlightId, periodLabel = "período atual" }: RegressionViewProps) {
  const [selectedModel, setSelectedModel] = useState<ModelId>("simple");
  const [hov, setHov] = useState<number | null>(null);

  // ── Data cleaning ──────────────────────────────────────────────────────
  const { cleanPoints, removed } = useMemo(() => {
    const numericFields: (keyof ScatterPoint)[] = [
      "eficiencia", "valor", "acionamentos", "contatos", "cpc", "conversao",
    ];
    const result = cleanRegressionData(points, numericFields, "id");
    return { cleanPoints: result.clean, removed: result.removed };
  }, [points]);

  // ── Model fitting + CV (all 5 models on clean data) ────────────────────
  const results = useMemo(() => {
    if (cleanPoints.length < 3) return [] as ModelResult[];
    return MODELS.map((def) => fitModel(def, cleanPoints));
  }, [cleanPoints]);

  const current = useMemo(() => results.find((r) => r.def.id === selectedModel), [results, selectedModel]);

  // ── Simple OLS on eficiencia for residual classification (drawing) ─────
  const simpleFit = useMemo(() => {
    const pts: Point[] = cleanPoints.map((p) => ({ x: p.eficiencia, y: p.valor }));
    return linearRegression(pts);
  }, [cleanPoints]);

  // ── Chart bounds ───────────────────────────────────────────────────────
  const { maxEff, maxY } = useMemo(() => {
    if (!cleanPoints.length) return { maxEff: 1, maxY: 1 };
    return {
      maxEff: Math.max(...cleanPoints.map((p) => p.eficiencia)) * 1.1 || 1,
      maxY: Math.max(...cleanPoints.map((p) => p.valor)) * 1.1 || 1,
    };
  }, [cleanPoints]);

  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const toX = (v: number) => PAD.l + (v / maxEff) * plotW;
  const toY = (v: number) => PAD.t + plotH - (v / maxY) * plotH;

  const band = simpleFit.se * 1.96;

  const classify = (p: ScatterPoint): Residual => {
    const r = p.valor - simpleFit.predict(p.eficiencia);
    if (r > band) return "super";
    if (r < -band) return "sub";
    return "expected";
  };

  // ── Drawable model curve ───────────────────────────────────────────────
  const drawable = current?.def.drawable ?? false;
  const curvePoints = useMemo(() => {
    if (!drawable || !current) return "";
    const steps = 100;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const eff = (i / steps) * maxEff;
      const val = predictAtEfficiencia(current.def.id, current.fit, eff);
      pts.push(`${toX(eff).toFixed(1)},${toY(Math.max(0, val)).toFixed(1)}`);
    }
    return pts.join(" ");
  }, [drawable, current, maxEff, toX, toY]);

  // ── Confidence band (simple model only) ────────────────────────────────
  const xStart = 0;
  const xEnd = maxEff;
  const bandPoly = [
    `${toX(xStart)},${toY(Math.max(0, simpleFit.predict(xStart) + band))}`,
    `${toX(xEnd)},${toY(Math.max(0, simpleFit.predict(xEnd) + band))}`,
    `${toX(xEnd)},${toY(Math.max(0, simpleFit.predict(xEnd) - band))}`,
    `${toX(xStart)},${toY(Math.max(0, simpleFit.predict(xStart) - band))}`,
  ].join(" ");

  const totalRemoved = removed.nulls + removed.duplicates + removed.outliers;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Regressão de Desempenho</CardTitle>
        <CardDescription className="text-xs">
          Validação cruzada 70/30 · Seletor de modelo · Dados limpos (IQR)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {cleanPoints.length < 3 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {points.length < 2
              ? "Dados insuficientes para regressão."
              : `${removed.nulls + removed.duplicates + removed.outliers} linha(s) removida(s) na limpeza — amostra insuficiente.`}
          </div>
        ) : (
          <>
            {/* ── Model selector + stats bar ─────────────────────────── */}
            <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <select
                data-testid="model-selector"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as ModelId)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-800"
              >
                {results.map((r) => (
                  <option key={r.def.id} value={r.def.id}>
                    {r.def.label} — {r.def.description}
                  </option>
                ))}
              </select>

              {current && (
                <span className="tabular-nums flex items-center gap-2 flex-wrap">
                  <span data-testid="stat-r2">
                    R² treino: <span className="font-semibold text-foreground">{current.fit.r2.toFixed(2)}</span>
                  </span>
                  <span data-testid="stat-testr2">
                    R² teste: <span className="font-semibold text-foreground">{current.cv.testR2.toFixed(2)}</span>
                  </span>
                  <span data-testid="stat-adjr2">
                    R² ajust: <span className="font-semibold text-foreground">{current.fit.adjR2.toFixed(2)}</span>
                  </span>
                  <span data-testid="stat-n">
                    N: <span className="font-semibold text-foreground">{cleanPoints.length}</span>
                  </span>
                  <span data-testid="stat-period">
                    Período: <span className="font-semibold text-foreground">{periodLabel}</span>
                  </span>
                </span>
              )}

              {totalRemoved > 0 && (
                <span
                  data-testid="clean-badge"
                  className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200"
                >
                  Limpeza: −{totalRemoved} ({removed.nulls} nulos, {removed.duplicates} dup, {removed.outliers} outliers)
                </span>
              )}
            </div>

            {/* ── Coefficients table ─────────────────────────────────── */}
            {current && current.fit.coefficients.length > 0 && (
              <div className="mb-2 overflow-x-auto">
                <table className="w-full text-[10px] border-collapse" data-testid="coef-table">
                  <thead>
                    <tr className="border-b border-slate-200 text-muted-foreground">
                      <th className="text-left py-1 pr-3">Preditor</th>
                      <th className="text-right py-1 pr-3">Coef</th>
                      <th className="text-right py-1">SE</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className="py-0.5 text-slate-500">(intercepto)</td>
                      <td className="text-right tabular-nums font-medium">{current.fit.intercept.toFixed(2)}</td>
                      <td className="text-right tabular-nums text-slate-400">{current.fit.interceptSe.toFixed(2)}</td>
                    </tr>
                    {current.fit.coefficients.map((c) => (
                      <tr key={c.name} className="border-b border-slate-100">
                        <td className="py-0.5">{c.name}</td>
                        <td className="text-right tabular-nums font-medium">{c.value.toFixed(4)}</td>
                        <td className="text-right tabular-nums text-slate-400">{c.se.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Scatter plot ───────────────────────────────────────── */}
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width="100%"
              height={H}
              role="img"
              aria-label="Regressão valor vs eficiência"
              data-testid="regression-svg"
              style={{ display: "block" }}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
                const v = maxY * f;
                return (
                  <g key={`y${i}`}>
                    <line x1={PAD.l} x2={W - PAD.r} y1={toY(v)} y2={toY(v)} stroke="#f1f5f9" strokeWidth={1} />
                    <text x={PAD.l - 6} y={toY(v) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
                      {v < 1000 ? "R$ 0" : `R$ ${(v / 1000).toFixed(0)}k`}
                    </text>
                  </g>
                );
              })}

              {/* Confidence band (always shown for reference) */}
              <polygon
                data-testid="confidence-band"
                points={bandPoly}
                fill="rgba(59,130,246,0.08)"
                stroke="none"
              />

              {/* Model curve (drawable models only) */}
              {drawable && curvePoints && (
                <polyline
                  data-testid="regression-line"
                  points={curvePoints}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                />
              )}

              {/* Non-drawable note */}
              {!drawable && (
                <text
                  x={W / 2}
                  y={PAD.t + plotH / 2}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#94a3b8"
                  data-testid="non-drawable-note"
                >
                  Mapa multidimensional — reta não projetável no eixo eficiência
                </text>
              )}

              <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={10} fill="#64748b">
                Eficiência (CPC × Conversão)
              </text>

              {cleanPoints.map((d, i) => {
                const kind = classify(d);
                const isHov = hov === i;
                const isHl = highlightId !== undefined && d.id === highlightId;
                return (
                  <circle
                    key={d.id}
                    data-testid="regression-dot"
                    data-color={residualColor(kind)}
                    cx={toX(d.eficiencia)}
                    cy={toY(d.valor)}
                    r={isHov ? 7 : 5}
                    fill={residualColor(kind)}
                    opacity={isHov ? 1 : 0.8}
                    stroke={isHov || isHl ? "#0f172a" : "none"}
                    strokeWidth={2}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHov(i)}
                    onMouseLeave={() => setHov(null)}
                  />
                );
              })}

              {hov !== null && cleanPoints[hov] && (() => {
                const d = cleanPoints[hov];
                const pred = simpleFit.predict(d.eficiencia);
                const dev = d.valor - pred;
                const tx = Math.min(toX(d.eficiencia) + 12, W - 210);
                const ty = Math.max(toY(d.valor) - 50, PAD.t);
                return (
                  <g data-testid="regression-tooltip">
                    <rect x={tx} y={ty} width={198} height={46} rx={4} fill="#0f172a" opacity={0.92} />
                    <text x={tx + 8} y={ty + 14} fontSize={11} fill="#e2e8f0">{d.nome.substring(0, 28)}</text>
                    <text x={tx + 8} y={ty + 28} fontSize={10} fill="#94a3b8">
                      real {formatBRLCompact(d.valor)} · prev {formatBRLCompact(Math.max(0, pred))}
                    </text>
                    <text x={tx + 8} y={ty + 40} fontSize={10} fill={dev >= 0 ? "#86efac" : "#fca5a5"}>
                      desvio {dev >= 0 ? "+" : ""}{formatBRLCompact(dev)}
                    </text>
                  </g>
                );
              })()}
            </svg>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default RegressionView;
