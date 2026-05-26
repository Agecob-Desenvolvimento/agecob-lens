import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RankingAgenteBoleto } from "./analiseMocks";

interface RankingAgentesBoletosProps {
  data: RankingAgenteBoleto[];
}

export function RankingAgentesBoletos({ data }: RankingAgentesBoletosProps) {
  const max = Math.max(...data.map((d) => d.pct), 1);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Ranking de Agentes (boletos)</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Sem dados.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.map((d, i) => (
              <div key={d.nome} className="flex items-center gap-2" data-testid="ranking-row">
                <span className="w-28 shrink-0 truncate text-right text-[11px] text-slate-600">{d.nome}</span>
                <div className="h-[18px] flex-1 overflow-hidden rounded-[3px] bg-muted">
                  <div
                    className="h-full rounded-[3px] transition-[width] duration-400"
                    style={{ width: `${(d.pct / max) * 100}%`, background: i < 3 ? "#22c55e" : "#3b82f6" }}
                  />
                </div>
                <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-600">{d.pct}%</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RankingAgentesBoletos;
