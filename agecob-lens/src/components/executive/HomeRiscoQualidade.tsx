import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HBarList } from "@/components/analise/PortfolioSection";
import { excecoesValorToRows, rejeitadosValorToRows, quebradosValorToRows, type BarRow } from "@/components/analise/portfolioRows";
import { AcordoRiscoPanel, type RiscoTipo } from "@/components/analise/AcordoRiscoPanel";

interface BarDatum {
  label: string;
  value: number;
}

interface HomeRiscoQualidadeProps {
  excecoes: BarDatum[];
  rejeitados: BarDatum[];
  quebrados: BarDatum[];
  loadingExcecoes?: boolean;
  loadingRejeitados?: boolean;
  loadingQuebrados?: boolean;
  linkTo?: string;
}

const toValor = (d: BarDatum[]) => d.map((x) => ({ nome: x.label, valor: x.value }));

type Selected = { type: RiscoTipo; label: string } | null;

function ClickableBarCard({
  title,
  rows,
  type,
  loading,
  selected,
  onSelect,
}: {
  title: string;
  rows: BarRow[];
  type: RiscoTipo;
  loading?: boolean;
  selected: Selected;
  onSelect: (next: Selected) => void;
}) {
  const selectedLabel = selected?.type === type ? selected.label : null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[13px] font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 bg-muted rounded-sm animate-pulse" />
            ))}
          </div>
        ) : (
          <HBarList
            rows={rows}
            type={type}
            selectedLabel={selectedLabel}
            onBarClick={(label) => onSelect(selectedLabel === label ? null : { type, label })}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function HomeRiscoQualidade({
  excecoes,
  rejeitados,
  quebrados,
  loadingExcecoes,
  loadingRejeitados,
  loadingQuebrados,
  linkTo = "/efetividade-boletos",
}: HomeRiscoQualidadeProps) {
  const [selected, setSelected] = useState<Selected>(null);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ClickableBarCard
          title="Exceções por Portfólio (Valor)"
          rows={excecoesValorToRows(toValor(excecoes))}
          type="excecoes"
          loading={loadingExcecoes}
          selected={selected}
          onSelect={setSelected}
        />
        <ClickableBarCard
          title="Rejeitados por Portfólio (Valor)"
          rows={rejeitadosValorToRows(toValor(rejeitados))}
          type="rejeitados"
          loading={loadingRejeitados}
          selected={selected}
          onSelect={setSelected}
        />
        <ClickableBarCard
          title="Boletos Quebrados (Valor)"
          rows={quebradosValorToRows(toValor(quebrados))}
          type="quebrados"
          loading={loadingQuebrados}
          selected={selected}
          onSelect={setSelected}
        />
      </div>

      {selected && (
        <AcordoRiscoPanel tipo={selected.type} portfolio={selected.label} onClose={() => setSelected(null)} />
      )}

      <Link
        to={linkTo}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-800 hover:underline"
      >
        Para mais detalhes, vá para Análise &amp; Efetividade
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}

export default HomeRiscoQualidade;