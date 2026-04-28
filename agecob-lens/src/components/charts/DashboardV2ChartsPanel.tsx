import { useQueries } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import {
  type DatabaseOption,
  fetchExcecoesPorPortfolio,
  fetchExcecoesPorAgente,
  fetchAcordosPorPortfolio,
  fetchPrimeiraParcelaPorAgente,
  type ExcecoesPorPortfolioRow,
  type ExcecoesPorAgenteRow,
  type AcordosPorPortfolioRow,
  type PrimeiraParcelaPorAgenteRow,
} from "@/services/api";
import { type ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";

interface Props {
  db: DatabaseOption;
  produtividadeRows: ProdutividadeRowWithSource[];
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

const fmtNum = (v: number) => v.toLocaleString("pt-BR");

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(0, 0%, 100%)",
  border: "1px solid hsl(214, 32%, 88%)",
  borderRadius: "0.5rem",
  color: "hsl(0, 0%, 0%)",
};

const LABEL_STYLE = { fill: "#000", fontSize: 13, fontWeight: 600 };

const formatAgentShortName = (fullName: string) => {
  const cleaned = (fullName || "").trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const firstName = parts[0];
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  return lastName ? `${firstName} ${lastName.charAt(0).toUpperCase()}.` : firstName;
};

function SimpleBarChart<T extends object>({
  data,
  dataKey,
  nameKey,
  color,
  formatter,
  height = 240,
  errorMessage,
}: {
  data: T[];
  dataKey: keyof T & string;
  nameKey: keyof T & string;
  color: string;
  formatter: (v: number) => string;
  height?: number;
  errorMessage?: string | null;
}) {
  if (errorMessage) {
    return (
      <div className="flex items-start gap-2 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Erro ao carregar: {errorMessage}</span>
      </div>
    );
  }
  if (!data.length) return <p className="text-sm text-muted-foreground">Sem dados para hoje.</p>;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 80, top: 8, bottom: 8 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey={nameKey}
          width={160}
          tick={{ fill: "hsl(0, 0%, 0%)", fontSize: 13 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 22)}…` : v)}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value: number) => [formatter(value), dataKey]}
        />
        <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} barSize={28}>
          {data.map((_, i) => (
            <Cell key={i} fill={color} />
          ))}
          <LabelList
            dataKey={dataKey}
            position="right"
            fill="hsl(0, 0%, 0%)"
            fontSize={13}
            fontWeight={600}
            formatter={(v: number) => formatter(v)}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartCard({
  title,
  loading,
  children,
}: {
  title: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-base font-semibold text-center leading-snug">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading ? <Skeleton className="h-56 w-full" /> : children}
      </CardContent>
    </Card>
  );
}

type Errors = {
  excExc: string | null;
  excAgente: string | null;
  acdPort: string | null;
  ppAgente: string | null;
};

const extractError = (reason: unknown): string => {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  return "Falha na requisicao";
};

export default function DashboardV2ChartsPanel({ db, produtividadeRows }: Props) {
  const [qExcPort, qExcAg, qAcdPort, qPpAg] = useQueries({
    queries: [
      {
        queryKey: ["excecoes-por-portfolio", db] as const,
        queryFn: () => fetchExcecoesPorPortfolio(db),
      },
      {
        queryKey: ["excecoes-por-agente", db] as const,
        queryFn: () => fetchExcecoesPorAgente(db),
      },
      {
        queryKey: ["acordos-por-portfolio", db] as const,
        queryFn: () => fetchAcordosPorPortfolio(db),
      },
      {
        queryKey: ["primeira-parcela-por-agente", db] as const,
        queryFn: () => fetchPrimeiraParcelaPorAgente(db),
      },
    ],
  });

  const excExc: ExcecoesPorPortfolioRow[] = qExcPort.data?.data ?? [];
  const excAgente: ExcecoesPorAgenteRow[] = qExcAg.data?.data ?? [];
  const acdPort: AcordosPorPortfolioRow[] = qAcdPort.data?.data ?? [];
  const ppAgente: PrimeiraParcelaPorAgenteRow[] = qPpAg.data?.data ?? [];

  const errors: Errors = {
    excExc: qExcPort.isError ? extractError(qExcPort.error) : null,
    excAgente: qExcAg.isError ? extractError(qExcAg.error) : null,
    acdPort: qAcdPort.isError ? extractError(qAcdPort.error) : null,
    ppAgente: qPpAg.isError ? extractError(qPpAg.error) : null,
  };

  const loading =
    qExcPort.isLoading || qExcAg.isLoading || qAcdPort.isLoading || qPpAg.isLoading;

  const topExcecoesPorAgente = excAgente
    .slice(0, 15)
    .map((r) => ({ ...r, agente: formatAgentShortName(r.agente) }));

  // Chart 3: Acordos Aprovados por Agente — derived from produtividadeRows (comparacao-agentes data)
  const acordosAprovadosPorAgente = [...produtividadeRows]
    .filter((r) => r.qtd_acordos > 0)
    .sort((a, b) => b.qtd_acordos - a.qtd_acordos)
    .slice(0, 15)
    .map((r) => ({ agente: formatAgentShortName(r.NOME), qtd_acordos: r.qtd_acordos }));

  const topPrimeiraParcelaPorAgente = ppAgente
    .slice(0, 15)
    .map((r) => ({ ...r, agente: formatAgentShortName(r.agente) }));

  const excExcHeight = Math.max(240, excExc.length * 40);
  const excAgenteHeight = Math.max(240, Math.min(excAgente.length, 15) * 40);
  const acordosAgenteHeight = Math.max(240, acordosAprovadosPorAgente.length * 40);
  const acdPortHeight = Math.max(240, acdPort.length * 40);
  const ppAgenteHeight = Math.max(240, Math.min(ppAgente.length, 15) * 40);

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wide px-1">
        Análise por Portfólio e Agente
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* 1 — Exceções por Portfólio */}
        <ChartCard title="Quantidade de Exceções Hoje por Portfólio" loading={loading}>
          <SimpleBarChart
            data={excExc}
            dataKey="qtd_excecoes"
            nameKey="portfolio_name"
            color="#f87171"
            formatter={fmtNum}
            height={excExcHeight}
            errorMessage={errors.excExc}
          />
        </ChartCard>

        {/* 2 — Exceções por Agente */}
        <ChartCard title="Top 15 Agentes com Mais Exceções Hoje" loading={loading}>
          <SimpleBarChart
            data={topExcecoesPorAgente}
            dataKey="qtd_excecoes"
            nameKey="agente"
            color="#fb923c"
            formatter={fmtNum}
            height={excAgenteHeight}
            errorMessage={errors.excAgente}
          />
        </ChartCard>

        {/* 3 — Acordos Aprovados por Agente (from produtividadeRows) */}
        <ChartCard title="Top 15 Agentes por Acordos Aprovados Hoje" loading={false}>
          <SimpleBarChart
            data={acordosAprovadosPorAgente}
            dataKey="qtd_acordos"
            nameKey="agente"
            color="#34d399"
            formatter={fmtNum}
            height={acordosAgenteHeight}
          />
        </ChartCard>

        {/* 4 — Acordos Aprovados por Portfólio */}
        <ChartCard title="Acordos Aprovados Hoje por Portfólio" loading={loading}>
          <SimpleBarChart
            data={acdPort}
            dataKey="qtd_acordos"
            nameKey="portfolio_name"
            color="#60a5fa"
            formatter={fmtNum}
            height={acdPortHeight}
            errorMessage={errors.acdPort}
          />
        </ChartCard>

        {/* 5 — Valor 1ª Parcela por Agente */}
        <ChartCard title="Top 15 Agentes por Valor da 1ª Parcela (R$)" loading={loading}>
          <SimpleBarChart
            data={topPrimeiraParcelaPorAgente}
            dataKey="valor_primeira_parcela"
            nameKey="agente"
            color="#a78bfa"
            formatter={fmtBRL}
            height={ppAgenteHeight}
            errorMessage={errors.ppAgente}
          />
        </ChartCard>

        {/* 6 — Qtd Acordos 1ª Parcela por Agente */}
        <ChartCard title="Top 15 Agentes por Qtd. de Acordos com 1ª Parcela" loading={loading}>
          <SimpleBarChart
            data={topPrimeiraParcelaPorAgente}
            dataKey="qtd_acordos_primeira_parcela"
            nameKey="agente"
            color="#38bdf8"
            formatter={fmtNum}
            height={ppAgenteHeight}
            errorMessage={errors.ppAgente}
          />
        </ChartCard>
      </div>
    </div>
  );
}
