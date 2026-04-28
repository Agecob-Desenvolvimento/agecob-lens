import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtBRL, fmtNum } from "@/lib/metrics";

export interface EffortResultDatum {
  agente: string;
  qtd_acionamentos: number;
  valor_acordos: number;
  bu?: "AUTOS" | "CONSUMER";
}

interface EffortResultScatterProps {
  title: string;
  data: EffortResultDatum[];
  loading?: boolean;
  empty?: boolean;
}

const BU_COLOR: Record<string, string> = {
  AUTOS: "hsl(142, 71%, 45%)",
  CONSUMER: "hsl(217, 91%, 55%)",
  default: "hsl(264, 64%, 56%)",
};

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function EffortResultScatter({ title, data, loading, empty }: EffortResultScatterProps) {
  const xMedian = median(data.map((d) => d.qtd_acionamentos));
  const yMedian = median(data.map((d) => d.valor_acordos));
  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-base font-semibold leading-snug">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">
          Quadrantes: ↗ alto esforço/alto resultado · ↖ baixo esforço/alto resultado (estrelas) · ↘ alto esforço/baixo resultado (revisar) · ↙ baixo esforço/baixo resultado.
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading ? (
          <Skeleton className="h-80 w-full" />
        ) : empty || !data.length ? (
          <p className="text-sm text-muted-foreground">Sem dados.</p>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <ScatterChart margin={{ top: 16, right: 24, left: 8, bottom: 24 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" />
              <XAxis
                type="number"
                dataKey="qtd_acionamentos"
                name="Acionamentos"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => fmtNum(v)}
                label={{ value: "Acionamentos (esforço)", position: "insideBottom", offset: -10, fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="valor_acordos"
                name="Valor Acordos"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => fmtBRL(v, { compact: true })}
                label={{ value: "Valor Acordos (resultado)", angle: -90, position: "insideLeft", fontSize: 11 }}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: 12,
                }}
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload as EffortResultDatum;
                  return (
                    <div className="rounded-md border bg-background p-2 text-xs space-y-1 shadow-md">
                      <p className="font-semibold">{d.agente}</p>
                      <p>Acionamentos: <span className="tabular-nums font-semibold">{fmtNum(d.qtd_acionamentos)}</span></p>
                      <p>Valor Acordos: <span className="tabular-nums font-semibold">{fmtBRL(d.valor_acordos)}</span></p>
                      {d.bu ? <p className="text-muted-foreground">BU: {d.bu}</p> : null}
                    </div>
                  );
                }}
              />
              {xMedian > 0 ? <ReferenceLine x={xMedian} stroke="#000000" strokeDasharray="4 4" strokeWidth={1.5} /> : null}
              {yMedian > 0 ? <ReferenceLine y={yMedian} stroke="#000000" strokeDasharray="4 4" strokeWidth={1.5} /> : null}
              <Scatter data={data} fill={BU_COLOR.default}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.bu ? BU_COLOR[d.bu] : BU_COLOR.default} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default EffortResultScatter;
