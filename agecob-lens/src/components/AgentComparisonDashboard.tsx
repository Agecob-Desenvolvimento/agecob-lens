import { useEffect, useMemo, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type DatabaseOption } from "@/services/api";
import { useProdutividadeData } from "@/hooks/useProdutividadeData";
import ExecutiveKpiStrip from "@/components/executive/ExecutiveKpiStrip";
import ExecutiveInsightCard from "@/components/executive/ExecutiveInsightCard";
import ExecutiveRankingTable from "@/components/executive/ExecutiveRankingTable";
import SectionHeader from "@/components/executive/SectionHeader";
import {
  aggregateTotals,
  buFromSource,
  calcConversao,
  calcCpc,
  calcTicketMedio,
  fmtBRL,
  shortAgentName,
} from "@/lib/metrics";
import {
  selectAgentNames,
  selectAgentRow,
  selectRadarDimensions,
  selectTeamRanking,
  selectTopByValorAgentName,
  type RadarDimension,
} from "@/selectors";
import type { ExecutiveKpi, InsightEngineOutput } from "@/types/executive";

interface AgentComparisonDashboardProps {
  db: DatabaseOption;
  dateFrom?: string;
  dateTo?: string;
}

const COLOR_A = "hsl(43, 95%, 50%)";
const COLOR_B = "hsl(199, 89%, 48%)";

type AgentRow = ReturnType<typeof useProdutividadeData>["rows"][number];

function kpisFor(row: AgentRow | null): ExecutiveKpi[] {
  if (!row) return [];
  const t = aggregateTotals([row]);
  return [
    { label: "Valor Acordos", value: t.valor_acordos, unit: "BRL", priority: "primary", formula: "Σ valor_acordos" },
    { label: "Qtd Acordos", value: t.qtd_acordos, unit: "count", priority: "primary", formula: "Σ qtd_acordos" },
    { label: "CPC %", value: calcCpc(t), unit: "%", priority: "primary", formula: "qtd_contatos / qtd_acionamentos" },
    { label: "Conversão %", value: calcConversao(t), unit: "%", priority: "primary", formula: "qtd_acordos / qtd_contatos" },
  ];
}

function buildVerdict(rowA: AgentRow | null, rowB: AgentRow | null, labelA: string, labelB: string): InsightEngineOutput {
  if (!rowA || !rowB) return { insight1: null, insight2: null, action: null, empty: true };
  const ta = aggregateTotals([rowA]);
  const tb = aggregateTotals([rowB]);
  const cpcA = calcCpc(ta);
  const cpcB = calcCpc(tb);
  const convA = calcConversao(ta);
  const convB = calcConversao(tb);
  const valorDelta = ta.valor_acordos - tb.valor_acordos;
  const efA = (cpcA + convA) / 2;
  const efB = (cpcB + convB) / 2;
  const efDelta = efA - efB;
  const valorEmpate = Math.abs(valorDelta) < 100;
  const efEmpate = Math.abs(efDelta) < 1;
  if (valorEmpate && efEmpate) return { insight1: null, insight2: null, action: null, empty: true };
  const winnerValor = valorDelta >= 0 ? labelA : labelB;
  const winnerEf = efDelta >= 0 ? labelA : labelB;
  const text = winnerValor === winnerEf
    ? `${winnerValor} supera tanto em valor quanto em eficiência (CPC+Conversão).`
    : `${winnerValor} supera em valor; ${winnerEf} supera em eficiência (CPC+Conversão).`;
  return {
    insight1: { text, severity: "positive", headline: "Veredito" },
    insight2: null,
    action: null,
    empty: false,
  };
}

export default function AgentComparisonDashboard({ db, dateFrom, dateTo }: AgentComparisonDashboardProps) {
  const { rows, loading, error, warnings } = useProdutividadeData(db, { dateFrom, dateTo });
  const [agentA, setAgentA] = useState<string>("");
  const [agentB, setAgentB] = useState<string>("");

  const agentNames = useMemo(() => selectAgentNames(rows), [rows]);

  useEffect(() => {
    if (rows.length === 0) return;
    if (!agentA) {
      const top0 = selectTopByValorAgentName(rows, 0);
      if (top0) setAgentA(top0);
    }
    if (!agentB) {
      const top1 = selectTopByValorAgentName(rows, 1);
      if (top1) setAgentB(top1);
    }
  }, [rows, agentA, agentB]);

  const rowA = useMemo(() => selectAgentRow(rows, agentA), [rows, agentA]);
  const rowB = useMemo(() => selectAgentRow(rows, agentB), [rows, agentB]);

  const buA = rowA ? buFromSource(rowA.source) : null;
  const buB = rowB ? buFromSource(rowB.source) : null;
  const teamRows = useMemo(() => {
    if (!buA && !buB) return rows;
    return rows.filter((r) => {
      const bu = buFromSource(r.source);
      return bu === buA || bu === buB;
    });
  }, [rows, buA, buB]);

  const labelA = rowA ? shortAgentName(rowA.NOME) : "Agente A";
  const labelB = rowB ? shortAgentName(rowB.NOME) : "Agente B";

  const radarData = useMemo(
    () => selectRadarDimensions(rowA ? [rowA] : [], rowB ? [rowB] : [], teamRows),
    [rowA, rowB, teamRows],
  );
  const verdict = useMemo(() => buildVerdict(rowA, rowB, labelA, labelB), [rowA, rowB, labelA, labelB]);

  const ranking = useMemo(() => selectTeamRanking(teamRows), [teamRows]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="py-6 flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <span>Erro ao carregar dados: {error}</span>
        </CardContent>
      </Card>
    );
  }

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="py-6 text-muted-foreground">Nenhum dado disponível.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {warnings.length > 0 && (
        <Card className="border-amber-400/40">
          <CardContent className="py-3 text-xs text-amber-600">
            Fontes com falha parcial: {warnings.join(" | ")}
          </CardContent>
        </Card>
      )}

      <ExecutiveInsightCard data={verdict} title={`${labelA} × ${labelB}`} />

      <SectionHeader title="Comparação 1:1" description="Selecione dois agentes; KPIs visuais sem delta." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm uppercase tracking-wide text-amber-700 font-semibold">Agente A</CardTitle>
            <Select value={agentA} onValueChange={setAgentA}>
              <SelectTrigger><SelectValue placeholder="Selecionar agente" /></SelectTrigger>
              <SelectContent>
                {agentNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ExecutiveKpiStrip kpis={kpisFor(rowA)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm uppercase tracking-wide text-sky-700 font-semibold">Agente B</CardTitle>
            <Select value={agentB} onValueChange={setAgentB}>
              <SelectTrigger><SelectValue placeholder="Selecionar agente" /></SelectTrigger>
              <SelectContent>
                {agentNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ExecutiveKpiStrip kpis={kpisFor(rowB)} />
          </CardContent>
        </Card>
      </div>

      <SectionHeader title="Perfil multidimensional" description="5 dimensões normalizadas pelo máximo da equipe (BU dos selecionados). 100 = melhor da equipe." />
      <Card>
        <CardContent className="px-4 pb-4 pt-4">
          {radarData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Selecione dois agentes para ver o radar.</p>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <RadarChart data={radarData} outerRadius="80%">
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="dim" tick={{ fontSize: 12, fontWeight: 600 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar name={labelA} dataKey="agentA" stroke={COLOR_A} fill={COLOR_A} fillOpacity={0.35} />
                <Radar name={labelB} dataKey="agentB" stroke={COLOR_B} fill={COLOR_B} fillOpacity={0.35} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0]?.payload as RadarDimension | undefined;
                    if (!p) return null;
                    const fmt = (v: number, u: RadarDimension["unit"]) =>
                      u === "BRL" ? fmtBRL(v) : u === "%" ? `${v.toFixed(1)}%` : v.toFixed(0);
                    return (
                      <div className="rounded-md border bg-background p-2 text-xs space-y-1 shadow-md">
                        <p className="font-semibold">{p.dim}</p>
                        <p style={{ color: COLOR_A }}>{labelA}: <span className="tabular-nums font-semibold">{fmt(p.rawA, p.unit)}</span></p>
                        <p style={{ color: COLOR_B }}>{labelB}: <span className="tabular-nums font-semibold">{fmt(p.rawB, p.unit)}</span></p>
                      </div>
                    );
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <ExecutiveRankingTable
        title="Top 10 da equipe comum (BU dos selecionados)"
        rows={ranking}
        primaryColumnLabel="Valor Acordos"
        secondaryColumnLabel="Qtd Acordos"
        empty={ranking.length === 0}
        highlightLabels={[labelA, labelB]}
      />
    </div>
  );
}
