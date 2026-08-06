import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRLCompact } from "@/lib/metrics";
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

function Wrapper({ embedded, children }: { embedded?: boolean; children: ReactNode }) {
  return embedded ? <>{children}</> : <Card>{children}</Card>;
}

export default function RitmoDiaCard({ db, embedded }: { db: DatabaseOption; embedded?: boolean }) {
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
      <Wrapper embedded={embedded}>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold">Ritmo do Dia</CardTitle>
          <CardDescription className="text-xs text-red-600 dark:text-red-400">{error}</CardDescription>
        </CardHeader>
      </Wrapper>
    );
  }

  if (!resp) {
    return (
      <Wrapper embedded={embedded}>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold">Ritmo do Dia</CardTitle>
          <CardDescription className="text-xs">
            <Skeleton className="h-3 w-48" />
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="grid grid-cols-12 gap-1">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="mt-2 h-3 w-32" />
        </CardContent>
      </Wrapper>
    );
  }

  const { meta, data } = resp;
  const faixaLabel = meta.faixa_batimento ? FAIXA_LABEL[meta.faixa_batimento] ?? meta.faixa_batimento : "—";

  if (!meta.em_operacao) {
    return (
      <Wrapper embedded={embedded}>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold">Ritmo do Dia</CardTitle>
          <CardDescription className="text-xs">Fora do horário operacional (08h–19h).</CardDescription>
        </CardHeader>
      </Wrapper>
    );
  }

  return (
    <Wrapper embedded={embedded}>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Ritmo de Acordos do Dia · baseado em dias semelhantes
        </CardTitle>
        <CardDescription className="text-xs">
          Faixa: <span className="font-medium">{faixaLabel}</span>
          {meta.dias_desde_ultimo_batimento !== undefined && (
            <> · D+{meta.dias_desde_ultimo_batimento}</>
          )}
          {data.projecao_fechamento !== undefined && (
            <> · Projeção: <span className="font-medium tabular-nums">{data.projecao_fechamento}</span></>
          )}
          {data.esperado_total !== undefined && (
            <> · Esperado: <span className="tabular-nums">{data.esperado_total}</span></>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="grid gap-1.5 text-[11px] tabular-nums" style={{ gridTemplateColumns: "repeat(12, minmax(68px, 1fr))" }}>
          {data.bandas.map((b) => {
            const icon = STATUS_ICON[b.status] ?? "·";
            const deltaText = b.delta == null ? "" : (b.delta > 0 ? `+${b.delta}` : `${b.delta}`);
            const realText = b.real == null ? "—" : String(b.real);
            const acumText = b.acumulado == null ? "—" : String(b.acumulado);
            const isCurrent = b.status === "em_andamento";
            const isFuturo = b.status === "futuro";
            const iconValor = b.status_valor ? (STATUS_ICON[b.status_valor] ?? "·") : null;
            const realValorText = b.real_valor == null ? "—" : formatBRLCompact(b.real_valor);
            const esperadoValorText = b.esperado_valor === undefined ? null : formatBRLCompact(b.esperado_valor);
            return (
              <div
                key={b.hora}
                className={`flex flex-col items-center gap-0.5 rounded-md border p-1.5 ${
                  isCurrent
                    ? "border-success bg-success-soft"
                    : isFuturo
                      ? "border-border bg-muted/40"
                      : "border-border bg-card"
                }`}
                title={`Hora ${b.hora}h: esperado ${b.esperado} · real ${realText} · acumulado ${acumText} · delta ${deltaText || "—"}${esperadoValorText ? ` · valor esperado ${esperadoValorText} · valor real ${realValorText}` : ""}`}
              >
                <span className="font-semibold">{b.hora}h</span>
                <span className="text-muted-foreground">esp {b.esperado}</span>
                <span>real {realText}</span>
                <span className="text-muted-foreground">acum {acumText}</span>
                <span>{icon}{deltaText && ` ${deltaText}`}</span>
                {esperadoValorText && (
                  <>
                    <span className="mt-0.5 w-full border-t border-border/60 pt-0.5 text-muted-foreground">{esperadoValorText}</span>
                    <span>{realValorText}</span>
                    {iconValor && <span>{iconValor}</span>}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground tabular-nums">
          Acumulado atual: <span className="font-medium">{data.acumulado_atual}</span>
          {data.valor_acumulado_atual !== undefined && (
            <> · Valor acumulado: <span className="font-medium">{formatBRLCompact(data.valor_acumulado_atual)}</span></>
          )}
          {data.valor_projecao_fechamento !== undefined && (
            <> · Projeção valor: <span className="font-medium">{formatBRLCompact(data.valor_projecao_fechamento)}</span></>
          )}
        </div>
      </CardContent>
    </Wrapper>
  );
}
