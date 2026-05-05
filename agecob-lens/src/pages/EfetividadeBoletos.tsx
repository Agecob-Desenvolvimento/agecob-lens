import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  fetchEfMensalColchao,
  fetchEfMensalColchaoVencimento,
  fetchEfMensalPrimeira,
  fetchEfResumo,
  type EfResumoDayRow,
} from "@/services/api";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ── Constants ──────────────────────────────────────────────────────
const MONTH_ABBR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// ── Types ────────────────────────────────────────────────────────────
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
function toISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

function fmtDia(dateStr: string): string {
  const [, month, day] = dateStr.split("-");
  return `${day}/${month}`;
}

function fmtBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Number(value).toFixed(2)}%`;
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

function monthInRange(year: number, month: number, dateFrom: string, dateTo: string): boolean {
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonthStart =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return monthStart <= dateTo && nextMonthStart > dateFrom;
}

// ── Simple KPI card ─────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  colorClass,
  highlight,
  sub,
  tooltip,
}: {
  label: string;
  value: string;
  colorClass?: string;
  highlight?: boolean;
  sub?: string;
  tooltip?: string;
}) {
  const card = (
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
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
  if (!tooltip) return card;
  return (
    <TooltipProvider>
      <UITooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
      </UITooltip>
    </TooltipProvider>
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
  const [banco, setBanco] = useState<"todos" | "COBwebRCBAUTOS" | "COBwebRCBCONSUMER">("todos");
  const [dateFrom, setDateFrom] = useState(
    toISO(new Date(now.getFullYear(), now.getMonth(), 1)),
  );
  const [dateTo, setDateTo] = useState(toISO(now));

  const dbParam = banco === "todos" ? undefined : banco;

  // ── Live resumo query (KPIs + daily chart) ───────────────────────
  const { data: resumoEnv, isLoading: loadingResumo, error: errResumo } = useQuery({
    queryKey: ["ef-resumo", dateFrom, dateTo, banco, tipo],
    queryFn: () => fetchEfResumo(dateFrom, dateTo, dbParam, tipo),
    enabled: !!dateFrom && !!dateTo && dateFrom <= dateTo,
  });

  // ── ETL queries for monthly trend + agent ranking ─────────────────
  const { data: mpEnv } = useQuery({ queryKey: ["ef-mensal-primeira", banco], queryFn: () => fetchEfMensalPrimeira(dbParam) });
  const { data: mcEnv } = useQuery({ queryKey: ["ef-mensal-colchao", banco], queryFn: () => fetchEfMensalColchao(dbParam) });
  const { data: mcvEnv } = useQuery({ queryKey: ["ef-mensal-colchao-vencimento", banco], queryFn: () => fetchEfMensalColchaoVencimento(dbParam) });
  const { data: apEnv } = useQuery({ queryKey: ["ef-agente-primeira", banco], queryFn: () => fetchEfAgentePrimeira(dbParam) });
  const { data: acEnv } = useQuery({ queryKey: ["ef-agente-colchao", banco], queryFn: () => fetchEfAgenteColchao(dbParam) });
  const { data: acvEnv } = useQuery({ queryKey: ["ef-agente-colchao-vencimento", banco], queryFn: () => fetchEfAgenteColchaoVencimento(dbParam) });

  const resumo = resumoEnv?.data;
  const kpis = resumo?.kpis;
  const daily: EfResumoDayRow[] = resumo?.daily ?? [];

  // ── Derived chart data ───────────────────────────────────────────
  const melhorDia = resumo?.best_day ?? null;
  const piorDia = resumo?.worst_day ?? null;

  // ── Normalize mensal (for monthly trend) ─────────────────────────
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

  const mensalChart = useMemo(() => mensalAll.filter((m) => m.conversao > 0), [mensalAll]);

  const avgConversao = useMemo(() => {
    if (!mensalChart.length) return 0;
    return Math.round(mensalChart.reduce((s, m) => s + m.conversao, 0) / mensalChart.length);
  }, [mensalChart]);

  // ── Agent ranking filtered to date range ─────────────────────────
  const agentesAll = useMemo((): AgenteData[] => {
    const src = tipo === "primeira"
      ? (apEnv?.data ?? [])
      : colchaoView === "vencimento" ? (acvEnv?.data ?? []) : (acEnv?.data ?? []);

    const inRange = src.filter((r) => monthInRange(r.Ano, r.Mes, dateFrom, dateTo));

    const byAgent = new Map<string, { gerados: number; pagos: number }>();
    for (const r of inRange) {
      const gerados = tipo === "primeira" ? (r as any).Boletos_Gerados : (r as any).Boletos_Gerados_Colchao;
      const prev = byAgent.get(r.Agente) ?? { gerados: 0, pagos: 0 };
      byAgent.set(r.Agente, { gerados: prev.gerados + gerados, pagos: prev.pagos + r.Pagos_No_Prazo });
    }

    return Array.from(byAgent.entries())
      .map(([agente, { gerados, pagos }]) => ({
        agente,
        boletosGerados: gerados,
        pagosNoPrazo: pagos,
        conversao: gerados > 0 ? Math.round((pagos / gerados) * 100) : 0,
      }))
      .filter((a) => a.boletosGerados >= 10)
      .sort((a, b) => b.conversao - a.conversao);
  }, [tipo, colchaoView, apEnv, acEnv, acvEnv, dateFrom, dateTo]);

  const agentChartHeight = Math.max(180, Math.min(500, agentesAll.length * 34));

  const periodLabel = `${dateFrom} → ${dateTo}`;

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
              { label: "Banco", value: banco === "todos" ? "Todas" : banco === "COBwebRCBAUTOS" ? "AUTOS" : "CONSUMER" },
            ]}
          />

          <div className="flex-1 bg-background p-6 space-y-6 overflow-auto">

            {/* ── Global Filters ─────────────────────────────────── */}
            <div className="flex flex-wrap gap-3 items-end">
              {/* Date range */}
              <Card className="flex-none">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Período
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs text-muted-foreground">De</label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-36 h-8 text-sm"
                    />
                  </div>
                  <span className="text-muted-foreground mt-4">→</span>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs text-muted-foreground">Até</label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-36 h-8 text-sm"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Banco */}
              <Card className="flex-none">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Banco
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <Select value={banco} onValueChange={(v) => setBanco(v as typeof banco)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas</SelectItem>
                      <SelectItem value="COBwebRCBAUTOS">AUTOS</SelectItem>
                      <SelectItem value="COBwebRCBCONSUMER">CONSUMER</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Tipo */}
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

            {/* ── Date validation warning ──────────────────────────── */}
            {dateFrom > dateTo && (
              <Card className="border-destructive/50">
                <CardContent className="py-3 text-sm text-destructive">
                  A data inicial deve ser anterior ou igual à data final.
                </CardContent>
              </Card>
            )}

            {/* ── Error state ─────────────────────────────────────── */}
            {errResumo && !loadingResumo && (
              <Card className="border-destructive/50">
                <CardContent className="py-3 text-sm text-destructive">
                  Erro ao carregar dados de efetividade. Verifique a conexão com o banco.
                </CardContent>
              </Card>
            )}

            {/* ── Section 1: KPI Row 1 — Counts + Effectiveness ───── */}
            {loadingResumo ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard
                  label="Boletos Gerados"
                  value={kpis ? String(kpis.generated) : "—"}
                />
                <KpiCard
                  label="Pagos no Prazo"
                  value={kpis ? String(kpis.paid_on_time) : "—"}
                />
                <KpiCard
                  label="% Conversão"
                  value={kpis ? fmtPct(kpis.conversion_pct) : "—"}
                  colorClass={kpis ? convColorClass(kpis.conversion_pct) : undefined}
                  highlight
                />
                <KpiCard
                  label="Efetividade"
                  value={kpis ? fmtPct(kpis.effectiveness_pct) : "—"}
                  colorClass={kpis ? convColorClass(kpis.effectiveness_pct) : undefined}
                  highlight
                  sub="Recebido / Emitido"
                  tooltip="Efetividade = Valor Recebido / Valor dos Boletos Vencendo. Pode exceder 100% quando o valor pago inclui juros ou multa além do valor de face."
                />
              </div>
            )}

            {/* ── Section 2: KPI Row 2 — Amounts + Days ───────────── */}
            {loadingResumo ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard
                  label="Valor de Boletos Vencendo"
                  value={kpis ? fmtBRL(Number(kpis.amount_maturing)) : "—"}
                />
                <KpiCard
                  label="Valor Recebido"
                  value={kpis ? fmtBRL(Number(kpis.amount_received)) : "—"}
                  colorClass="text-emerald-600"
                />
                <KpiCard
                  label="Melhor Dia"
                  value={melhorDia ? `${fmtDia(melhorDia.dia)} – ${fmtPct(melhorDia.effectiveness_pct)}` : "—"}
                  colorClass="text-emerald-600"
                />
                <KpiCard
                  label="Pior Dia"
                  value={piorDia ? `${fmtDia(piorDia.dia)} – ${fmtPct(piorDia.effectiveness_pct)}` : "—"}
                  colorClass="text-rose-600"
                />
              </div>
            )}

            {/* ── Section 3: Daily Chart ───────────────────────────── */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold">
                  Efetividade Diária por Data de Vencimento — {periodLabel}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {loadingResumo ? (
                  <Skeleton className="h-72 w-full" />
                ) : daily.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">
                    Sem dados para o período selecionado.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={daily} margin={{ top: 24, right: 52, left: 0, bottom: 8 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" />
                      <XAxis
                        dataKey="dia"
                        tickLine={false}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => fmtDia(v)}
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
                          name === "Efetividade %" ? [`${value}%`, name] : [value, name]
                        }
                        labelFormatter={(v) => fmtDia(v)}
                      />
                      <Bar
                        yAxisId="boletos"
                        dataKey="generated"
                        name="Boletos Gerados"
                        fill="hsl(var(--primary))"
                        opacity={0.55}
                        radius={[2, 2, 0, 0]}
                      />
                      <Line
                        yAxisId="conv"
                        type="monotone"
                        dataKey="effectiveness_pct"
                        name="Efetividade %"
                        stroke="#16a34a"
                        strokeWidth={2}
                        dot={(props: any) => {
                          const { cx, cy, payload, key } = props;
                          const isMax = payload.dia === melhorDia?.dia;
                          const isMin = payload.dia === piorDia?.dia;
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
                          dataKey="effectiveness_pct"
                          content={(props: any) => {
                            const { x, y, value, index } = props;
                            const d = daily[index];
                            if (!d) return null;
                            const isMax = d.dia === melhorDia?.dia;
                            const isMin = d.dia === piorDia?.dia;
                            if (!isMax && !isMin) return null;
                            return (
                              <text
                                key={`lbl-${d.dia}`}
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

            {/* ── Section 4: Monthly Trend (ETL-based) ─────────────── */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold">Tendência Mensal — % Conversão (histórico)</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {mensalChart.length === 0 ? (
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

            {/* ── Section 5: Agent Ranking ──────────────────────────── */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold">
                  {tipo === "colchao"
                    ? `Agentes (Colchão · ${colchaoView === "vencimento" ? "Por Vencimento" : "Por Emissão"}) — ${periodLabel}`
                    : `Ranking de Agentes — ${periodLabel}`}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                {agentesAll.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">
                    Sem dados de agentes para o período selecionado.
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
                              <td className="py-2 px-3 text-right tabular-nums">{a.boletosGerados}</td>
                              <td className="py-2 px-3 text-right tabular-nums">{a.pagosNoPrazo}</td>
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
