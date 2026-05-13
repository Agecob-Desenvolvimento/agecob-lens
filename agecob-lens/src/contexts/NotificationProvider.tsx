import { useEffect, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  type DatabaseOption,
  fetchProdutividade,
  fetchRitmoDia,
} from "@/services/api";
import { aggregateTotals } from "@/lib/metrics";
import { generateDailyReadout } from "@/lib/insightEngine";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { notify, requestNotificationPermission } from "@/lib/notifications";
import type { InsightSeverity } from "@/types/executive";

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  positive: 1,
  warning: 2,
  critical: 3,
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { category, assessoria } = useGlobalFilters();
  const db: DatabaseOption =
    category === "AUTOS"
      ? "COBwebRCBAUTOS"
      : category === "CONSUMER"
        ? "COBwebRCBCONSUMER"
        : "todos";

  useEffect(() => {
    const ask = () => { requestNotificationPermission(); };
    window.addEventListener("click", ask, { once: true });
    return () => window.removeEventListener("click", ask);
  }, []);

  const today = todayStr();

  const ritmoQuery = useQuery({
    queryKey: ["notif-ritmo-dia", db],
    queryFn: () => fetchRitmoDia(db),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const prodQuery = useQuery({
    queryKey: ["notif-produtividade-hoje", db, assessoria, today],
    queryFn: () => {
      const targets: Array<Exclude<DatabaseOption, "todos">> =
        db === "todos" ? ["COBwebRCBAUTOS", "COBwebRCBCONSUMER"] : [db];
      return Promise.all(
        targets.map((t) =>
          fetchProdutividade(t, {
            ...(assessoria !== "todos" ? { assessoria } : {}),
            dateFrom: today,
            dateTo: today,
          }).then((env) => ({ env, source: t })),
        ),
      );
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const ritmoNotifiedHoras = useRef<Set<number>>(new Set());
  const lastSeverityRank = useRef<number>(0);

  useEffect(() => {
    const resp = ritmoQuery.data;
    if (!resp || !resp.meta.em_operacao) return;
    const abaixo = resp.data.bandas.filter((b) => b.status === "abaixo");
    const newOnes = abaixo.filter((b) => !ritmoNotifiedHoras.current.has(b.hora));
    if (newOnes.length === 0) return;
    newOnes.forEach((b) => ritmoNotifiedHoras.current.add(b.hora));
    const horas = newOnes.map((b) => `${b.hora}h`).join(", ");
    const totalDelta = newOnes.reduce((s, b) => s + (b.delta ?? 0), 0);
    notify(
      "Ritmo do Dia abaixo do esperado",
      `Hora ${horas} fechou abaixo do esperado (${totalDelta} acordos).`,
      "ritmo-vermelho",
    );
  }, [ritmoQuery.data]);

  useEffect(() => {
    ritmoNotifiedHoras.current = new Set();
    lastSeverityRank.current = 0;
  }, [db, today]);

  useEffect(() => {
    const groups = prodQuery.data;
    if (!groups) return;
    const rows = groups.flatMap((g) =>
      (g.env.data ?? []).map((r) => ({ ...r, source: g.source })),
    );
    if (!rows.length) return;
    const totals = aggregateTotals(rows);
    if (totals.qtd_acionamentos < 1) return;
    const readout = generateDailyReadout(rows);
    const sev = readout.insight1?.severity;
    if (!sev) return;
    const rank = SEVERITY_RANK[sev];
    if (rank > lastSeverityRank.current) {
      const title =
        sev === "critical"
          ? "Resumo do Dia crítico"
          : sev === "warning"
            ? "Resumo do Dia em alerta"
            : "Resumo do Dia atualizado";
      const body = `${readout.insight1?.headline ?? ""} — ${readout.insight1?.text ?? ""}`;
      notify(title, body, "resumo-dia");
    }
    lastSeverityRank.current = rank;
  }, [prodQuery.data]);

  return <>{children}</>;
}
