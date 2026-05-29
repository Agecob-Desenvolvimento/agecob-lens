import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtPct, formatBRLCompact } from "@/lib/metrics";

export interface BulletDatum {
  value: number;
  meta: number;
  /**
   * Cumulative band upper bounds along the bullet scale.
   * - poor: end of the "critical" band (low-end on normal scale)
   * - ok:   end of the "attention" band
   * - good: max of the scale (end of the "good" band)
   */
  ranges: { poor: number; ok: number; good: number };
  unit: "%" | "BRL";
  /** When true, lower values are better (e.g. Exceções). Bands flip. */
  inverted?: boolean;
}

export interface BulletPanelData {
  cpc: BulletDatum;
  conversao: BulletDatum;
  primeiraParcela: BulletDatum;
  excecoes: BulletDatum;
}

interface BulletChartsPanelProps {
  data: BulletPanelData;
}

interface BulletRowProps {
  label: string;
  datum: BulletDatum;
}

function formatVal(value: number, unit: BulletDatum["unit"]): string {
  return unit === "BRL" ? formatBRLCompact(value) : fmtPct(value);
}

function BulletRow({ label, datum }: BulletRowProps) {
  const { value, meta, ranges, unit, inverted } = datum;
  const max = ranges.good > 0 ? ranges.good : 1;
  const clamp = (n: number) => Math.min(100, Math.max(0, (n / max) * 100));
  const pctVal = clamp(value);
  const pctMeta = clamp(meta);
  const pctPoor = clamp(ranges.poor);
  const pctOk = clamp(ranges.ok);

  // Bands: when not inverted → low end is "poor" (rose), high end is "good" (emerald).
  // When inverted (lower=better) → low end is "good", high end is "poor".
  const leftClass = inverted ? "bg-success-soft" : "bg-danger-soft";
  const midClass = inverted ? "bg-warning-soft" : "bg-warning-soft";
  const rightClass = inverted ? "bg-danger-soft" : "bg-success-soft";

  const isGood = inverted ? value <= meta : value >= meta;
  const isBad = inverted ? value > meta * 1.2 : value < meta * 0.8;

  const barClass = isBad
    ? "bg-danger"
    : isGood
      ? "bg-success"
      : "bg-warning";

  const valueColorClass = isBad
    ? "text-danger-fg"
    : isGood
      ? "text-success-fg"
      : "text-warning-fg";

  return (
    <div
      className="flex items-center gap-3"
      data-testid={`bullet-row-${label}`}
    >
      <div className="w-20 flex-shrink-0 text-right">
        <div className="text-[11px] font-semibold text-slate-600">{label}</div>
        <div className="text-[10px] text-slate-400">
          meta: {formatVal(meta, unit)}
        </div>
      </div>
      <div className="relative h-6 flex-1">
        <div className="absolute inset-0 flex overflow-hidden rounded-sm">
          <div className={leftClass} style={{ width: `${pctPoor}%` }} />
          <div
            className={midClass}
            style={{ width: `${Math.max(0, pctOk - pctPoor)}%` }}
          />
          <div
            className={rightClass}
            style={{ width: `${Math.max(0, 100 - pctOk)}%` }}
          />
        </div>
        <div
          role="presentation"
          data-testid={`bullet-bar-${label}`}
          className={`absolute left-0 top-[5px] bottom-[5px] rounded-[2px] transition-[width] duration-400 ${barClass}`}
          style={{ width: `${pctVal}%` }}
        />
        <div
          role="presentation"
          data-testid={`bullet-meta-${label}`}
          className="absolute top-0 bottom-0 w-[2px] bg-foreground"
          style={{ left: `${pctMeta}%` }}
        />
      </div>
      <span
        className={`w-14 flex-shrink-0 text-right text-[13px] font-bold tabular-nums ${valueColorClass}`}
      >
        {formatVal(value, unit)}
      </span>
    </div>
  );
}

export function BulletChartsPanel({ data }: BulletChartsPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">
          Performance vs Meta
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Bullet charts — valor real vs meta da equipe. Linha preta = meta.
        </p>
      </CardHeader>
      <CardContent className="space-y-3.5">
        <BulletRow label="Taxa contato" datum={data.cpc} />
        <BulletRow label="Conversão" datum={data.conversao} />
        <BulletRow label="1ª Parcela" datum={data.primeiraParcela} />
        <BulletRow label="Exceções" datum={data.excecoes} />

        <div className="mt-3 flex flex-wrap gap-3.5 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-danger" />
            crítico
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-warning" />
            atenção
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-success" />
            bom
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3.5 w-2 bg-foreground" />
            meta
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default BulletChartsPanel;
