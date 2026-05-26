import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtNum, formatBRLCompact } from "@/lib/metrics";

export interface FunilData {
  acionamentos: number;
  contatos: number;
  acordos: number;
  primeiraParcela: number;
  /**
   * Total agreement value used as the denominator for the "Efetividade" stage
   * (1ª Parcela / Valor Acordos). Optional — when omitted, the last conversion
   * is computed as primeiraParcela / acordos, which is rarely meaningful.
   */
  valorAcordos?: number;
}

interface FunilConversaoProps {
  data: FunilData;
}

interface FunilStep {
  label: string;
  value: number;
  display: string;
  pct: number | null;
  pctLabel: string | null;
  barWidth: number;
  /** semantic role for color */
  role: "primary" | "info" | "warning" | "success";
}

function buildSteps(d: FunilData): FunilStep[] {
  const max = d.acionamentos || 1;
  const cpc = d.acionamentos > 0 ? (d.contatos / d.acionamentos) * 100 : 0;
  const conv = d.contatos > 0 ? (d.acordos / d.contatos) * 100 : 0;
  const efetiv =
    d.valorAcordos && d.valorAcordos > 0
      ? (d.primeiraParcela / d.valorAcordos) * 100
      : 0;

  // Last step bar width: normalize via acordos count × efetiv ratio (visual)
  const lastBar = ((d.acordos / max) * 100) * (efetiv / 100);

  return [
    {
      label: "Acionamentos",
      value: d.acionamentos,
      display: fmtNum(d.acionamentos),
      pct: null,
      pctLabel: null,
      barWidth: 100,
      role: "primary",
    },
    {
      label: "Contatos",
      value: d.contatos,
      display: fmtNum(d.contatos),
      pct: cpc,
      pctLabel: "CPC",
      barWidth: (d.contatos / max) * 100,
      role: "info",
    },
    {
      label: "Acordos",
      value: d.acordos,
      display: fmtNum(d.acordos),
      pct: conv,
      pctLabel: "Conv.",
      barWidth: (d.acordos / max) * 100,
      role: "warning",
    },
    {
      label: "1ª Parcela",
      value: d.primeiraParcela,
      display: formatBRLCompact(d.primeiraParcela),
      pct: efetiv,
      pctLabel: "Efetiv.",
      barWidth: lastBar,
      role: "success",
    },
  ];
}

const ROLE_BG: Record<FunilStep["role"], string> = {
  primary: "bg-sky-600",
  info: "bg-sky-400",
  warning: "bg-warning",
  success: "bg-success",
};

export function FunilConversao({ data }: FunilConversaoProps) {
  const steps = buildSteps(data);
  const lossAcionContat =
    data.acionamentos > 0
      ? (1 - data.contatos / data.acionamentos) * 100
      : 0;
  const lossContatAcord =
    data.contatos > 0 ? (1 - data.acordos / data.contatos) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">
          Funil de Conversão
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Perda percentual por etapa: Acionamentos → Contatos → Acordos → 1ª Parcela
        </p>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {steps.map((s) => {
          const isCritical = s.pct != null && s.pct < 5;
          const actualW = Math.max(s.barWidth, 4);
          const barClass = isCritical ? "bg-danger" : ROLE_BG[s.role];
          const pctColorClass = isCritical
            ? "text-danger-fg"
            : s.pct != null && s.pct < 30
              ? "text-warning-fg"
              : "text-success-fg";

          return (
            <div
              key={s.label}
              className="flex items-center gap-2.5"
              data-testid={`funil-step-${s.label}`}
            >
              <span className="w-20 flex-shrink-0 text-right text-[11px] font-semibold text-slate-600">
                {s.label}
              </span>
              <div className="relative flex-1">
                <div className="h-7 overflow-hidden rounded bg-slate-100">
                  <div
                    role="presentation"
                    className={`flex h-full items-center justify-end rounded pr-2 transition-[width] duration-500 ${barClass}`}
                    style={{ width: `${actualW}%` }}
                  >
                    {actualW > 15 && (
                      <span className="text-[11px] font-semibold tabular-nums text-white">
                        {s.display}
                      </span>
                    )}
                  </div>
                </div>
                {actualW <= 15 && (
                  <span
                    className="absolute top-1.5 text-[11px] font-semibold tabular-nums text-slate-700"
                    style={{ left: `${actualW + 1}%` }}
                  >
                    {s.display}
                  </span>
                )}
              </div>
              {s.pct != null && s.pctLabel ? (
                <span
                  className={`w-[72px] flex-shrink-0 text-right text-[11px] font-semibold tabular-nums ${pctColorClass}`}
                >
                  {s.pctLabel}: {s.pct.toFixed(1)}%
                </span>
              ) : (
                <span className="w-[72px]" />
              )}
            </div>
          );
        })}

        <div className="mt-3 flex gap-4 text-[10px] text-slate-500">
          <span>
            Perda Acion→Contatos: {lossAcionContat.toFixed(0)}%
          </span>
          <span>
            Perda Contatos→Acordos: {lossContatAcord.toFixed(0)}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default FunilConversao;
