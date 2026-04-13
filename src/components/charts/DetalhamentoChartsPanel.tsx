import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, LabelList,
} from "recharts";
import { type ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";

const TEAL = "#6AAEB0";

interface DetalhamentoChartsPanelProps {
  rows: ProdutividadeRowWithSource[];
  selectedAgent: string;
}

type ContatosTooltipPayload = { payload?: { name?: string; bar?: number; line?: string } };

function ContatosTooltip({ active, payload }: { active?: boolean; payload?: ContatosTooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <p className="font-semibold">{d?.name}</p>
      <p>Quantidade: {d?.bar}</p>
      <p>TMA: {d?.line}</p>
    </div>
  );
}

export default function DetalhamentoChartsPanel({ rows, selectedAgent }: DetalhamentoChartsPanelProps) {
  const filtered = selectedAgent === "Todos" ? rows : rows.filter((row) => row.NOME === selectedAgent);
  const totalAcionamentos = filtered.reduce((acc, row) => acc + row.qtd_acionamentos, 0);
  const totalContatos = filtered.reduce((acc, row) => acc + row.qtd_contatos, 0);
  const totalAcordos = filtered.reduce((acc, row) => acc + row.qtd_acordos, 0);
  const totalValor = filtered.reduce((acc, row) => acc + row.valor_acordos, 0);

  const tabulacaoData = [
    { tabulacao: "Total", quantidade: totalAcionamentos, proporcao: "100%", tma: "-", bold: true },
    { tabulacao: "Contato", quantidade: totalContatos, proporcao: `${totalAcionamentos ? ((totalContatos * 100) / totalAcionamentos).toFixed(1) : 0}%`, tma: "-" },
    { tabulacao: "Sem Contato", quantidade: Math.max(totalAcionamentos - totalContatos, 0), proporcao: `${totalAcionamentos ? (((totalAcionamentos - totalContatos) * 100) / totalAcionamentos).toFixed(1) : 0}%`, tma: "-" },
  ];
  const contatosData = [
    { name: "Contatos", bar: totalContatos, line: "-", lineVal: totalContatos },
    { name: "Sem Contato", bar: Math.max(totalAcionamentos - totalContatos, 0), line: "-", lineVal: Math.max(totalAcionamentos - totalContatos, 0) },
    { name: "Acordos", bar: totalAcordos, line: "-", lineVal: totalAcordos },
  ];
  const acordosData = filtered
    .slice(0, 5)
    .map((row) => ({
      tipo: row.acordos_percentual > 5 ? "Acordo" : "Baixa Conversão",
      vencimento: "-",
      parcelamento: row.parcelamento_medio.toFixed(0),
      valorAcordo: row.valor_acordos.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      valor1a: row.valor_primeira_parcela.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      valorOutras: row.acordo_medio.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    }));

  if (filtered.length === 0) {
    return <div className="text-sm text-muted-foreground">No data available for selected agent.</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2 pt-3 px-4 text-center">
          <CardTitle className="text-sm font-bold text-[hsl(210,50%,20%)]">Tabulação de Acionamentos</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <Table>
            <TableHeader><TableRow><TableHead className="text-xs font-semibold">Tabulação</TableHead><TableHead className="text-xs font-semibold text-right">Quantidade</TableHead><TableHead className="text-xs font-semibold text-right">Proporção</TableHead><TableHead className="text-xs font-semibold text-right">TMA</TableHead></TableRow></TableHeader>
            <TableBody>
              {tabulacaoData.map((row) => (
                <TableRow key={row.tabulacao}>
                  <TableCell className={`text-xs ${row.bold ? "font-bold" : ""}`}>{row.tabulacao}</TableCell>
                  <TableCell className={`text-xs text-right ${row.bold ? "font-bold" : ""}`}>{row.quantidade}</TableCell>
                  <TableCell className={`text-xs text-right ${row.bold ? "font-bold" : ""}`}>{row.proporcao}</TableCell>
                  <TableCell className={`text-xs text-right ${row.bold ? "font-bold" : ""}`}>{row.tma}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4 text-center">
          <CardTitle className="text-sm font-bold text-[hsl(210,50%,20%)]">Contatos</CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3">
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={contatosData} margin={{ top: 20, right: 10, left: 0, bottom: 60 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(210,10%,40%)" }} angle={-35} textAnchor="end" interval={0} height={70} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<ContatosTooltip />} />
                <Bar dataKey="bar" fill={TEAL} radius={[3, 3, 0, 0]} barSize={30} />
                <Line dataKey="lineVal" stroke={TEAL} strokeWidth={2} dot={{ r: 4, fill: TEAL, stroke: "#fff", strokeWidth: 2 }}>
                  <LabelList dataKey="line" position="top" fontSize={9} fill="hsl(210,10%,50%)" offset={8} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4 text-center">
          <CardTitle className="text-sm font-bold text-[hsl(210,50%,20%)]">Log e Pausas</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div style={{ height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{ name: "Contatos", value: totalContatos, label: String(totalContatos), rest: String(Math.max(totalAcionamentos - totalContatos, 0)) }]} layout="vertical" margin={{ top: 5, right: 60, left: 80, bottom: 5 }}>
                <XAxis type="number" hide domain={[0, Math.max(totalAcionamentos, 1)]} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "hsl(210,10%,30%)" }} axisLine={false} tickLine={false} width={75} />
                <Bar dataKey="value" fill={TEAL} radius={[0, 4, 4, 0]} barSize={36}>
                  <LabelList dataKey="label" position="center" fill="#fff" fontSize={13} fontWeight={600} />
                  <LabelList dataKey="rest" position="right" fill="hsl(210,10%,40%)" fontSize={12} offset={8} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4 text-center">
          <CardTitle className="text-sm font-bold text-[hsl(210,50%,20%)]">Acordos e Exceções</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 overflow-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="text-xs font-semibold">TipoAcordo</TableHead><TableHead className="text-xs font-semibold">Vencimento 1ª Parcela</TableHead><TableHead className="text-xs font-semibold text-right">Parcelamento</TableHead><TableHead className="text-xs font-semibold text-right">Valor do Acordo</TableHead><TableHead className="text-xs font-semibold text-right">Valor 1ª Parcela</TableHead><TableHead className="text-xs font-semibold text-right">Valor Outras Parcelas</TableHead></TableRow></TableHeader>
            <TableBody>
              {acordosData.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{row.tipo}</TableCell>
                  <TableCell className="text-xs">{row.vencimento}</TableCell>
                  <TableCell className="text-xs text-right">{row.parcelamento}</TableCell>
                  <TableCell className="text-xs text-right">{row.valorAcordo}</TableCell>
                  <TableCell className="text-xs text-right">{row.valor1a}</TableCell>
                  <TableCell className="text-xs text-right">{row.valorOutras}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
