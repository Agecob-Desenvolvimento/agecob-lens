import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import ExecutiveHeader from "@/components/executive/ExecutiveHeader";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchEfAgenteColchao,
  fetchEfAgenteColchaoVencimento,
  fetchEfAgentePrimeira,
  fetchEfDiariaColchao,
  fetchEfDiariaColchaoVencimento,
  fetchEfDiariaPrimeira,
  fetchEfMensalColchao,
  fetchEfMensalColchaoVencimento,
  fetchEfMensalPrimeira,
} from "@/services/api";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ── Constants ──────────────────────────────────────────────────────
const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MONTH_ABBR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// ── Normalized internal types ───────────────────────────────────────
interface DiariaData {
  dia: string;
  diaNum: number;
  mesNum: number;
  anoNum: number;
  boletosGerados: number;
  pagosNoPrazo: number;
  conversao: number;
}

interface MensalData {
  ano: number;
  mes: number;
  label: string;
  boletosGerados: number;
  pagosNoPrazo: number;
  conversao: number;
}

interface AgenteData {
  agente: string;
  boletosGerados: number;
  pagosNoPrazo: number;
  conversao: number;
}

// ── Helpers ─────────────────────────────────────────────────────────
function parseDateParts(dateStr: string): { year: number; month: number; day: number } {
  const p = dateStr.split("-");
  return { year: parseInt(p[0], 10), month: parseInt(p[1], 10), day: parseInt(p[2], 10) };
}

function fmtDia(dateStr: string): string {
  const { day, month } = parseDateParts(dateStr);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

function convColorClass(v: number): string {
  if (v >= 70) return "text-emerald-600";
  if (v >= 40) return "text-amber-500";
  return "text-rose-600";
}

function convFill(v: number): string {
  if (v >= 70) return "#16a34a";
  if (v >= 40) return "#f59e0b";
  return "#dc2626";
}

// ── Simple KPI card ─────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  colorClass,
  highlight,
}: {
  label: string;
  value: string;
  colorClass?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={cn("min-w-0", highlight ? "border-primary/40 shadow-sm" : "")}>
      <CardHeader className="pb-1 pt-3 px-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground leading-tight truncate">
          {label}
        </p>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <span className={cn("block font-bold tabular-nums text-xl md:text-2xl truncate", colorClass ?? "text-foreground")}>
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "12px",
} as const;

// ── Page ─────────────────────────────────────────────────────────────
export default function EfetividadeBoletos() {
  const now = new Date();
  const [tipo, setTipo] = useState<"primeira" | "colchao">("primeira");
  const [colchaoView, setColchaoView] = useState<"vencimento" | "emissao">("vencimento");
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  // Fetch all upfront so switching is instant after first load
  const { data: dpEnv, isLoading: ldp, error: errDp } = useQuery({ queryKey: ["ef-diaria-primeira"], queryFn: fetchEfDiariaPrimeira });
  const { data: dcEnv, isLoading: ldc, error: errDc } = useQuery({ queryKey: ["ef-diaria-colchao"], queryFn: fetchEfDiariaColchao });
  const { data: dcvEnv, isLoading: ldcv, error: errDcv } = useQuery({ queryKey: ["ef-diaria-colchao-vencimento"], queryFn: fetchEfDiariaColchaoVencimento });
  const { data: mpEnv, isLoading: lmp, error: errMp } = useQuery({ queryKey: ["ef-mensal-primeira"], queryFn: fetchEfMensalPrimeira });
  const { data: mcEnv, isLoading: lmc, error: errMc } = useQuery({ queryKey: ["ef-mensal-colchao"], queryFn: fetchEfMensalColchao });
  const { data: mcvEnv, isLoading: lmcv, error: errMcv } = useQuery({ queryKey: ["ef-mensal-colchao-vencimento"], queryFn: fetchEfMensalColchaoVencimento });
  const { data: apEnv, isLoading: lap, error: errAp } = useQuery({ queryKey: ["ef-agente-primeira"], queryFn: fetchEfAgentePrimeira });
  const { data: acEnv, isLoading: lac, error: errAc } = useQuery({ queryKey: ["ef-agente-colchao"], queryFn: fetchEfAgenteColchao });
  const { data: acvEnv, isLoading: lacv, error: errAcv } = useQuery({ queryKey: ["ef-agente-colchao-vencimento"], queryFn: fetchEfAgenteColchaoVencimento });

  const loading = tipo === "primeira"
    ? (ldp || lmp || lap)
    : colchaoView === "vencimento"
      ? (ldcv || lmcv || lacv)
      : (ldc || lmc || lac);

  const hasError = tipo === "primeira"
    ? Boolean(errDp || errMp || errAp)
    : colchaoView === "vencimento"
      ? Boolean(errDcv || errMcv || errAcv)
      : Boolean(errDc || errMc || errAc);

  // ── Normalize diaria ────────────────────────────────────────────
  const diariaAll = useMemo((): DiariaData[] => {
    if (tipo === "primeira") {
      return (dpEnv?.data ?? []).map((r) => {
        const { year, month, day } = parseDateParts(r.Dia_Emissao);
        return { dia: r.Dia_Emissao, diaNum: day, mesNum: month, anoNum: year, boletosGerados: r.Boletos_Gerados, pagosNoPrazo: r.Pagos_No_Prazo, conversao: r.Conversao_Prazo_5d };
      });
    }
    if (colchaoView === "vencimento") {
      return (dcvEnv?.data ?? []).map((r) => {
        const { year, month, day } = parseDateParts(r.Dia_Vencimento);
        return { dia: r.Dia_Vencimento, diaNum: day, mesNum: month, anoNum: year, boletosGerados: r.Boletos_Gerados_Colchao, pagosNoPrazo: r.Pagos_No_Prazo, conversao: r.Conversao_Colchao };
      });
    }
    return (dcEnv?.data ?? []).map((r) => {
      const { year, month, day } = parseDateParts(r.Dia_Emissao);
      return { dia: r.Dia_Emissao, diaNum: day, mesNum: month, anoNum: year, boletosGerados: r.Boletos_Gerados_Colchao, pagosNoPrazo: r.Pagos_No_Prazo, conversao: r.Conversao_Colchao };
    });
  }, [tipo, colchaoView, dpEnv, dcEnv, dcvEnv]);

  const diariaFiltrada = useMemo(
    () => diariaAll.filter((d) => d.anoNum === selectedYear && d.mesNum === selectedMonth),
    [diariaAll, selectedYear, selectedMonth],
  );

  // ── Normalize mensal ────────────────────────────────────────────
  const mensalAll = useMemo((): MensalData[] => {
    if (tipo === "primeira") {
      return (mpEnv?.data ?? []).map((r) => ({
        ano: r.Ano, mes: r.Mes,
        label: `${MONTH_ABBR[r.Mes - 1]}/${String(r.Ano).slice(2)}`,
        boletosGerados: r.Boletos_Gerados, pagosNoPrazo: r.Pagos_No_Prazo, conversao: r.Conversao_Prazo_5d,
      }));
    }
    const src = colchaoView === "vencimento" ? (mcvEnv?.data ?? []) : (mcEnv?.data ?? []);
    return src.map((r) => ({
      ano: r.Ano, mes: r.Mes,
      label: `${MONTH_ABBR[r.Mes - 1]}/${String(r.Ano).slice(2)}`,
      boletosGerados: r.Boletos_Gerados_Colchao, pagosNoPrazo: r.Pagos_No_Prazo, conversao: r.Conversao_Colchao,
    }));
  }, [tipo, colchaoView, mpEnv, mcEnv, mcvEnv]);

  const selectedMensal = useMemo(
    () => mensalAll.find((m) => m.ano === selectedYear && m.mes === selectedMonth),
    [mensalAll, selectedYear, selectedMonth],
  );

  const mensalChart = useMemo(
    () => mensalAll.filter((m) => m.conversao > 0),
    [mensalAll],
  );

  const avgConversao = useMemo(() => {
    if (!mensalChart.length) return 0;
    return Math.round(mensalChart.reduce((s, m) => s + m.conversao, 0) / mensalChart.length);
  }, [mensalChart]);

  // ── Normalize agentes ───────────────────────────────────────────
  const agentesAll = useMemo((): AgenteData[] => {
    if (tipo === "primeira") {
      return (apEnv?.data ?? [])
        .filter((r) => r.Ano === selectedYear && r.Mes === selectedMonth)
        .map((r) => ({ agente: r.Agente, boletosGerados: r.Boletos_Gerados, pagosNoPrazo: r.Pagos_No_Prazo, conversao: r.Conversao_Prazo_5d }))
        .filter((a) => a.boletosGerados >= 10)
        .sort((a, b) => b.conversao - a.conversao);
    }
    const agenteSrc = colchaoView === "vencimento" ? (acvEnv?.data ?? []) : (acEnv?.data ?? []);
    return agenteSrc
      .filter((r) => r.Ano === selectedYear && r.Mes === selectedMonth)
      .map((r) => ({ agente: r.Agente, boletosGerados: r.Boletos_Gerados_Colchao, pagosNoPrazo: r.Pagos_No_Prazo, conversao: r.Conversao_Colchao }))
      .filter((a) => a.boletosGerados >= 10)
      .sort((a, b) => b.conversao - a.conversao);
  }, [tipo, colchaoView, apEnv, acEnv, acvEnv, selectedYear, selectedMonth]);

  // ── KPI derivations ─────────────────────────────────────────────
  const melhorDia = useMemo(() => {
    if (!diariaFiltrada.length) return null;
    return diariaFiltrada.reduce((best, d) => d.conversao > best.conversao ? d : best);
  }, [diariaFiltrada]);

  const piorDia = useMemo(() => {
    const valid = diariaFiltrada.filter((d) => d.boletosGerados > 0);
    if (!valid.length) return null;
    return valid.reduce((worst, d) => d.conversao < worst.conversao ? d : worst);
  }, [diariaFiltrada]);

  const kpiConversao = selectedMensal?.conversao ?? 0;
  const agentChartHeight = Math.max(180, Math.min(500, agentesAll.length * 34));

  const currentYear = now.getFullYear();
  const years = Array.from({ length: Math.max(1, currentYear - 2025) }, (_, i) => 2026 + i);

  const periodLabel = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <ExecutiveHeader
            title="Efetividade de Boletos"
            period="2026+"
            filters={[
              {
                label: "Tipo",
                value: tipo === "primeira"
                  ? "Primeira Parcela"
                  : colchaoView === "vencimento" ? "Colchão · Por Vencimento" : "Colchão · Por Emissão",
              },
              { label: "Período", value: periodLabel },
            ]}
          />

          <div className="flex-1 bg-background p-6 space-y-6 overflow-auto">

            {/* ── Global Filters ─────────────────────────────────── */}
            <div className="flex flex-wrap gap-3 items-end">
              <Card className="flex-none">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Período
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 flex gap-2">
                  <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_NAMES.map((name, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card className="flex-none">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Tipo
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 flex gap-2">
                  {(["primeira", "colchao"] as const).map((t) => (
                    <Button
                      key={t}
                      size="sm"
                      variant={tipo === t ? "default" : "outline"}
                      onClick={() => setTipo(t)}
                      className={
                        tipo === t
                          ? "bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600"
                          : ""
                      }
                    >
                      {t === "primeira" ? "Primeira Parcela" : "Colchão"}
                    </Button>
                  ))}
                </CardContent>
              </Card>

              {tipo === "colchao" && (
                <TooltipProvider>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <Card className="flex-none cursor-default">
                        <CardHeader className="pb-2 pt-3 px-4">
                          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            Agrupar por
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-3 flex gap-2">
                          {(["vencimento", "emissao"] as const).map((v) => (
                            <Button
                              key={v}
                              size="sm"
                              variant={colchaoView === v ? "default" : "outline"}
                              onClick={() => setColchaoView(v)}
                              className={
                                colchaoView === v
                                  ? "bg-sky-600 text-white hover:bg-sky-700 border-sky-600"
                                  : ""
                              }
                            >
                              {v === "vencimento" ? "Por Vencimento" : "Por Emissão"}
                            </Button>
                          ))}
                        </CardContent>
                      </Card>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-xs">
                      <p><strong>Por Vencimento:</strong> considera a data de vencimento do boleto.</p>
                      <p><strong>Por Emissão:</strong> considera a data de geração do boleto.</p>
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              )}
            </div>

            {/* ── Error state ─────────────────────────────────────── */}
            {hasError && !loading && (
              <Card className="border-destructive/50">
                <CardContent className="py-3 text-sm text-destructive">
                  Erro ao carregar dados de efetividade. O ETL pode ainda estar em execução — tente atualizar em instantes.
                </CardContent>
              </Card>
            )}

            {/* ── Section 1: KPI Cards ────────────────────────────── */}
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <KpiCard
                  label="Boletos Gerados"
                  value={selectedMensal ? String(selectedMensal.boletosGerados) : "—"}
                />
                <KpiCard
                  label="Pagos no Prazo"
                  value={selectedMensal ? String(selectedMensal.pagosNoPrazo) : "—"}
                />
                <KpiCard
                  label="% Conversão"
                  value={selectedMensal ? `${kpiConversao}%` : "—"}
                  colorClass={selectedMensal ? convColorClass(kpiConversao) : undefined}
                  highlight
                />
                <KpiCard
                  label="Melhor Dia"
                  value={melhorDia ? `${fmtDia(melhorDia.dia)} – ${melhorDia.conversao}%` : "—"}
                  colorClass="text-emerald-600"
                />
                <KpiCard
                  label="Pior Dia"
                  value={piorDia ? `${fmtDia(piorDia.dia)} – ${piorDia.conversao}%` : "—"}
                  colorClass="text-rose-600"
                />
              </div>
            )}

            {/* ── Section 2: Daily Combo Chart ────────────────────── */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold">
                  Conversão Diária — {periodLabel}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {loading ? (
                  <Skeleton className="h-72 w-full" />
                ) : diariaFiltrada.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">
                    {tipo === "colchao" && colchaoView === "vencimento"
                      ? "Não há boletos vencidos neste mês."
                      : "Sem dados para o período selecionado."}
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={diariaFiltrada} margin={{ top: 24, right: 52, left: 0, bottom: 8 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" />
                      <XAxis
                        dataKey="diaNum"
                        tickLine={false}
                        tick={{ fontSize: 11 }}
                        label={{ value: "Dia", position: "insideBottomRight", offset: -4, fontSize: 11 }}
                      />
                      <YAxis
                        yAxisId="boletos"
                        tickLine={false}
                        tick={{ fontSize: 11 }}
                        width={52}
                      />
                      <YAxis
                        yAxisId="conv"
                        orientation="right"
                        domain={[0, 100]}
                        unit="%"
                        tickLine={false}
                        tick={{ fontSize: 11 }}
                        width={40}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value, name) =>
                          name === "% Conversão" ? [`${value}%`, name] : [value, name]
                        }
                      />
                      <Bar
                        yAxisId="boletos"
                        dataKey="boletosGerados"
                        name="Boletos Gerados"
                        fill="hsl(var(--primary))"
                        opacity={0.55}
                        radius={[2, 2, 0, 0]}
                      />
                      <Line
                        yAxisId="conv"
                        type="monotone"
                        dataKey="conversao"
                        name="% Conversão"
                        stroke="#16a34a"
                        strokeWidth={2}
                        dot={(props: any) => {
                          const { cx, cy, payload, key } = props;
                          const isMax = payload.diaNum === melhorDia?.diaNum;
                          const isMin = payload.diaNum === piorDia?.diaNum;
                          return (
                            <circle
                              key={key}
                              cx={cx}
                              cy={cy}
                              r={isMax || isMin ? 5 : 2.5}
                              fill={isMin ? "#dc2626" : "#16a34a"}
                              stroke={isMax || isMin ? "white" : "none"}
                              strokeWidth={isMax || isMin ? 2 : 0}
                            />
                          );
                        }}
                        activeDot={{ r: 5, fill: "#16a34a" }}
                      >
                        <LabelList
                          dataKey="conversao"
                          content={(props: any) => {
                            const { x, y, value, index } = props;
                            const d = diariaFiltrada[index];
                            if (!d) return null;
                            const isMax = d.diaNum === melhorDia?.diaNum;
                            const isMin = d.diaNum === piorDia?.diaNum;
                            if (!isMax && !isMin) return null;
                            return (
                              <text
                                key={`lbl-${d.diaNum}`}
                                x={Number(x)}
                                y={Number(y) - 10}
                                fill={isMax ? "#16a34a" : "#dc2626"}
                                fontSize={11}
                                fontWeight={600}
                                textAnchor="middle"
                              >
                                {value}%
                              </text>
                            );
                          }}
                        />
                      </Line>
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* ── Section 3: Monthly Trend ─────────────────────────── */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold">Tendência Mensal — % Conversão</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {loading ? (
                  <Skeleton className="h-64 w-full" />
                ) : mensalChart.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">
                    Sem dados históricos disponíveis.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={mensalChart} margin={{ top: 28, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} tickLine={false} width={40} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(v) => [`${v}%`, "% Conversão"]}
                      />
                      <Bar dataKey="conversao" name="% Conversão" radius={[3, 3, 0, 0]}>
                        <LabelList
                          dataKey="conversao"
                          position="top"
                          formatter={(v: number) => `${v}%`}
                          style={{ fontSize: 11, fontWeight: 600 }}
                        />
                        {mensalChart.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={convFill(entry.conversao)} />
                        ))}
                      </Bar>
                      {avgConversao > 0 && (
                        <ReferenceLine
                          y={avgConversao}
                          stroke="#6b7280"
                          strokeDasharray="5 5"
                          label={{
                            value: `Média ${avgConversao}%`,
                            position: "insideTopRight",
                            fontSize: 11,
                            fill: "#6b7280",
                          }}
                        />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* ── Section 4: Agent Ranking ─────────────────────────── */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold">
                  {tipo === "colchao"
                    ? `Agentes (Colchão · ${colchaoView === "vencimento" ? "Por Vencimento" : "Por Emissão"}) — ${periodLabel}`
                    : `Ranking de Agentes — ${periodLabel}`}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                {loading ? (
                  <Skeleton className="h-48 w-full" />
                ) : agentesAll.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">
                    {tipo === "colchao" && colchaoView === "vencimento"
                      ? "Não há boletos vencidos neste mês."
                      : "Sem dados de agentes para o período selecionado."}
                  </p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={agentChartHeight}>
                      <BarChart
                        data={agentesAll}
                        layout="vertical"
                        margin={{ top: 0, right: 52, left: 4, bottom: 0 }}
                      >
                        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" horizontal={false} />
                        <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} tickLine={false} />
                        <YAxis
                          type="category"
                          dataKey="agente"
                          width={130}
                          tick={{ fontSize: 11 }}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(v) => [`${v}%`, "% Conversão"]}
                        />
                        <Bar dataKey="conversao" name="% Conversão" radius={[0, 3, 3, 0]}>
                          <LabelList
                            dataKey="conversao"
                            position="right"
                            formatter={(v: number) => `${v}%`}
                            style={{ fontSize: 11 }}
                          />
                          {agentesAll.map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={
                                index === 0 ? "#16a34a"
                                : index === 1 ? "#22c55e"
                                : index === 2 ? "#4ade80"
                                : "hsl(var(--chart-1))"
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              Agente
                            </th>
                            <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              Boletos Gerados
                            </th>
                            <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              Pagos no Prazo
                            </th>
                            <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              % Conversão
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {agentesAll.map((a, i) => (
                            <tr
                              key={a.agente}
                              className={cn(
                                "border-b border-border/50 hover:bg-muted/40 transition-colors",
                                i < 3 ? "font-medium" : "",
                              )}
                            >
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-2 min-w-0">
                                  {i < 3 && (
                                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                                      {i + 1}
                                    </span>
                                  )}
                                  <span className="truncate max-w-52">{a.agente}</span>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums">
                                {a.boletosGerados}
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums">
                                {a.pagosNoPrazo}
                              </td>
                              <td className={cn("py-2 px-3 text-right tabular-nums font-semibold", convColorClass(a.conversao))}>
                                {a.conversao}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      * Agentes cujo nome não aparece não atingiram o volume mínimo de boletos exigido para o ranking.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
