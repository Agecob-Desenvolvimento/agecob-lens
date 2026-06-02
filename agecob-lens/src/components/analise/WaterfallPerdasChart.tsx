import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRLCompact } from "@/lib/metrics";

export interface WaterfallStage {
  label: string;
  value: number;
  color: string;
}

interface WaterfallPerdasChartProps {
  stages: WaterfallStage[];
}

const W = 560;
const H = 160;
const PAD = { l: 24, r: 24, t: 24, b: 40 };

export function WaterfallPerdasChart({ stages }: WaterfallPerdasChartProps) {
  if (stages.length < 3) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Cascata de Perdas</CardTitle>
          <CardDescription className="text-xs">
            Onde o dinheiro morreu — do acordado ao efetivamente recebido.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground py-8 text-center">Sem dados no período</p>
        </CardContent>
      </Card>
    );
  }

  // Derive from waterfall stages: [0]=Acordado, [1]=Não Recebido (neg), [2]=Recebido
  const total = Math.abs(stages[0].value) || 1;
  const received = total + (stages[1]?.value ?? 0); // stage[1] is negative
  const lost = total - received;

  const pctRecebido = Math.round((received / total) * 100);
  const pctPerdido = 100 - pctRecebido;

  const plotW = W - PAD.l - PAD.r;
  const barH = 40;
  const barY = PAD.t + 12;

  const receivedW = Math.max((pctRecebido / 100) * plotW, pctRecebido > 0 ? 4 : 0);
  const lostW = Math.max((pctPerdido / 100) * plotW, pctPerdido > 0 ? 4 : 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Cascata de Perdas</CardTitle>
        <CardDescription className="text-xs">
          Onde o dinheiro morreu — do acordado ao efetivamente recebido.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          data-testid="waterfall-svg"
          style={{ display: "block" }}
        >
          {/* 100% stacked bar */}
          <g>
            {/* Background track */}
            <rect
              x={PAD.l}
              y={barY}
              width={plotW}
              height={barH}
              rx={8}
              fill="#f1f5f9"
            />

            {/* Received segment (green) */}
            {receivedW > 0 && (
              <rect
                x={PAD.l}
                y={barY}
                width={receivedW}
                height={barH}
                rx={pctPerdido === 0 ? 8 : 0}
                fill="#059669"
              />
            )}

            {/* Lost segment (red) */}
            {lostW > 0 && (
              <rect
                x={PAD.l + receivedW}
                y={barY}
                width={lostW}
                height={barH}
                rx={pctRecebido === 0 ? 8 : 0}
                fill="#f43f5e"
              />
            )}

            {/* Percentage labels inside/above bars */}
            {pctRecebido >= 12 && (
              <text
                x={PAD.l + receivedW / 2}
                y={barY + barH / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={14}
                fontWeight={700}
                fill="#ffffff"
              >
                {pctRecebido}%
              </text>
            )}
            {pctPerdido >= 12 && (
              <text
                x={PAD.l + receivedW + lostW / 2}
                y={barY + barH / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={14}
                fontWeight={700}
                fill="#ffffff"
              >
                {pctPerdido}%
              </text>
            )}

            {/* Labels above the bar for narrow segments */}
            {pctRecebido < 12 && pctRecebido > 0 && (
              <text
                x={PAD.l + receivedW / 2}
                y={barY - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill="#059669"
              >
                {pctRecebido}%
              </text>
            )}
            {pctPerdido < 12 && pctPerdido > 0 && (
              <text
                x={PAD.l + receivedW + lostW / 2}
                y={barY - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill="#f43f5e"
              >
                {pctPerdido}%
              </text>
            )}
          </g>

          {/* Total label */}
          <text
            x={PAD.l}
            y={H - 4}
            textAnchor="start"
            fontSize={11}
            fontWeight={600}
            fill="#475569"
          >
            Total: {formatBRLCompact(total)}
          </text>

          {/* Received label */}
          <text
            x={PAD.l + plotW * 0.28}
            y={H - 4}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill="#059669"
          >
            Pago: {formatBRLCompact(received)}
          </text>

          {/* Lost label */}
          <text
            x={PAD.l + plotW * 0.72}
            y={H - 4}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill="#f43f5e"
          >
            Perdido: {formatBRLCompact(lost)}
          </text>

          {/* Legend dots */}
          <circle cx={PAD.l} cy={barY + barH + 18} r={4} fill="#059669" />
          <text x={PAD.l + 8} y={barY + barH + 22} fontSize={10} fill="#475569">Pago</text>

          <circle cx={PAD.l + 80} cy={barY + barH + 18} r={4} fill="#f43f5e" />
          <text x={PAD.l + 88} y={barY + barH + 22} fontSize={10} fill="#475569">Perdido</text>
        </svg>
      </CardContent>
    </Card>
  );
}

export default WaterfallPerdasChart;
