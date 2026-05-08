import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type DatabaseOption, fetchRitmoDia, type RitmoDiaResponse } from "@/services/api";

const STATUS_ICON: Record<string, string> = {
  acima: "🟢",
  ok: "🟡",
  abaixo: "🔴",
  em_andamento: "⏳",
  futuro: "·",
};

const FAIXA_LABEL: Record<string, string> = {
  pos_batimento: "Pós-batimento",
  absorcao: "Absorção",
  basal: "Basal",
};

export default function RitmoDiaCard({ db }: { db: DatabaseOption }) {
  const [resp, setResp] = useState<RitmoDiaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setResp(null);
    setError(null);
    fetchRitmoDia(db)
      .then((r) => { if (alive) setResp(r); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [db]);

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold">Ritmo do Dia</CardTitle>
          <CardDescription className="text-xs text-red-600">{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!resp) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold">Ritmo do Dia</CardTitle>
          <CardDescription className="text-xs">Carregando…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { meta, data } = resp;
  const faixaLabel = meta.faixa_batimento ? FAIXA_LABEL[meta.faixa_batimento] ?? meta.faixa_batimento : "—";

  if (!meta.em_operacao) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold">Ritmo do Dia</CardTitle>
          <CardDescription className="text-xs">Fora do horário operacional (08h–19h).</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Ritmo do Dia
        </CardTitle>
        <CardDescription className="text-xs">
          Faixa: <span className="font-medium">{faixaLabel}</span>
          {meta.dias_desde_ultimo_batimento !== undefined && (
            <> · D+{meta.dias_desde_ultimo_batimento}</>
          )}
          {data.projecao_fechamento !== undefined && (
            <> · Projeção fechamento: <span className="font-medium">{data.projecao_fechamento}</span></>
          )}
          {data.esperado_total !== undefined && (
            <> · Esperado total: {data.esperado_total}</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="grid grid-cols-12 gap-1 text-xs">
          {data.bandas.map((b) => {
            const icon = STATUS_ICON[b.status] ?? "·";
            const deltaText = b.delta == null ? "" : (b.delta > 0 ? `+${b.delta}` : `${b.delta}`);
            const realText = b.real == null ? "—" : String(b.real);
            const isCurrent = b.status === "em_andamento";
            return (
              <div
                key={b.hora}
                className={`flex flex-col items-center rounded-md border p-1 ${
                  isCurrent ? "border-emerald-500 bg-emerald-50" : "border-border"
                }`}
                title={`Hora ${b.hora}h — esperado ${b.esperado} · real ${realText} · delta ${deltaText || "—"}`}
              >
                <span className="font-semibold">{b.hora}h</span>
                <span className="text-muted-foreground">esp {b.esperado}</span>
                <span>real {realText}</span>
                <span>{icon}{deltaText && ` ${deltaText}`}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Acumulado atual: <span className="font-medium">{data.acumulado_atual}</span>
        </div>
      </CardContent>
    </Card>
  );
}
