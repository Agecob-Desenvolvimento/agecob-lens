import { useEffect, useMemo, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell, TableFooter,
} from "@/components/ui/table";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { type ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";
import { fetchTabelaPerformancePeriodo, type TabelaPerformancePeriodoRow, type DatabaseOption } from "@/services/api";
import {
  aggregateTotals,
  calcCpc,
  calcConversao,
  calcTicketMedio,
  fmtBRL,
  fmtNum,
  fmtPct,
} from "@/lib/metrics";

interface DetalhamentoChartsPanelProps {
  rows: ProdutividadeRowWithSource[];
  selectedAgent: string;
  db: DatabaseOption;
  primeiraParcelaSelecionada?: number;
  dateFrom?: string;
  dateTo?: string;
}

export default function DetalhamentoChartsPanel({
  rows,
  selectedAgent,
  db,
  primeiraParcelaSelecionada = 0,
  dateFrom,
  dateTo,
}: DetalhamentoChartsPanelProps) {
  const filtered = selectedAgent === "Todos" ? rows : rows.filter((row) => row.NOME === selectedAgent);
  const totals = aggregateTotals(filtered);
  const cpc = calcCpc(totals);
  const conversao = calcConversao(totals);
  const ticket = calcTicketMedio(totals);

  const [perfRows, setPerfRows] = useState<TabelaPerformancePeriodoRow[]>([]);
  const [loadingPerf, setLoadingPerf] = useState(false);
  const [perfError, setPerfError] = useState<string | null>(null);
  const [perfExpanded, setPerfExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingPerf(true);
    setPerfError(null);
    fetchTabelaPerformancePeriodo(db, selectedAgent, dateFrom, dateTo)
      .then((env) => {
        if (cancelled) return;
        setPerfRows(env.data ?? []);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setPerfError(err.message || "Falha ao carregar tabela de performance.");
        setPerfRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPerf(false);
      });
    return () => { cancelled = true; };
  }, [db, selectedAgent, dateFrom, dateTo]);

  const perfTotals = useMemo(() => {
    return perfRows.reduce(
      (acc, r) => ({
        qtd_acionamentos: acc.qtd_acionamentos + Number(r.qtd_acionamentos),
        qtd_contatos: acc.qtd_contatos + Number(r.qtd_contatos),
        qtd_acordos: acc.qtd_acordos + Number(r.qtd_acordos),
        valor_total: acc.valor_total + Number(r.valor_total),
        soma_primeira_parcela: acc.soma_primeira_parcela + Number(r.soma_primeira_parcela),
        qtd_reprovados: acc.qtd_reprovados + Number(r.qtd_reprovados),
        qtd_excecoes: acc.qtd_excecoes + Number(r.qtd_excecoes),
        valor_excecoes: acc.valor_excecoes + Number(r.valor_excecoes),
      }),
      { qtd_acionamentos: 0, qtd_contatos: 0, qtd_acordos: 0, valor_total: 0, soma_primeira_parcela: 0, qtd_reprovados: 0, qtd_excecoes: 0, valor_excecoes: 0 },
    );
  }, [perfRows]);

  if (filtered.length === 0) {
    return <div className="text-sm text-muted-foreground">Nenhum dado disponível para o agente selecionado.</div>;
  }

  const volumeData = [
    { name: "Acionamentos", value: totals.qtd_acionamentos },
    { name: "Contatos", value: totals.qtd_contatos },
  ];
  const valoresData = [
    {
      name: "1ª Parcela",
      value: primeiraParcelaSelecionada,
    },
    { name: "Valor Acordos", value: totals.valor_acordos },
  ];

  const perfTable = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-sm font-semibold whitespace-nowrap">Agente</TableHead>
          <TableHead className="text-sm font-semibold whitespace-nowrap">Matrícula</TableHead>
          <TableHead className="text-sm font-semibold text-right whitespace-nowrap">Acionamentos</TableHead>
          <TableHead className="text-sm font-semibold text-right whitespace-nowrap">CPC %</TableHead>
          <TableHead className="text-sm font-semibold text-right whitespace-nowrap">Acordos</TableHead>
          <TableHead className="text-sm font-semibold text-right whitespace-nowrap">Conversão %</TableHead>
          <TableHead className="text-sm font-semibold text-right whitespace-nowrap">Valor Total</TableHead>
          <TableHead className="text-sm font-semibold text-right whitespace-nowrap">1ª Parcela</TableHead>
          <TableHead className="text-sm font-semibold text-right whitespace-nowrap">Reprovados</TableHead>
          <TableHead className="text-sm font-semibold text-right whitespace-nowrap">Exceções</TableHead>
          <TableHead className="text-sm font-semibold text-right whitespace-nowrap">Valor Exceções</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {perfRows.map((row) => (
          <TableRow key={row.nome_agente}>
            <TableCell className="text-sm max-w-[200px] truncate" title={row.nome_agente}>{row.nome_agente}</TableCell>
            <TableCell className="text-sm tabular-nums whitespace-nowrap">{row.matricula || "—"}</TableCell>
            <TableCell className="text-sm text-right tabular-nums whitespace-nowrap">{fmtNum(Number(row.qtd_acionamentos))}</TableCell>
            <TableCell className="text-sm text-right tabular-nums whitespace-nowrap">{Number(row.cpc_pct).toFixed(1)}%</TableCell>
            <TableCell className="text-sm text-right tabular-nums whitespace-nowrap">{fmtNum(Number(row.qtd_acordos))}</TableCell>
            <TableCell className="text-sm text-right tabular-nums whitespace-nowrap">{Number(row.conversao_pct).toFixed(1)}%</TableCell>
            <TableCell className="text-sm text-right tabular-nums whitespace-nowrap">{fmtBRL(Number(row.valor_total))}</TableCell>
            <TableCell className="text-sm text-right tabular-nums whitespace-nowrap">{fmtBRL(Number(row.soma_primeira_parcela))}</TableCell>
            <TableCell className="text-sm text-right tabular-nums whitespace-nowrap">{fmtNum(Number(row.qtd_reprovados))}</TableCell>
            <TableCell className="text-sm text-right tabular-nums whitespace-nowrap">{fmtNum(Number(row.qtd_excecoes))}</TableCell>
            <TableCell className="text-sm text-right tabular-nums whitespace-nowrap">{fmtBRL(Number(row.valor_excecoes))}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2} className="text-sm font-semibold">{perfRows.length} agente(s)</TableCell>
          <TableCell className="text-sm text-right font-semibold tabular-nums whitespace-nowrap">{fmtNum(perfTotals.qtd_acionamentos)}</TableCell>
          <TableCell className="text-sm text-right font-semibold tabular-nums whitespace-nowrap">
            {perfTotals.qtd_acionamentos > 0
              ? `${(perfTotals.qtd_contatos * 100 / perfTotals.qtd_acionamentos).toFixed(1)}%`
              : "—"}
          </TableCell>
          <TableCell className="text-sm text-right font-semibold tabular-nums whitespace-nowrap">{fmtNum(perfTotals.qtd_acordos)}</TableCell>
          <TableCell className="text-sm text-right font-semibold tabular-nums whitespace-nowrap">
            {perfTotals.qtd_acionamentos > 0
              ? `${(perfTotals.qtd_acordos * 100 / perfTotals.qtd_acionamentos).toFixed(1)}%`
              : "—"}
          </TableCell>
          <TableCell className="text-sm text-right font-semibold tabular-nums whitespace-nowrap">{fmtBRL(perfTotals.valor_total)}</TableCell>
          <TableCell className="text-sm text-right font-semibold tabular-nums whitespace-nowrap">{fmtBRL(perfTotals.soma_primeira_parcela)}</TableCell>
          <TableCell className="text-sm text-right font-semibold tabular-nums whitespace-nowrap">{fmtNum(perfTotals.qtd_reprovados)}</TableCell>
          <TableCell className="text-sm text-right font-semibold tabular-nums whitespace-nowrap">{fmtNum(perfTotals.qtd_excecoes)}</TableCell>
          <TableCell className="text-sm text-right font-semibold tabular-nums whitespace-nowrap">{fmtBRL(perfTotals.valor_excecoes)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-base font-semibold leading-snug">Volume — Acionamentos × Contatos</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={volumeData} margin={{ top: 24, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => fmtNum(v)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip formatter={(v: number) => fmtNum(v)} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={56}>
                  <Cell fill="hsl(217, 91%, 45%)" />
                  <Cell fill="hsl(217, 91%, 70%)" />
                  <LabelList dataKey="value" position="top" formatter={(v: number) => fmtNum(v)} style={{ fontSize: 12, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2">
              CPC: <span className="font-semibold text-foreground tabular-nums">{fmtPct(cpc)}</span> · Conversão: <span className="font-semibold text-foreground tabular-nums">{fmtPct(conversao)}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-base font-semibold leading-snug">Valores — 1ª Parcela × Total Acordos</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={valoresData} margin={{ top: 24, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => fmtBRL(v, { compact: true })} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={56}>
                  <Cell fill="hsl(142, 65%, 55%)" />
                  <Cell fill="hsl(142, 71%, 38%)" />
                  <LabelList dataKey="value" position="top" formatter={(v: number) => fmtBRL(v, { compact: true })} style={{ fontSize: 12, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2">
              Ticket médio: <span className="font-semibold text-foreground tabular-nums">{ticket > 0 ? fmtBRL(ticket) : "—"}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold leading-snug">
            Performance por Agente{dateFrom && dateTo ? ` — ${dateFrom} a ${dateTo}` : " — Abr/2026 a Mai/2026"}
          </CardTitle>
          {perfRows.length > 0 ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setPerfExpanded(true)}
              aria-label="Tela cheia"
              title="Tela cheia"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="px-4 pb-3 overflow-auto">
          {loadingPerf ? (
            <p className="text-sm text-muted-foreground">Carregando tabela de performance...</p>
          ) : perfError ? (
            <p className="text-sm text-destructive">{perfError}</p>
          ) : perfRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum dado encontrado para o período.</p>
          ) : (
            perfTable
          )}
        </CardContent>
      </Card>

      <Dialog open={perfExpanded} onOpenChange={setPerfExpanded}>
        <DialogContent className="max-w-[95vw] w-[95vw] sm:max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Performance por Agente{dateFrom && dateTo ? ` — ${dateFrom} a ${dateTo}` : " — Abr/2026 a Mai/2026"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto pr-2">
            {perfTable}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
