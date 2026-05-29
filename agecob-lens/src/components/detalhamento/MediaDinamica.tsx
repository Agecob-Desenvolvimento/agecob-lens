import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRLCompact } from "@/lib/metrics";

export interface MediaDinamicaData {
  agentValor: number;
  teamMedia: number;
  teamMax: number;
  agentCount: number;
}

interface MediaDinamicaProps {
  data: MediaDinamicaData;
  agentName: string | null;
}

function pctOf(v: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, (v / max) * 100);
}

export function MediaDinamica({ data, agentName }: MediaDinamicaProps) {
  const { agentValor, teamMedia, teamMax, agentCount } = data;
  const label = agentName ?? "Agente";
  const hasAgent = agentName != null && agentName.length > 0;

  if (!hasAgent) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">
            Média Dinâmica
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Selecione um agente para comparar com a média da equipe no período.
          </p>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-2 text-center">
            Nenhum agente selecionado.
          </p>
        </CardContent>
      </Card>
    );
  }

  const agentPct = pctOf(agentValor, teamMax);
  const mediaPct = pctOf(teamMedia, teamMax);
  const deltaPct = teamMedia > 0 ? ((agentValor - teamMedia) / teamMedia) * 100 : 0;
  const absDelta = Math.abs(deltaPct);
  const above = deltaPct >= 0;

  const direction = above ? "↑" : "↓";
  const deltaColor = above
    ? deltaPct >= 20
      ? "text-success-fg"
      : "text-warning-fg"
    : deltaPct <= -20
      ? "text-danger-fg"
      : "text-warning-fg";

  const barColor = above
    ? deltaPct >= 20
      ? "bg-success"
      : "bg-warning"
    : deltaPct <= -20
      ? "bg-danger"
      : "bg-warning";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">
          Média Dinâmica
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Valor Acordos vs média da equipe no período selecionado ({agentCount} agentes).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Agent value display */}
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold text-slate-600">
            {label}
          </span>
          <span className="text-lg font-bold tabular-nums text-foreground">
            {formatBRLCompact(agentValor)}
          </span>
        </div>

        {/* Horizontal bar */}
        <div className="relative h-9">
          {/* Background track */}
          <div className="absolute inset-0 rounded-sm bg-slate-100" />

          {/* Agent bar */}
          <div
            className={`absolute inset-y-0 left-0 rounded-sm transition-[width] duration-500 ${barColor}`}
            style={{ width: `${Math.max(agentPct, 2)}%` }}
          />

          {/* Team average marker */}
          <div
            className="absolute inset-y-0 w-0.5 bg-foreground z-10"
            style={{ left: `${Math.max(mediaPct, 0.5)}%` }}
          >
            {/* Label above the marker */}
            <span className="absolute -top-5 -translate-x-1/2 text-[10px] font-semibold text-foreground whitespace-nowrap">
              média
            </span>
          </div>

          {/* Agent value on bar (if bar is wide enough) */}
          {agentPct > 18 && (
            <span className="absolute inset-y-0 flex items-center text-[10px] font-semibold text-white pl-2 tabular-nums">
              {formatBRLCompact(agentValor)}
            </span>
          )}

          {/* Agent value outside bar (if bar is narrow) */}
          {agentPct <= 18 && (
            <span
              className="absolute inset-y-0 flex items-center text-[10px] font-semibold text-slate-700 tabular-nums"
              style={{ left: `${Math.min(agentPct + 1, 95)}%` }}
            >
              {formatBRLCompact(agentValor)}
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">
            Média equipe:{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatBRLCompact(teamMedia)}
            </span>
          </span>
          <span className={`font-semibold tabular-nums ${deltaColor}`}>
            {direction} {absDelta.toFixed(0)}%{above ? " acima" : " abaixo"}
          </span>
        </div>

        {/* Agent count footnote */}
        <p className="text-[10px] text-slate-400">
          {agentCount} agentes com acordos no período.
        </p>
      </CardContent>
    </Card>
  );
}

export default MediaDinamica;
