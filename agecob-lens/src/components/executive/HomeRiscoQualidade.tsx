import { useState, type ReactNode } from "react";
import { ArrowRight, ListChecks, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBRLCompact } from "@/lib/metrics";
import { HBarList } from "@/components/analise/PortfolioSection";
import { excecoesValorToRows, rejeitadosValorToRows, quebradosValorToRows, type BarRow } from "@/components/analise/portfolioRows";
import { AcordoRow, AcordoRiscoPanel, TONE, type RiscoTipo } from "@/components/analise/AcordoRiscoPanel";
import { useHomeKpiDetalhe } from "@/hooks/useHomeKpiDetalhe";
import { mapAcordosQuebrados } from "@/selectors/quebradosSelectors";

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
  headerAction,
}: {
  title: string;
  rows: BarRow[];
  type: RiscoTipo;
  loading?: boolean;
  selected: Selected;
  onSelect: (next: Selected) => void;
  headerAction?: ReactNode;
}) {
  const selectedLabel = selected?.type === type ? selected.label : null;
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-[13px] font-semibold">{title}</CardTitle>
        {headerAction}
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

/** Panel listing every rejeitado acordo of the period (all portfolios),
 *  each row already expanded — no click needed to see specs. */
function RejeitadosTodosPanel({ onClose }: { onClose: () => void }) {
  const { rows, loading, error } = useHomeKpiDetalhe("rejeitados");
  const acordos = mapAcordosQuebrados(rows, "—");
  const t = TONE.orange;
  const valorTotal = rows.reduce((acc, r) => acc + (Number(r.valor_total) || 0), 0);

  return (
    <div className={cn("border rounded-lg overflow-hidden mt-2", t.border)}>
      <div className={cn("px-4 py-2.5 flex items-center justify-between", t.headBg)}>
        <span className={cn("text-xs font-semibold", t.headText)}>
          Rejeitados · Todos os Portfólios
          {!loading && !error && acordos.length > 0 && (
            <span className="font-normal opacity-70"> · {acordos.length} acordo(s) · {formatBRLCompact(valorTotal)}</span>
          )}
        </span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors" aria-label="Fechar lista de rejeitados">
          <X className={cn("h-3.5 w-3.5", t.headText)} aria-hidden />
        </button>
      </div>
      <div className="p-1">
        {loading ? (
          <div className="space-y-1.5 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-5 bg-muted rounded-sm animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <p className="p-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>
        ) : acordos.length === 0 ? (
          <p className="p-3 text-[11px] italic text-muted-foreground">Sem registros no período.</p>
        ) : (
          acordos.map((acordo, i) => (
            <AcordoRow
              key={acordo.id}
              acordo={acordo}
              isExpanded
              isLast={i === acordos.length - 1}
              onToggle={() => {}}
              tone={t}
            />
          ))
        )}
      </div>
    </div>
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
  const [showAllRejeitados, setShowAllRejeitados] = useState(false);

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
          headerAction={
            <Button
              type="button"
              variant={showAllRejeitados ? "secondary" : "outline"}
              size="sm"
              className="h-6 px-2 text-[11px] gap-1 shrink-0"
              onClick={() => setShowAllRejeitados((v) => !v)}
            >
              <ListChecks className="h-3 w-3" aria-hidden />
              Mostrar todos os casos
            </Button>
          }
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

      {showAllRejeitados ? (
        <RejeitadosTodosPanel onClose={() => setShowAllRejeitados(false)} />
      ) : (
        selected && (
          <AcordoRiscoPanel tipo={selected.type} portfolio={selected.label} onClose={() => setSelected(null)} />
        )
      )}

      <Link
        to={linkTo}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-300 hover:text-sky-800 dark:hover:text-sky-300 hover:underline"
      >
        Para mais detalhes, vá para Análise &amp; Efetividade
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}

export default HomeRiscoQualidade;