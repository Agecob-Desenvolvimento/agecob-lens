import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRLCompact } from "@/lib/metrics";
import { linearRegression, type Point } from "@/lib/regression";
import {
  fetchRegressionModels,
  type RegressionModelResult,
  type RegressionCleaningMeta,
} from "@/services/api";
import type { ScatterPoint } from "./regressionMocks";

// ── Types ──────────────────────────────────────────────────────────────────

type ModelId = "simple" | "loglog" | "poly2" | "volume" | "full";

interface ApiResult {
  meta: RegressionCleaningMeta;
  modelos: RegressionModelResult[];
}

// ── Predict y from eficiencia for drawable models ──────────────────────────

function predictAtEfficiencia(
  modelId: ModelId,
  modelo: RegressionModelResult,
  eff: number,
): number {
  const coef = (name: string) => modelo.coefficients.find((c) => c.name === name)?.value ?? 0;
  switch (modelId) {
    case "simple":
      return modelo.intercept + coef("x") * eff;
    case "loglog": {
      const eps = 1e-9;
      const lnY = modelo.intercept + coef("ln(x)") * Math.log(Math.max(eff, eps));
      return Math.exp(lnY);
    }
    case "poly2":
      return modelo.intercept + coef("x") * eff + coef("x²") * (eff * eff);
    default:
      return 0;
  }
}

// ── R² strength label ─────────────────────────────────────────────────────

function r2Label(r2: number): { text: string; color: string } {
  if (r2 >= 0.70) return { text: "forte", color: "text-emerald-600 dark:text-emerald-400" };
  if (r2 >= 0.40) return { text: "moderada", color: "text-amber-600 dark:text-amber-400" };
  if (r2 >= 0.15) return { text: "fraca", color: "text-amber-700 dark:text-amber-300" };
  return { text: "muito fraca", color: "text-rose-600 dark:text-rose-400" };
}

// ── Chart constants ────────────────────────────────────────────────────────

const W = 720;
const H = 280;
const PAD = { l: 60, r: 24, t: 16, b: 44 };

type Residual = "super" | "expected" | "sub";

function residualColor(kind: Residual): string {
  if (kind === "super") return "#22c55e";
  if (kind === "sub") return "#ef4444";
  return "hsl(var(--chart-label))";
}

// ── Props ──────────────────────────────────────────────────────────────────

export interface RegressionViewProps {
  points: ScatterPoint[];
  highlightId?: string;
  periodLabel?: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export function RegressionView({ points, highlightId, periodLabel = "periodo atual" }: RegressionViewProps) {
  const [selectedModel, setSelectedModel] = useState<ModelId>("volume");
  const [hov, setHov] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiResult, setApiResult] = useState<ApiResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // ── Call scikit-learn backend whenever points change ──────────────────
  useEffect(() => {
    if (points.length < 2) {
      setApiResult(null);
      setApiError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setApiError(null);

    const payload = points.map((p) => ({
      id: p.id,
      nome: p.nome,
      eficiencia: p.eficiencia,
      valor: p.valor,
      acionamentos: p.acionamentos,
      contatos: p.contatos,
      cpc: p.cpc,
      conversao: p.conversao,
    }));

    fetchRegressionModels(payload)
      .then((envelope) => {
        if (cancelled) return;
        if (envelope.errors?.length) {
          setApiError(envelope.errors.map((e) => e.message).join("; "));
          setApiResult(null);
        } else if (envelope.data?.length) {
          setApiResult(envelope.data[0]);
          setApiError(null);
        } else {
          setApiResult(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setApiError(err instanceof Error ? err.message : "Erro desconhecido");
        setApiResult(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [points]);

  // ── Current model ─────────────────────────────────────────────────────
  const current = useMemo(
    () => apiResult?.modelos.find((m) => m.id === selectedModel) ?? null,
    [apiResult, selectedModel],
  );

  // ── Find best model by test R² ────────────────────────────────────────
  const bestByTest = useMemo(
    () => apiResult?.modelos.reduce((best, m) => (m.r2_test > best.r2_test ? m : best), apiResult.modelos[0]) ?? null,
    [apiResult],
  );

  const cleaningMeta = apiResult?.meta;
  const totalRemoved = cleaningMeta
    ? cleaningMeta.removed_nulls + cleaningMeta.removed_duplicates + cleaningMeta.removed_outliers
    : 0;

  // ── Simple OLS for residual classification (scatter dots) ─────────────
  const simpleFit = useMemo(() => {
    const pts: Point[] = points.map((p) => ({ x: p.eficiencia, y: p.valor }));
    return linearRegression(pts);
  }, [points]);

  // ── Chart bounds ───────────────────────────────────────────────────────
  const { maxEff, maxY } = useMemo(() => {
    if (!points.length) return { maxEff: 1, maxY: 1 };
    return {
      maxEff: Math.max(...points.map((p) => p.eficiencia)) * 1.1 || 1,
      maxY: Math.max(...points.map((p) => p.valor)) * 1.1 || 1,
    };
  }, [points]);

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
  const drawable = current?.drawable ?? false;
  const curvePoints = useMemo(() => {
    if (!drawable || !current) return "";
    const steps = 100;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const eff = (i / steps) * maxEff;
      const val = predictAtEfficiencia(current.id as ModelId, current, eff);
      pts.push(`${toX(eff).toFixed(1)},${toY(Math.max(0, val)).toFixed(1)}`);
    }
    return pts.join(" ");
  }, [drawable, current, maxEff, toX, toY]);

  // ── Confidence band ────────────────────────────────────────────────────
  const xStart = 0, xEnd = maxEff;
  const bandPoly = [
    `${toX(xStart)},${toY(Math.max(0, simpleFit.predict(xStart) + band))}`,
    `${toX(xEnd)},${toY(Math.max(0, simpleFit.predict(xEnd) + band))}`,
    `${toX(xEnd)},${toY(Math.max(0, simpleFit.predict(xEnd) - band))}`,
    `${toX(xStart)},${toY(Math.max(0, simpleFit.predict(xStart) - band))}`,
  ].join(" ");

  const modeloCount = apiResult?.modelos.length ?? 0;

  // ── Business insight line ─────────────────────────────────────────────
  const insight = useMemo(() => {
    if (!current || !bestByTest) return "";
    const r2 = current.r2_test;
    const strength = r2Label(r2);
    const mainPred = current.coefficients
      .slice()
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];

    if (current.id === "volume" || current.id === "full") {
      return `Volume de trabalho explica ${(r2 * 100).toFixed(0)}% da variação de resultado entre agentes: relação ${strength.text}.`;
    }
    if (current.id === "simple") {
      return `Eficiência operacional (CPC × conversão) sozinha explica apenas ${(r2 * 100).toFixed(0)}%: use o modelo Volume para ver o fator dominante.`;
    }
    return `Modelo "${current.label}" explica ${(r2 * 100).toFixed(0)}% da variação entre agentes: relação ${strength.text}.`;
  }, [current, bestByTest]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Regressao de Desempenho</CardTitle>
        <CardDescription className="text-xs">
          O que explica a diferença de resultado entre agentes?
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="py-6 text-center text-sm text-muted-foreground" data-testid="regression-loading">
            Calculando modelos...
          </div>
        )}

        {apiError && !loading && (
          <div className="py-4 text-center space-y-2" data-testid="regression-error">
            <p className="text-sm text-rose-600 dark:text-rose-400">{apiError}</p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded px-3 py-1.5 inline-block" data-testid="mock-hint">
              Backend scikit-learn nao encontrado. Inicie <code className="bg-amber-100 dark:bg-amber-950/60 px-1 rounded">uvicorn main:app</code>.
            </p>
          </div>
        )}

        {!loading && !apiError && points.length < 2 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Dados insuficientes.
          </div>
        )}

        {!loading && !apiError && points.length >= 2 && modeloCount === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {totalRemoved > 0
              ? `${totalRemoved} linha(s) removida(s) na limpeza: amostra insuficiente.`
              : "Modelos nao disponiveis."}
          </div>
        )}

        {!loading && !apiError && modeloCount > 0 && current && (
          <>
            {/* ── Insight bar ──────────────────────────────────────────── */}
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300" data-testid="insight-bar">
              <select
                data-testid="model-selector"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as ModelId)}
                className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-card px-2 py-1 text-[11px] text-slate-800 dark:text-slate-200"
              >
                {(apiResult?.modelos ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}: {m.description}
                  </option>
                ))}
              </select>

              <span className={`tabular-nums font-semibold ${r2Label(current.r2_test).color}`}>
                R² = {current.r2_test.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400">
                {cleaningMeta?.clean_count ?? points.length} agentes
              </span>

              {totalRemoved > 0 && cleaningMeta && (
                <span
                  data-testid="clean-badge"
                  className="rounded-full bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70"
                >
                  −{totalRemoved} outliers
                </span>
              )}
            </div>

            {/* ── Business insight ────────────────────────────────────── */}
            {insight && (
              <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed" data-testid="insight-text">
                {insight}
              </p>
            )}

            {/* ── Scatter plot ───────────────────────────────────────── */}
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width="100%"
              height={H}
              role="img"
              aria-label="Regressao valor vs eficiencia"
              data-testid="regression-svg"
              style={{ display: "block" }}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
                const v = maxY * f;
                return (
                  <g key={`y${i}`}>
                    <line x1={PAD.l} x2={W - PAD.r} y1={toY(v)} y2={toY(v)} stroke="#f1f5f9" strokeWidth={1} />
                    <text x={PAD.l - 6} y={toY(v) + 3} textAnchor="end" fontSize={9} fill="hsl(var(--chart-label))">
                      {v < 1000 ? "R$ 0" : `R$ ${(v / 1000).toFixed(0)}k`}
                    </text>
                  </g>
                );
              })}

              <polygon
                data-testid="confidence-band"
                points={bandPoly}
                fill="rgba(59,130,246,0.08)"
                stroke="none"
              />

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

              {!drawable && (
                <text
                  x={W / 2}
                  y={PAD.t + plotH / 2}
                  textAnchor="middle"
                  fontSize={10}
                  fill="hsl(var(--chart-label))"
                  data-testid="non-drawable-note"
                >
                  Mapa multidimensional: reta nao projetavel no eixo eficiencia
                </text>
              )}

              <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={10} fill="#64748b">
                Eficiencia (CPC x Conversao)
              </text>

              {points.map((d, i) => {
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

              {hov !== null && points[hov] && (() => {
                const d = points[hov];
                const pred = simpleFit.predict(d.eficiencia);
                const dev = d.valor - pred;
                const tx = Math.min(toX(d.eficiencia) + 12, W - 210);
                const ty = Math.max(toY(d.valor) - 50, PAD.t);
                return (
                  <g data-testid="regression-tooltip">
                    <rect x={tx} y={ty} width={198} height={46} rx={4} fill="#0f172a" opacity={0.92} />
                    <text x={tx + 8} y={ty + 14} fontSize={11} fill="#e2e8f0">{d.nome.substring(0, 28)}</text>
                    <text x={tx + 8} y={ty + 28} fontSize={10} fill="hsl(var(--chart-label))">
                      real {formatBRLCompact(d.valor)} · prev {formatBRLCompact(Math.max(0, pred))}
                    </text>
                    <text x={tx + 8} y={ty + 40} fontSize={10} fill={dev >= 0 ? "#86efac" : "#fca5a5"}>
                      desvio {dev >= 0 ? "+" : ""}{formatBRLCompact(dev)}
                    </text>
                  </g>
                );
              })()}
            </svg>

            {/* ── Technical details (collapsible) ─────────────────────── */}
            <div className="mt-2">
              <button
                data-testid="toggle-details"
                onClick={() => setShowDetails((v) => !v)}
                className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
              >
                {showDetails ? "Ocultar detalhes tecnicos" : "Detalhes tecnicos"}
              </button>
              {showDetails && current.coefficients.length > 0 && (
                <div className="mt-1 overflow-x-auto">
                  <table className="w-full text-[10px] border-collapse" data-testid="coef-table">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-border text-muted-foreground">
                        <th className="text-left py-1 pr-3">Preditor</th>
                        <th className="text-right py-1 pr-3">Coef</th>
                        <th className="text-right py-1">SE</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-100 dark:border-border">
                        <td className="py-0.5 text-slate-500 dark:text-slate-400">(intercepto)</td>
                        <td className="text-right tabular-nums font-medium">{current.intercept.toFixed(2)}</td>
                        <td className="text-right tabular-nums text-slate-400">{current.intercept_se.toFixed(2)}</td>
                      </tr>
                      {current.coefficients.map((c) => (
                        <tr key={c.name} className="border-b border-slate-100 dark:border-border">
                          <td className="py-0.5">{c.name}</td>
                          <td className="text-right tabular-nums font-medium">{c.value.toFixed(4)}</td>
                          <td className="text-right tabular-nums text-slate-400">{c.se.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default RegressionView;
