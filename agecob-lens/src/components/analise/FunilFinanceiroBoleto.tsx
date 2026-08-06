import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRLCompact } from "@/lib/metrics";

interface FunilFinanceiroBoletoProps {
  acordado: number;
  recebido: number;
}

const W = 420;
const H = 200;
const PAD = { l: 24, r: 24, t: 16, b: 16 };
const PLOT_W = W - PAD.l - PAD.r;

export function FunilFinanceiroBoleto({ acordado, recebido }: FunilFinanceiroBoletoProps) {
  const pct = acordado > 0 ? Math.round((recebido / acordado) * 100) : 0;
  const barH = 36;
  const topY = PAD.t + 8;
  const midY = topY + barH + 32;
  const botY = midY + barH;
  const barW = PLOT_W * 0.7;
  const barX = PAD.l + (PLOT_W - barW) / 2;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Funil Financeiro</CardTitle>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          data-testid="funil-financeiro-svg"
          style={{ display: "block" }}
        >
          {/* Top bar: Acordado */}
          <rect x={barX} y={topY} width={barW} height={barH} rx={6} fill="#0284c7" opacity={0.15} />
          <rect x={barX} y={topY} width={4} height={barH} rx={2} fill="#0284c7" />
          <text x={barX + 14} y={topY + barH / 2 + 1} dominantBaseline="middle" fontSize={12} fontWeight={600} fill="#0284c7">
            Acordado
          </text>
          <text x={barX + barW - 14} y={topY + barH / 2 + 1} textAnchor="end" dominantBaseline="middle" fontSize={13} fontWeight={700} fill="hsl(var(--chart-ink-2))">
            {formatBRLCompact(acordado)}
          </text>

          {/* Center percentage */}
          <rect x={W / 2 - 28} y={topY + barH + 10} width={56} height={24} rx={12} fill="hsl(var(--chart-grid))" />
          <text x={W / 2} y={topY + barH + 26} textAnchor="middle" dominantBaseline="middle" fontSize={14} fontWeight={700} fill="#059669">
            {pct}%
          </text>

          {/* Connector lines */}
          <line x1={barX + 6} y1={topY + barH} x2={barX + 6} y2={midY} stroke="hsl(var(--chart-axis))" strokeWidth={1} />
          <line x1={barX + barW - 6} y1={topY + barH} x2={barX + barW - 6} y2={midY} stroke="hsl(var(--chart-axis))" strokeWidth={1} />

          {/* Bottom bar: Recebido */}
          <rect x={barX} y={midY} width={barW} height={barH} rx={6} fill="#059669" opacity={0.15} />
          <rect x={barX} y={midY} width={4} height={barH} rx={2} fill="#059669" />
          <text x={barX + 14} y={midY + barH / 2 + 1} dominantBaseline="middle" fontSize={12} fontWeight={600} fill="#059669">
            Recebido
          </text>
          <text x={barX + barW - 14} y={midY + barH / 2 + 1} textAnchor="end" dominantBaseline="middle" fontSize={13} fontWeight={700} fill="hsl(var(--chart-ink-2))">
            {formatBRLCompact(recebido)}
          </text>
        </svg>
      </CardContent>
    </Card>
  );
}

export default FunilFinanceiroBoleto;
