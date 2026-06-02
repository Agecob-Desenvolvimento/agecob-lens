import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtNum, formatBRLCompact } from "@/lib/metrics";

export interface FunilData {
  acionamentos: number;
  /** Alô = alguém atendeu (ALO=1). Etapa entre acionamento e contato/RPC. */
  alo: number;
  /** Contato = RPC (falou com a pessoa certa). */
  contatos: number;
  acordos: number;
  primeiraParcela: number;
  /**
   * Total agreement value. DEPRECATED for Efetividade Caixa — use
   * primeiraParcelaRecebida instead. Kept for backward compat.
   */
  valorAcordos?: number;
  /** Primeira parcela recebida (VR_PAGO). Used for Efetividade de Caixa = recebida / emitida. */
  primeiraParcelaRecebida?: number;
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
  /** Loss percentage (100 - pct) — what died at this stage. null for base step. */
  lossPct: number | null;
  /** semantic role for color */
  role: "primary" | "alo" | "info" | "warning" | "success";
}

function buildSteps(d: FunilData): FunilStep[] {
  // Funnel: Acionamento → Alô (atende) → Contato/RPC (pessoa certa) → Acordo.
  // Each rate is vs the previous step. Loss = what didn't make it.
  // In collections we investigate the dead — show loss prominently.
  const taxaAtend = d.acionamentos > 0 ? (d.alo / d.acionamentos) * 100 : 0;
  const taxaRpc = d.alo > 0 ? (d.contatos / d.alo) * 100 : 0;
  const conv = d.contatos > 0 ? (d.acordos / d.contatos) * 100 : 0;
  const efetiv =
    d.primeiraParcelaRecebida != null && d.primeiraParcela > 0
      ? (d.primeiraParcelaRecebida / d.primeiraParcela) * 100
      : d.valorAcordos && d.valorAcordos > 0
        ? (d.primeiraParcela / d.valorAcordos) * 100
        : 0;

  // Contagens normalizam por acionamentos (escala visual); 1ª Parcela (BRL)
  // normaliza pela própria efetividade. Números reais ficam nos labels.
  // Bar widths are proportional to acionamentos for steps 0-3; step 4 uses its own scale.
  const maxCount = d.acionamentos || 1;
  const norm = (v: number) => (v / maxCount) * 100;

  return [
    {
      label: "Acionamentos",
      value: d.acionamentos,
      display: fmtNum(d.acionamentos),
      pct: null,
      pctLabel: null,
      barWidth: norm(d.acionamentos),
      lossPct: null,
      role: "primary",
    },
    {
      label: "Contato",
      value: d.alo,
      display: fmtNum(d.alo),
      pct: taxaAtend,
      pctLabel: "Taxa contato",
      barWidth: norm(d.alo),
      lossPct: d.acionamentos > 0 ? ((d.acionamentos - d.alo) / d.acionamentos) * 100 : null,
      role: "alo",
    },
    {
      label: "CPC",
      value: d.contatos,
      display: fmtNum(d.contatos),
      pct: taxaRpc,
      pctLabel: "Taxa CPC",
      barWidth: norm(d.contatos),
      lossPct: d.alo > 0 ? ((d.alo - d.contatos) / d.alo) * 100 : null,
      role: "info",
    },
    {
      label: "Acordos",
      value: d.acordos,
      display: fmtNum(d.acordos),
      pct: conv,
      pctLabel: "Conv.",
      barWidth: norm(d.acordos),
      lossPct: d.contatos > 0 ? ((d.contatos - d.acordos) / d.contatos) * 100 : null,
      role: "warning",
    },
    {
      label: "1ª Parcela",
      value: d.primeiraParcela,
      display: formatBRLCompact(d.primeiraParcela),
      pct: efetiv,
      pctLabel: "Efetiv.",
      barWidth: efetiv,
      lossPct: null, // Efetividade de caixa is a ratio, not a funnel step — loss not applicable
      role: "success",
    },
  ];
}

const ROLE_BG: Record<FunilStep["role"], string> = {
  primary: "bg-sky-600",
  alo: "bg-sky-500",
  info: "bg-sky-400",
  warning: "bg-warning",
  success: "bg-success",
};

function renderStep(s: FunilStep) {
  const isCritical = s.pct != null && s.pct < 5;
  const actualW = Math.max(s.barWidth, 4);
  const barClass = isCritical ? "bg-danger" : ROLE_BG[s.role];

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
        <div className="w-[120px] flex-shrink-0 text-right">
          <span className="text-[11px] font-semibold tabular-nums text-slate-500">
            {s.pctLabel}: {s.pct.toFixed(1)}%
          </span>
          {s.lossPct != null && s.lossPct > 0 && (
        <span
              className="ml-0.5 text-[11px] font-bold tabular-nums text-red-600"
              title={`${s.lossPct.toFixed(0)}% perdidos de ${s.pctLabel}`}
        >
              −{s.lossPct.toFixed(0)}%
        </span>
          )}
          {s.lossPct != null && s.lossPct > 0 && (
            <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-red-400"
                style={{ width: `${Math.min(s.lossPct, 100)}%` }}
              />
            </div>
          )}
        </div>
      ) : (
        <span className="w-[72px]" />
      )}
    </div>
  );
}

export function FunilConversao({ data }: FunilConversaoProps) {
  const steps = buildSteps(data);
  const lossAloRpc =
    data.alo > 0 ? (1 - data.contatos / data.alo) * 100 : 0;
  const lossRpcAcord =
    data.contatos > 0 ? (1 - data.acordos / data.contatos) * 100 : 0;

  const funnelSteps = steps.slice(0, 4);
  const comparator = steps[4];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">
          Funil de Conversão
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Acionamentos → Contato (atende) → CPC (pessoa certa) → Acordos
        </p>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {funnelSteps.map((s) => renderStep(s))}

        <div className="!mt-4 border-t border-dashed border-slate-200 pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Comparador · Efetividade de Caixa (eixo próprio)
          </p>
          {renderStep(comparator)}
        </div>

        <div className="mt-3 flex gap-4 text-[10px] font-semibold text-red-700">
          <span>🔻 Perda Contato→CPC: {lossAloRpc.toFixed(0)}%</span>
          <span>🔻 Perda CPC→Acordos: {lossRpcAcord.toFixed(0)}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default FunilConversao;