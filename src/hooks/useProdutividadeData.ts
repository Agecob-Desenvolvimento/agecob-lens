import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type DatabaseOption,
  fetchHealth,
  fetchProdutividade,
  type ProdutividadeFilters,
  type ProdutividadeRow,
} from "@/services/api";

export interface ProdutividadeRowWithSource extends ProdutividadeRow {
  source: Exclude<DatabaseOption, "todos">;
}

interface UseProdutividadeDataResult {
  rows: ProdutividadeRowWithSource[];
  loading: boolean;
  error: string | null;
  warnings: string[];
  refresh: () => Promise<void>;
}

function dbTargets(db: DatabaseOption): Exclude<DatabaseOption, "todos">[] {
  if (db === "todos") return ["COBwebRCBAUTOS", "COBwebRCBCONSUMER"];
  return [db];
}

export function useProdutividadeData(
  db: DatabaseOption,
  filters?: ProdutividadeFilters,
): UseProdutividadeDataResult {
  const [rows, setRows] = useState<ProdutividadeRowWithSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const runRef = useRef(0);
  const assessoriaFilter = filters?.assessoria ?? "";

  const targets = useMemo(() => dbTargets(db), [db]);

  const refresh = useCallback(async () => {
    runRef.current += 1;
    const runId = `run-${runRef.current}`;
    // #region agent log
    fetch("http://127.0.0.1:7821/ingest/6cac46ee-9fe0-452a-8122-888150964940", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1add04" },
      body: JSON.stringify({
        sessionId: "1add04",
        runId,
        hypothesisId: "H1",
        location: "useProdutividadeData.ts:refresh:start",
        message: "Refresh iniciado",
        data: { db, targets, assessoria: assessoriaFilter || null },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    setLoading(true);
    setError(null);
    setWarnings([]);

    const prodResults = await Promise.allSettled(
      targets.map((target) =>
        fetchProdutividade(target, assessoriaFilter ? { assessoria: assessoriaFilter } : undefined),
      ),
    );
    const healthResults = await Promise.allSettled(targets.map((target) => fetchHealth(target)));

    const nextRows: ProdutividadeRowWithSource[] = [];
    const nextWarnings: string[] = [];
    let prodFulfilled = 0;

    prodResults.forEach((result, index) => {
      const source = targets[index];
      if (result.status === "fulfilled") {
        prodFulfilled += 1;
        result.value.data.forEach((row) => nextRows.push({ ...row, source }));
      } else {
        nextWarnings.push(`${source}: productivity failed (${result.reason?.message ?? "unknown error"})`);
      }
    });

    healthResults.forEach((result, index) => {
      const source = targets[index];
      if (result.status === "rejected") {
        nextWarnings.push(`${source}: health check failed (${result.reason?.message ?? "unknown error"})`);
      }
    });

    if (nextRows.length === 0 && prodFulfilled === 0) {
      setError(nextWarnings[0] ?? "No data sources available");
    }
    // #region agent log
    fetch("http://127.0.0.1:7821/ingest/6cac46ee-9fe0-452a-8122-888150964940", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1add04" },
      body: JSON.stringify({
        sessionId: "1add04",
        runId,
        hypothesisId: "H3",
        location: "useProdutividadeData.ts:refresh:end",
        message: "Refresh finalizado",
        data: {
          rows: nextRows.length,
          warnings: nextWarnings.length,
          prodStatuses: prodResults.map((r) => r.status),
          healthStatuses: healthResults.map((r) => r.status),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    setRows(nextRows);
    setWarnings(nextWarnings);
    setLoading(false);
  }, [assessoriaFilter, db, targets]);

  useEffect(() => {
    // #region agent log
    fetch("http://127.0.0.1:7821/ingest/6cac46ee-9fe0-452a-8122-888150964940", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1add04" },
      body: JSON.stringify({
        sessionId: "1add04",
        runId: `effect-${Date.now()}`,
        hypothesisId: "H2",
        location: "useProdutividadeData.ts:useEffect",
        message: "Effect disparado",
        data: { db, targets, assessoria: assessoriaFilter || null },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    refresh().catch((err: Error) => {
      setError(err.message);
      setLoading(false);
    });
  }, [assessoriaFilter, db, refresh, targets]);

  return { rows, loading, error, warnings, refresh };
}
