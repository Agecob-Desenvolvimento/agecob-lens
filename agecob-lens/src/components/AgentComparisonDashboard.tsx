import { useEffect, useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { type DatabaseOption } from "@/services/api";
import { useProdutividadeData } from "@/hooks/useProdutividadeData";
import { AlertTriangle, Maximize2, Minimize2 } from "lucide-react";
import {
  aggregateTotals,
  buFromSource,
  calcConcentracao,
  calcConversao,
  calcCpc,
  calcExcecoesPctQtd,
  calcTicketMedio,
  fmtBRL,
  fmtNum,
  fmtPct,
} from "@/lib/metrics";
import ExecutiveKpiStrip from "@/components/executive/ExecutiveKpiStrip";
import EffortResultScatter, { type EffortResultDatum } from "@/components/executive/EffortResultScatter";
import SectionHeader from "@/components/executive/SectionHeader";
import type { ExecutiveKpi } from "@/types/executive";

const TABLE_COLUMNS = [
  { key: "agente", label: "Agente" },
  { key: "qtd_acionamentos", label: "Acionamentos" },
  { key: "cpc_percentual", label: "CPC %" },
  { key: "qtd_acordos", label: "Acordos" },
  { key: "taxa_conversao", label: "Conversão %" },
  { key: "valor_acordos", label: "Valor Acordos" },
];

interface AgentComparisonDashboardProps {
  db: DatabaseOption;
  assessoria?: string;
  dateFrom?: string;
  dateTo?: string;
}

export default function AgentComparisonDashboard({ db, assessoria = "todos", dateFrom, dateTo }: AgentComparisonDashboardProps) {
  const { rows, loading, error, warnings } = useProdutividadeData(db, { assessoria, dateFrom, dateTo });
  const [isTableFullscreen, setIsTableFullscreen] = useState(false);
  const [sortKey, setSortKey] = useState<string>("valor_acordos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (!isTableFullscreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsTableFullscreen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [isTableFullscreen]);

  const totals = useMemo(() => aggregateTotals(rows), [rows]);

  const tableData = useMemo(() => {
    return rows.map((row) => {
      const conv = row.qtd_acionamentos > 0 ? (row.qtd_acordos * 100) / row.qtd_acionamentos : 0;
      return {
        agente: row.NOME,
        qtd_acionamentos: row.qtd_acionamentos,
        cpc_percentual: row.cpc_percentual,
        qtd_acordos: row.qtd_acordos,
        taxa_conversao: conv,
        valor_acordos: row.valor_acordos,
      };
    });
  }, [rows]);

  const sortedTable = useMemo(() => {
    const arr = [...tableData];
    arr.sort((a, b) => {
      const av = a[sortKey as keyof typeof a];
      const bv = b[sortKey as keyof typeof b];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv), "pt-BR")
        : String(bv).localeCompare(String(av), "pt-BR");
    });
    return arr;
  }, [tableData, sortKey, sortDir]);

  const scatterData: EffortResultDatum[] = useMemo(
    () =>
      rows
        .filter((r) => r.qtd_acionamentos > 0 || r.valor_acordos > 0)
        .map((r) => ({
          agente: r.NOME,
          qtd_acionamentos: r.qtd_acionamentos,
          valor_acordos: r.valor_acordos,
          bu: buFromSource(r.source),
        })),
    [rows],
  );

  const kpis = useMemo<ExecutiveKpi[]>(() => {
    if (!rows.length) return [];
    const valores = rows.map((r) => Number(r.valor_acordos || 0)).filter((v) => v > 0);
    const sortedVals = [...valores].sort((a, b) => a - b);
    const median = sortedVals.length === 0 ? 0 : sortedVals.length % 2 === 0
      ? (sortedVals[sortedVals.length / 2 - 1] + sortedVals[sortedVals.length / 2]) / 2
      : sortedVals[Math.floor(sortedVals.length / 2)];
    const best = sortedVals[sortedVals.length - 1] ?? 0;
    const worst = sortedVals[0] ?? 0;
    const mean = valores.length ? valores.reduce((a, v) => a + v, 0) / valores.length : 0;
    const variance = valores.length ? valores.reduce((a, v) => a + (v - mean) ** 2, 0) / valores.length : 0;
    const std = Math.sqrt(variance);
    return [
      { label: "Melhor", value: best, unit: "BRL", priority: "primary", formula: "max(valor_acordos)" },
      { label: "Mediana", value: median, unit: "BRL", priority: "primary", formula: "median(valor_acordos)" },
      { label: "Pior (>0)", value: worst, unit: "BRL", priority: "primary", formula: "min(valor_acordos > 0)" },
      { label: "Dispersão", value: std, unit: "BRL", priority: "primary", formula: "stddev(valor_acordos)" },
      { label: "Concentração Top 3", value: calcConcentracao(rows, 3), unit: "%", priority: "secondary", formula: "Σ Top3 / Σ total" },
      { label: "Conversão", value: calcConversao(totals), unit: "%", priority: "secondary", formula: "qtd_acordos / qtd_acionamentos" },
      { label: "CPC", value: calcCpc(totals), unit: "%", priority: "secondary", formula: "qtd_contatos / qtd_acionamentos" },
      { label: "Ticket médio", value: calcTicketMedio(totals), unit: "BRL", priority: "secondary", formula: "valor_acordos / qtd_acordos" },
      { label: "Exceções (% qtd)", value: calcExcecoesPctQtd(totals), unit: "%", priority: "secondary", formula: "qtd_excecoes / qtd_acordos" },
    ];
  }, [rows, totals]);

  // Top 3 opportunities/risks: opportunities = high effort, low result; risks = high exception rate
  const opportunitiesAndRisks = useMemo(() => {
    const opportunities = [...rows]
      .filter((r) => r.qtd_acionamentos > 0)
      .map((r) => ({
        nome: r.NOME,
        acionamentos: r.qtd_acionamentos,
        valor: r.valor_acordos,
        ratio: r.valor_acordos / r.qtd_acionamentos,
      }))
      .sort((a, b) => a.ratio - b.ratio)
      .slice(0, 3);
    const risks = [...rows]
      .filter((r) => r.qtd_acordos > 0 && r.qtd_excecoes > 0)
      .map((r) => ({
        nome: r.NOME,
        taxa: (r.qtd_excecoes * 100) / r.qtd_acordos,
        qtd: r.qtd_excecoes,
      }))
      .sort((a, b) => b.taxa - a.taxa)
      .slice(0, 3);
    return { opportunities, risks };
  }, [rows]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>Erro ao carregar dados: {error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-muted-foreground">Nenhum dado disponível.</p>
        </CardContent>
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

      <SectionHeader title="Síntese comparativa" description="Resumo de performance entre agentes (best, mediana, pior, dispersão)." />
      <ExecutiveKpiStrip kpis={kpis} />

      <SectionHeader title="Esforço × Resultado" description="Cada ponto é um agente. Linhas tracejadas = mediana. Quadrante superior-esquerdo = estrelas; superior-direito = alto-volume." />
      <EffortResultScatter title="Acionamentos × Valor de Acordos" data={scatterData} />

      <SectionHeader title="Detalhamento por agente" description="Ordene clicando nas colunas." />
      <Card className={isTableFullscreen ? "fixed inset-0 z-50 rounded-none border-0 flex flex-col bg-background" : ""}>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Tabela comparativa</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsTableFullscreen((v) => !v)}
            title={isTableFullscreen ? "Sair da tela cheia (Esc)" : "Expandir"}
          >
            {isTableFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent className={isTableFullscreen ? "flex-1 overflow-hidden" : ""}>
          <div className={isTableFullscreen ? "overflow-auto h-full" : "overflow-auto max-h-96"}>
            <Table>
              <TableHeader>
                <TableRow>
                  {TABLE_COLUMNS.map((col) => (
                    <TableHead
                      key={col.key}
                      className="text-xs font-semibold whitespace-nowrap cursor-pointer select-none"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      {sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTable.map((row, i) => (
                  <TableRow key={`${row.agente}-${i}`}>
                    {TABLE_COLUMNS.map((col) => {
                      const val = row[col.key as keyof typeof row];
                      let displayValue: string = "—";
                      if (col.key === "valor_acordos" && typeof val === "number") displayValue = fmtBRL(val);
                      else if ((col.key === "cpc_percentual" || col.key === "taxa_conversao") && typeof val === "number") displayValue = fmtPct(val);
                      else if (typeof val === "number") displayValue = fmtNum(val);
                      else if (val != null) displayValue = String(val);
                      const isNumeric = col.key !== "agente";
                      return (
                        <TableCell
                          key={col.key}
                          className={`text-sm ${isNumeric ? "tabular-nums whitespace-nowrap text-right" : "max-w-[220px] truncate"}`}
                          title={displayValue}
                        >
                          {displayValue}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <SectionHeader title="Quem priorizar hoje" description="Top 3 oportunidades (mais esforço por menos resultado) e Top 3 riscos (maior taxa de exceções)." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-base font-semibold">Top 3 Oportunidades</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {opportunitiesAndRisks.opportunities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados suficientes.</p>
            ) : (
              opportunitiesAndRisks.opportunities.map((o, i) => (
                <div key={`opp-${i}`} className="flex items-center justify-between text-sm">
                  <span className="truncate">{i + 1}. {o.nome}</span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {fmtNum(o.acionamentos)} acc · {fmtBRL(o.valor)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-base font-semibold">Top 3 Riscos (taxa de exceções)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {opportunitiesAndRisks.risks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem exceções relevantes.</p>
            ) : (
              opportunitiesAndRisks.risks.map((r, i) => (
                <div key={`risk-${i}`} className="flex items-center justify-between text-sm">
                  <span className="truncate">{i + 1}. {r.nome}</span>
                  <span className="text-amber-600 tabular-nums shrink-0">
                    {fmtPct(r.taxa)} ({fmtNum(r.qtd)})
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
