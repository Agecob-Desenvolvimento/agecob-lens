import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PeriodoFilter from "@/components/PeriodoFilter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useRefreshGuard } from "@/hooks/useRefreshGuard";
import { useProdutividadeData } from "@/hooks/useProdutividadeData";
import {
  type DatabaseOption,
  fetchPrimeiraParcelaDia,
} from "@/services/api";
import { trackEvent } from "@/services/analytics";
import ExecutiveHeader from "@/components/executive/ExecutiveHeader";
import ExecutiveKpiStrip from "@/components/executive/ExecutiveKpiStrip";
import ExecutiveInsightCard from "@/components/executive/ExecutiveInsightCard";
import ExecutiveRankingTable from "@/components/executive/ExecutiveRankingTable";
import ApiDebugBanner from "@/components/executive/ApiDebugBanner";
import BuValueChart, { type BuValueDatum } from "@/components/executive/BuValueChart";
import RitmoDiaCard from "@/components/executive/RitmoDiaCard";
import BuEfficiencyChart, { type BuEfficiencyDatum } from "@/components/executive/BuEfficiencyChart";
import {
  aggregateTotals,
  buFromSource,
  calcConversao,
  calcCpc,
  calcTicketMedio,
  fmtBRL,
  shortAgentName,
} from "@/lib/metrics";
import { generateDailyReadout } from "@/lib/insightEngine";
import type { ExecutiveKpi, RankingRow } from "@/types/executive";

function todayStr() { return new Date().toISOString().slice(0, 10); }
function firstOfMonthStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; }

export default function Index() {
  const [category, setCategory] = useState("Todas");
  const [assessoria, setAssessoria] = useState("todos");
  const [dateFrom, setDateFrom] = useState(firstOfMonthStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const selectedDatabase: DatabaseOption =
    category === "AUTOS"
      ? "COBwebRCBAUTOS"
      : category === "CONSUMER"
        ? "COBwebRCBCONSUMER"
        : "todos";
  const filters = assessoria === "todos"
    ? { dateFrom, dateTo }
    : { assessoria, dateFrom, dateTo };
  const { rows, loading, error: loadError, warnings, refresh } = useProdutividadeData(
    selectedDatabase,
    filters,
  );

  const [primeiraParcelaDia, setPrimeiraParcelaDia] = useState<{ total_valor: number; total_acordos: number } | null>(null);

  const { guardedRefresh, refreshing, remainingMs } = useRefreshGuard(async () => {
    const startedAt = performance.now();
    trackEvent("refresh_clicked", { page: "/" });
    try {
      await refresh();
      trackEvent("refresh_success", { page: "/", duration_ms: Math.round(performance.now() - startedAt) });
      window.dispatchEvent(new CustomEvent("dashboard:refresh", { detail: { route: "/" } }));
    } catch (err) {
      trackEvent("refresh_error", { page: "/", duration_ms: Math.round(performance.now() - startedAt) });
      throw err;
    }
  });

  const handleCategoryChange = (nextCategory: string) => {
    trackEvent("filter_changed", { page: "/", filter_name: "categoria", value: nextCategory });
    setCategory(nextCategory);
  };

  const handleAssessoriaChange = (nextAssessoria: string) => {
    trackEvent("filter_changed", { page: "/", filter_name: "assessoria", value: nextAssessoria });
    setAssessoria(nextAssessoria);
  };

  useEffect(() => {
    setPrimeiraParcelaDia(null);
    fetchPrimeiraParcelaDia(selectedDatabase, undefined, dateFrom, dateTo)
      .then((env) => {
        const row = env.data[0];
        if (row) setPrimeiraParcelaDia({ total_valor: Number(row.total_valor) || 0, total_acordos: Number(row.total_acordos) || 0 });
      })
      .catch(() => {});
  }, [selectedDatabase, dateFrom, dateTo]);

  const totals = useMemo(() => aggregateTotals(rows), [rows]);

  useEffect(() => {
    if (totals.valor_acordos <= 0) return;
    const ratio = (totals.valor_primeira_parcela * 100) / totals.valor_acordos;
    let severity: "critical" | "warning" | null = null;
    if (ratio > 0 && ratio < 5) severity = "critical";
    else if (ratio >= 5 && ratio < 10) severity = "warning";
    if (!severity) return;
    trackEvent("first_installment_ratio_alert", {
      severity,
      ratio_pct: Number(ratio.toFixed(2)),
      valor_primeira_parcela: totals.valor_primeira_parcela,
      valor_total_acordado: totals.valor_acordos,
      database: selectedDatabase,
    });
  }, [totals.valor_acordos, totals.valor_primeira_parcela, selectedDatabase]);

  const kpis: ExecutiveKpi[] = useMemo(() => {
    const cpc = calcCpc(totals);
    const conv = calcConversao(totals);
    const ticket = calcTicketMedio(totals);
    return [
      { label: "Valor de Acordos", value: totals.valor_acordos, unit: "BRL", priority: "primary", formula: "Σ valor_acordos", hint: "Soma total do valor acordado no período." },
      {
        label: "1ª Parcela",
        value: primeiraParcelaDia?.total_valor ?? totals.valor_primeira_parcela,
        unit: "BRL",
        priority: "primary",
        formula: "Σ primeira_parcela_do_dia",
        hint: "Entrada de caixa já garantida no dia.",
      },
      { label: "CPC %", value: cpc, unit: "%", priority: "primary", formula: "qtd_contatos / qtd_acionamentos", hint: "Contatos efetivos por acionamento." },
      { label: "Conversão %", value: conv, unit: "%", priority: "primary", formula: "qtd_acordos / qtd_acionamentos", hint: "Acordos fechados por acionamento." },
      { label: "Qtd Acordos", value: totals.qtd_acordos, unit: "count", priority: "secondary", formula: "Σ qtd_acordos" },
      { label: "Qtd Acionamentos", value: totals.qtd_acionamentos, unit: "count", priority: "secondary", formula: "Σ qtd_acionamentos" },
      { label: "Ticket Médio", value: ticket, unit: "BRL", priority: "secondary", formula: "valor_acordos / qtd_acordos" },
      { label: "Exceções (valor)", value: totals.valor_excecoes, unit: "BRL", priority: "secondary", formula: "Σ valor_excecoes" },
      { label: "1ª Parcela em Exceções", value: totals.valor_primeira_parcela_excecoes, unit: "BRL", priority: "secondary", formula: "Σ p1 onde status ∈ exceção" },
      { label: "Acordos em Exceções", value: totals.qtd_excecoes, unit: "count", priority: "secondary", formula: "Σ qtd_excecoes" },
    ];
  }, [rows, totals, primeiraParcelaDia]);

  const readout = useMemo(() => generateDailyReadout(rows), [rows]);

  const topByValor: RankingRow[] = useMemo(() => {
    return [...rows]
      .filter((r) => Number(r.valor_acordos || 0) > 0)
      .sort((a, b) => Number(b.valor_acordos || 0) - Number(a.valor_acordos || 0))
      .slice(0, 10)
      .map((row, idx) => ({
        rank: idx + 1,
        label: shortAgentName(row.NOME),
        primaryValue: Number(row.valor_acordos || 0),
        primaryUnit: "BRL" as const,
        secondaryValue: Number(row.qtd_acordos || 0),
        secondaryUnit: "count" as const,
      }));
  }, [rows]);

  const buData = useMemo(() => {
    const map = new Map<"AUTOS" | "CONSUMER", typeof rows>();
    rows.forEach((row) => {
      const bu = buFromSource(row.source);
      const arr = map.get(bu) ?? [];
      arr.push(row);
      map.set(bu, arr);
    });
    const order: ("AUTOS" | "CONSUMER")[] = ["AUTOS", "CONSUMER"];
    const valueData: BuValueDatum[] = order
      .filter((bu) => map.has(bu))
      .map((bu) => {
        const t = aggregateTotals(map.get(bu) ?? []);
        return { name: bu, valor_acordos: t.valor_acordos, valor_primeira_parcela: t.valor_primeira_parcela };
      });
    const effData: BuEfficiencyDatum[] = order
      .filter((bu) => map.has(bu))
      .map((bu) => {
        const t = aggregateTotals(map.get(bu) ?? []);
        return { name: bu, cpc: calcCpc(t), conversao: calcConversao(t) };
      });
    return { valueData, effData };
  }, [rows]);

  const cpcAvg = useMemo(() => calcCpc(totals), [totals]);
  const convAvg = useMemo(() => calcConversao(totals), [totals]);

  const filterChips = [
    { label: "Categoria", value: category },
    ...(assessoria !== "todos" ? [{ label: "Assessoria", value: assessoria }] : []),
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <ExecutiveHeader
            title="Dashboard Executivo · Produtividade Escritórios"
            onRefresh={guardedRefresh}
            refreshing={refreshing}
            refreshHint={remainingMs > 0 ? `Aguarde ${Math.ceil(remainingMs / 1000)}s` : "Atualizar"}
            period="Hoje"
            filters={filterChips}
          />

          <div className="flex-1 bg-background p-6 space-y-6 overflow-auto">
            {/* Filters */}
            <PeriodoFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Categoria (BU)</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 flex gap-2">
                  {["Todas", "AUTOS", "CONSUMER"].map((opt) => (
                    <Button
                      key={opt}
                      size="sm"
                      variant={category === opt ? "default" : "outline"}
                      onClick={() => handleCategoryChange(opt)}
                      className={
                        category === opt
                          ? "flex-1 bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600"
                          : "flex-1"
                      }
                    >
                      {opt}
                    </Button>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Assessoria</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <Select value={assessoria} onValueChange={handleAssessoriaChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="963:AGECOB_LP">963:AGECOB_LP</SelectItem>
                      <SelectItem value="todos">Todos</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </div>

            {/* API debug banner — aparece quando há falha de conexão */}
            <ApiDebugBanner
              error={loadError}
              warnings={warnings}
              onRetry={guardedRefresh}
            />

            {/* Resumo do Dia + Ritmo do Dia (merged) */}
            <Card>
              <ExecutiveInsightCard data={readout} loading={loading} embedded />
              <div className="border-t" />
              <RitmoDiaCard db={selectedDatabase} embedded />
            </Card>

            {/* KPIs */}
            <ExecutiveKpiStrip kpis={kpis} loading={loading} />

            {/* BU comparisons */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BuValueChart
                title="Valor por Unidade de Negócio"
                data={buData.valueData}
                empty={buData.valueData.length === 0}
                loading={loading}
              />
              <BuEfficiencyChart
                title="CPC % e Conversão % por Unidade de Negócio"
                data={buData.effData}
                cpcAverage={cpcAvg}
                conversaoAverage={convAvg}
                empty={buData.effData.length === 0}
                loading={loading}
              />
            </div>

            {/* Top agentes (single consolidated ranking) */}
            <ExecutiveRankingTable
              title="Top 10 Agentes por Valor de Acordos"
              rows={topByValor}
              primaryColumnLabel="Valor Acordos"
              secondaryColumnLabel="Qtd Acordos"
              loading={loading}
              empty={topByValor.length === 0}
            />
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
