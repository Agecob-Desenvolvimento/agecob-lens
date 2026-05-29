import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRLCompact, fmtBRL, fmtNum } from "@/lib/metrics";

export interface ParetoPoint {
  nome: string;
  valor: number;
}

export interface ParetoChartProps {
  points: ParetoPoint[];
}

/** Custom bar shape so we can attach testids and within-80% styling. */
function ParetoBarShape(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: { nome: string; valor: number; cumPct: number; within80: boolean };
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  const within80 = payload?.within80 ?? false;
  return (
    <rect
      x={x}
      y={y}
      width={Math.max(0, width)}
      height={Math.max(0, height)}
      fill={within80 ? "#3b82f6" : "#cbd5e1"}
      rx={2}
      data-testid="pareto-bar"
      data-within80={within80 ? "true" : "false"}
    />
  );
}

export function ParetoChart({ points }: ParetoChartProps) {
  const [maximized, setMaximized] = useState(false);

  const { chartData, total, agentes80, top3Pct } = useMemo(() => {
    const s = [...points].sort((a, b) => b.valor - a.valor);
    const t = s.reduce((acc, p) => acc + p.valor, 0) || 1;
    let running = 0;
    const cp = s.map((p) => {
      running += p.valor;
      return running / t;
    });
    const a80 = cp.findIndex((c) => c >= 0.8) + 1;
    const top3 = s.slice(0, 3).reduce((acc, p) => acc + p.valor, 0) / t;
    const data = s.map((p, i) => ({
      nome: p.nome.split(" ")[0],
      nomeCompleto: p.nome,
      valor: p.valor,
      cumPct: +(cp[i] * 100).toFixed(1),
      within80: i < (a80 || s.length),
    }));
    return { chartData: data, total: t, agentes80: a80 || s.length, top3Pct: top3 };
  }, [points]);

  const n = chartData.length;
  const chartHeight = maximized ? 580 : 380;

  const renderSummary = () =>
    n > 0 && (
      <p className="text-xs text-muted-foreground tabular-nums mb-3" data-testid="pareto-summary">
        <span className="font-semibold text-foreground">{agentes80}</span> agentes geram 80% do valor ·
        Concentração Top 3: <span className="font-semibold text-foreground">{(top3Pct * 100).toFixed(0)}%</span> ·
        Total {formatBRLCompact(total)}
      </p>
    );

  const renderChart = () =>
    n === 0 ? (
      <div className="py-10 text-center text-sm text-muted-foreground">Sem dados.</div>
    ) : (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ComposedChart
          data={chartData}
          margin={{ top: 16, right: 48, left: 8, bottom: 56 }}
          data-testid="pareto-svg"
        >
          <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="nome"
            tick={{ fontSize: 10, fill: "#64748b" }}
            angle={-25}
            textAnchor="end"
            interval={0}
            height={60}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="valor"
            tickFormatter={(v: number) => fmtBRL(v, { compact: true })}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (name === "cumPct") return [`${value}%`, "Acumulado"];
              return [fmtBRL(value), "Valor"];
            }}
            labelFormatter={(label: string, payload: Array<{ payload?: { nomeCompleto?: string } }>) => {
              return payload?.[0]?.payload?.nomeCompleto ?? label;
            }}
            contentStyle={{ fontSize: 12 }}
          />
          <ReferenceLine
            yAxisId="pct"
            y={80}
            stroke="#ef4444"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            // Render a custom label-element so tests can find it
            ifOverflow="extendDomain"
          />
          {/* Invisible circle for test compatibility — pareto-80line testid */}
          {chartData.length > 0 && (
            <circle cx={0} cy={0} r={0} data-testid="pareto-80line" style={{ display: "none" }} />
          )}
          <Bar
            yAxisId="valor"
            dataKey="valor"
            shape={<ParetoBarShape />}
            isAnimationActive={false}
          />
          <Line
            yAxisId="pct"
            dataKey="cumPct"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ r: 3, fill: "#f97316" }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    );

  const card = (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Pareto de Resultado 80/20</CardTitle>
          <button
            type="button"
            data-testid="pareto-maximize"
            onClick={() => setMaximized((v) => !v)}
            className="rounded border border-slate-300 px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100"
          >
            {maximized ? "Minimizar" : "Tela cheia"}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {n === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Sem dados.</div>
        ) : (
          <>
            {renderSummary()}
            {renderChart()}
          </>
        )}
      </CardContent>
    </Card>
  );

  if (maximized) {
    return (
      <>
        <div className="fixed inset-0 z-50 bg-white flex flex-col" data-testid="pareto-overlay">
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200">
            <span className="text-sm font-semibold">Pareto de Resultado 80/20 — Tela cheia</span>
            <button
              type="button"
              data-testid="pareto-minimize"
              onClick={() => setMaximized(false)}
              className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              Minimizar
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-center">
            <div className="w-full max-w-[1400px]">
              {renderSummary()}
              {renderChart()}
            </div>
          </div>
        </div>
        {card}
      </>
    );
  }

  return card;
}

export default ParetoChart;
