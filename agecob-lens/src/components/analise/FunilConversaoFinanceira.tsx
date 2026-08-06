import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatBRLCompact } from "@/lib/metrics";

interface FunilConversaoFinanceiraProps {
  acordos: number;
  boletosEmitidos: number;
  boletosPagos: number;
}

const W = 650;
const H = 280;
const PAD = { l: 24, r: 24, t: 8, b: 8 };
const PLOT_W = W - PAD.l - PAD.r;

interface Stage {
  label: string;
  value: number;
  color: string;
  isBRL: boolean;
}

export function FunilConversaoFinanceira({
  acordos,
  boletosEmitidos,
  boletosPagos,
}: FunilConversaoFinanceiraProps) {
  const tx1 = acordos > 0 ? Math.round((boletosEmitidos / acordos) * 100) : 0;
  const tx2 = boletosEmitidos > 0 ? Math.round((boletosPagos / boletosEmitidos) * 100) : 0;

  const stages: Stage[] = [
    { label: "Acordos", value: acordos, color: "#0284c7", isBRL: false },
    { label: "Boletos Emitidos", value: boletosEmitidos, color: "#0ea5e9", isBRL: false },
    { label: "Boletos Pagos", value: boletosPagos, color: "#22c55e", isBRL: false },
  ];

  const barWidths = [0.7, 0.5, 0.32];
  const barH = 32;
  const gap = 24;
  const dropH = 20;

  const stageY = (i: number) => {
    let y = PAD.t + 8;
    for (let s = 0; s < i; s++) {
      y += barH + dropH + gap;
    }
    return y;
  };

  const formatValue = (s: Stage): string => {
    if (s.isBRL) return formatBRLCompact(s.value);
    return s.value.toLocaleString("pt-BR");
  };

  const barX = (i: number) => PAD.l + (PLOT_W - PLOT_W * barWidths[i]) / 2;
  const barW = (i: number) => PLOT_W * barWidths[i];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Funil Operacional</CardTitle>
        <CardDescription className="text-xs">
          Quantidade: acordos → boletos emitidos → boletos pagos
        </CardDescription>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          data-testid="funil-conversao-svg"
          style={{ display: "block" }}
        >
          {stages.map((stage, i) => {
            const y = stageY(i);
            const bx = barX(i);
            const bw = barW(i);

            return (
              <g key={stage.label}>
                {/* Bar background with rounded corners */}
                <rect
                  x={bx}
                  y={y}
                  width={bw}
                  height={barH}
                  rx={6}
                  fill={stage.color}
                  opacity={0.15}
                />
                {/* Colored left-edge indicator */}
                <rect
                  x={bx}
                  y={y}
                  width={4}
                  height={barH}
                  rx={2}
                  fill={stage.color}
                />
                {/* Stage label */}
                <text
                  x={bx + 14}
                  y={y + barH / 2 + 1}
                  textAnchor="start"
                  dominantBaseline="middle"
                  fontSize={12}
                  fontWeight={600}
                  fill={stage.color}
                >
                  {stage.label}
                </text>
                {/* Value — below bar for BRL stage to avoid label collision */}
                <text
                  x={stage.isBRL ? bx + 14 : bx + bw - 14}
                  y={stage.isBRL ? y + barH + 16 : y + barH / 2 + 1}
                  textAnchor={stage.isBRL ? "start" : "end"}
                  dominantBaseline="middle"
                  fontSize={12}
                  fontWeight={700}
                  fill={stage.isBRL ? "hsl(var(--chart-ink-2))" : "hsl(var(--chart-ink-2))"}
                >
                  {formatValue(stage)}
                </text>
                {/* Drop percentage between stages — survivors + loss */}
                {i < stages.length - 1 && (
                  <g>
                    <text
                      x={W / 2}
                      y={y + barH + dropH - 3}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={11}
                      fontWeight={500}
                      fill="hsl(var(--chart-label))"
                    >
                      ↓ {i === 0 ? tx1 : tx2}% conv.
                    </text>
                    <text
                      x={W / 2}
                      y={y + barH + dropH + 11}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={11}
                      fontWeight={700}
                      fill="#dc2626"
                    >
                      −{100 - (i === 0 ? tx1 : tx2)}% perdidos
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Connector lines between bars */}
          {stages.slice(0, -1).map((_, i) => {
            const yTop = stageY(i) + barH;
            const yBot = stageY(i + 1);
            const xL = barX(i) + 6;
            const xR = barX(i) + barW(i) - 6;
            const xL2 = barX(i + 1) + 6;
            const xR2 = barX(i + 1) + barW(i + 1) - 6;

            return (
              <g key={`conn-${i}`}>
                <line
                  x1={xL}
                  y1={yTop}
                  x2={xL2}
                  y2={yBot}
                  stroke="hsl(var(--chart-axis))"
                  strokeWidth={1}
                />
                <line
                  x1={xR}
                  y1={yTop}
                  x2={xR2}
                  y2={yBot}
                  stroke="hsl(var(--chart-axis))"
                  strokeWidth={1}
                />
              </g>
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
}

export default FunilConversaoFinanceira;
