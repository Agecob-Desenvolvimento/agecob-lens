import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell, TableFooter,
} from "@/components/ui/table";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { type ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";
import { fetchAcordosHojeAgente, type AcordoHojeAgenteRow, type DatabaseOption } from "@/services/api";
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
  primeiraParcelaTotalDia?: number | null;
}

function normalizeAgreementType(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function isExceptionAgreement(value: string): boolean {
  return normalizeAgreementType(value) === "EXCECAO";
}

function isApprovedAgreement(value: string): boolean {
  const normalized = normalizeAgreementType(value);
  return normalized === "ATIVO" || normalized === "BAIXA POR PAGAMENTO" || normalized === "BAIXA POR PAGAMENTO AVULSO";
}

function formatDateBr(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export default function DetalhamentoChartsPanel({
  rows,
  selectedAgent,
  db,
  primeiraParcelaTotalDia,
}: DetalhamentoChartsPanelProps) {
  const filtered = selectedAgent === "Todos" ? rows : rows.filter((row) => row.NOME === selectedAgent);
  const totals = aggregateTotals(filtered);
  const cpc = calcCpc(totals);
  const conversao = calcConversao(totals);
  const ticket = calcTicketMedio(totals);

  const [acordosHoje, setAcordosHoje] = useState<AcordoHojeAgenteRow[]>([]);
  const [loadingAcordos, setLoadingAcordos] = useState(false);
  const [acordosError, setAcordosError] = useState<string | null>(null);
  const [tableExpanded, setTableExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingAcordos(true);
    setAcordosError(null);
    fetchAcordosHojeAgente(db, selectedAgent)
      .then((env) => {
        if (cancelled) return;
        setAcordosHoje(env.data ?? []);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setAcordosError(err.message || "Falha ao carregar acordos do dia.");
        setAcordosHoje([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAcordos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [db, selectedAgent]);

  const sortedAcordos = useMemo(() => {
    return [...acordosHoje].sort((a, b) => {
      const aIsExc = isExceptionAgreement(a.tipo_acordo);
      const bIsExc = isExceptionAgreement(b.tipo_acordo);
      if (aIsExc !== bIsExc) return aIsExc ? 1 : -1;
      const cpfCmp = String(a.cpf_cnpj || "").localeCompare(String(b.cpf_cnpj || ""), "pt-BR");
      if (cpfCmp !== 0) return cpfCmp;
      return Number(a.nr_acordo) - Number(b.nr_acordo);
    });
  }, [acordosHoje]);

  const tableTotals = useMemo(() => {
    const totalPrimeira = sortedAcordos.reduce((acc, row) => acc + Number(row.valor_primeira_parcela || 0), 0);
    const totalAcordosValor = sortedAcordos.reduce((acc, row) => acc + Number(row.valor_total_acordo || 0), 0);
    const approvedCount = sortedAcordos.filter((row) => isApprovedAgreement(row.tipo_acordo)).length;
    const exceptionCount = sortedAcordos.filter((row) => isExceptionAgreement(row.tipo_acordo)).length;
    return { totalPrimeira, totalAcordosValor, approvedCount, exceptionCount };
  }, [sortedAcordos]);

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
      value: selectedAgent === "Todos"
        ? (primeiraParcelaTotalDia ?? totals.valor_primeira_parcela)
        : totals.valor_primeira_parcela,
    },
    { name: "Valor Acordos", value: totals.valor_acordos },
  ];

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
        <CardHeader className="pb-2 pt-3 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold leading-snug">Acordos Registrados Hoje</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setTableExpanded((v) => !v)}>
            {tableExpanded ? <><ChevronUp className="h-4 w-4 mr-1" />Recolher</> : <><ChevronDown className="h-4 w-4 mr-1" />Expandir</>}
          </Button>
        </CardHeader>
        {tableExpanded ? (
          <CardContent className="px-4 pb-3 overflow-auto">
            {loadingAcordos ? (
              <p className="text-sm text-muted-foreground">Carregando acordos de hoje...</p>
            ) : acordosError ? (
              <p className="text-sm text-destructive">{acordosError}</p>
            ) : sortedAcordos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum acordo registrado hoje.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-sm font-semibold whitespace-nowrap">CPF</TableHead>
                    <TableHead className="text-sm font-semibold">Devedor</TableHead>
                    <TableHead className="text-sm font-semibold whitespace-nowrap">Tipo</TableHead>
                    <TableHead className="text-sm font-semibold whitespace-nowrap">Vencimento 1ª</TableHead>
                    <TableHead className="text-sm font-semibold text-right whitespace-nowrap">1ª Parcela</TableHead>
                    <TableHead className="text-sm font-semibold text-right whitespace-nowrap">Demais Parcelas</TableHead>
                    <TableHead className="text-sm font-semibold text-right whitespace-nowrap">Parcelas</TableHead>
                    <TableHead className="text-sm font-semibold text-right whitespace-nowrap">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAcordos.map((row) => {
                    const exception = isExceptionAgreement(row.tipo_acordo);
                    return (
                      <TableRow key={`${row.nr_acordo}-${row.cpf_cnpj}`}>
                        <TableCell className="text-sm tabular-nums whitespace-nowrap">{row.cpf_cnpj}</TableCell>
                        <TableCell className="text-sm max-w-[240px] truncate" title={row.nome_devedor ?? undefined}>{row.nome_devedor}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${exception ? "bg-amber-200 text-amber-900" : "bg-emerald-200 text-emerald-900"}`}>
                            {row.tipo_acordo}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums whitespace-nowrap">{formatDateBr(row.vencimento_primeira_parcela)}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums whitespace-nowrap">{row.valor_primeira_parcela != null ? fmtBRL(Number(row.valor_primeira_parcela)) : "—"}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums whitespace-nowrap">{row.valor_demais_parcelas != null ? fmtBRL(Number(row.valor_demais_parcelas)) : "—"}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums whitespace-nowrap">{`${Math.max(1, Number(row.qtd_parcelas || 1))}x`}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums whitespace-nowrap">{fmtBRL(Number(row.valor_total_acordo))}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="text-sm font-semibold">
                      Totais: {tableTotals.approvedCount} aprovados / {tableTotals.exceptionCount} exceção(ões)
                    </TableCell>
                    <TableCell className="text-sm text-right font-semibold tabular-nums whitespace-nowrap">{fmtBRL(tableTotals.totalPrimeira)}</TableCell>
                    <TableCell className="text-sm text-right">—</TableCell>
                    <TableCell className="text-sm text-right tabular-nums">{sortedAcordos.length}</TableCell>
                    <TableCell className="text-sm text-right font-semibold tabular-nums whitespace-nowrap">{fmtBRL(tableTotals.totalAcordosValor)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </CardContent>
        ) : (
          <CardContent className="px-4 pb-3">
            <p className="text-sm text-muted-foreground">
              {sortedAcordos.length === 0
                ? "Nenhum acordo registrado hoje."
                : `${sortedAcordos.length} acordo(s) hoje · ${tableTotals.approvedCount} aprovados / ${tableTotals.exceptionCount} exceção(ões). Expandir para detalhar.`}
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
