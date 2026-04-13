export type DatabaseOption = "COBwebRCBAUTOS" | "COBwebRCBCONSUMER" | "todos";

export interface ApiMeta {
  generated_at: string;
  total_rows: number;
  sources: string[];
  filters: {
    date: string;
  };
}

export interface ApiErrorItem {
  source?: string;
  message: string;
}

export interface ApiEnvelope<T> {
  meta: ApiMeta;
  data: T[];
  errors: ApiErrorItem[];
}

export interface AcordoRow {
  banco_origem?: string;
  agente: string;
  cpf_cnpj: string;
  nome_razao: string;
  valor_atualizado_divida: number;
  valor_total_acordo: number;
  desconto_concedido: number;
  acordo: number;
  qtd_parcelas: number;
  numero_parcela: number;
  data_emissao: string;
  data_vencimento: string;
  valor_parcela: number;
  status_parcela: string;
  dt_pagamento: string | null;
  situacao_pagamento: string;
}

export interface ProdutividadeRow {
  CHAVE: string;
  NOME: string;
  qtd_acionamentos: number;
  qtd_contatos: number;
  cpc_percentual: number;
  qtd_acordos: number;
  acordos_percentual: number;
  valor_acordos: number;
  acordo_medio: number;
  parcelamento_medio: number;
  desconto_medio_percentual: number;
  valor_primeira_parcela: number;
}

export interface ProdutividadeFilters {
  assessoria?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const API_KEY = import.meta.env.VITE_API_KEY || "local-dev-key";
const API_TOKEN = import.meta.env.VITE_API_TOKEN || "local-dev-token";
const inflight = new Map<string, Promise<unknown>>();
const API_BASE_CANDIDATES = Array.from(
  new Set(
    API_BASE_URL.startsWith("/")
      ? [API_BASE_URL]
      : [API_BASE_URL, "http://127.0.0.1:8000", "http://localhost:8000"],
  ),
);

async function request<T>(path: string): Promise<T> {
  const key = path;
  const runId = `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const existing = inflight.get(key);
  if (existing) {
    // #region agent log
    fetch("http://127.0.0.1:7821/ingest/6cac46ee-9fe0-452a-8122-888150964940", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1add04" },
      body: JSON.stringify({
        sessionId: "1add04",
        runId: `req-${Date.now()}`,
        hypothesisId: "H4",
        location: "api.ts:request:dedupe-hit",
        message: "Requisicao reaproveitada do inflight",
        data: { path },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return existing as Promise<T>;
  }

  const pending = (async () => {
    let res: Response | null = null;
    let lastError: unknown = null;
    const startedAt = Date.now();
    // #region agent log
    fetch("http://127.0.0.1:7821/ingest/6cac46ee-9fe0-452a-8122-888150964940", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1add04" },
      body: JSON.stringify({
        sessionId: "1add04",
        runId: `req-${startedAt}`,
        hypothesisId: "H3",
        location: "api.ts:request:start",
        message: "Tentativa de request iniciada",
        data: { path, candidates: API_BASE_CANDIDATES.length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    for (const base of API_BASE_CANDIDATES) {
      try {
        res = await fetch(`${base}${path}`, {
          headers: {
            "X-API-Key": API_KEY,
            Authorization: `Bearer ${API_TOKEN}`,
            "X-Run-Id": runId,
          },
        });
        // #region agent log
        fetch("http://127.0.0.1:7821/ingest/6cac46ee-9fe0-452a-8122-888150964940", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1add04" },
          body: JSON.stringify({
            sessionId: "1add04",
            runId: `req-${startedAt}`,
            hypothesisId: "H3",
            location: "api.ts:request:base-result",
            message: "Resposta recebida para base",
            data: { path, base, status: res.status, elapsedMs: Date.now() - startedAt, runId },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        break;
      } catch (err) {
        lastError = err;
        // #region agent log
        fetch("http://127.0.0.1:7821/ingest/6cac46ee-9fe0-452a-8122-888150964940", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1add04" },
          body: JSON.stringify({
            sessionId: "1add04",
            runId: `req-${startedAt}`,
            hypothesisId: "H3",
            location: "api.ts:request:base-error",
            message: "Falha em base",
            data: {
              path,
              base,
              error: err instanceof Error ? err.message : "unknown error",
              elapsedMs: Date.now() - startedAt,
              runId,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      }
    }
    if (!res) {
      throw new Error(lastError instanceof Error ? lastError.message : "Failed to fetch");
    }
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.detail) detail = String(body.detail);
      } catch {
        // Mantem fallback de HTTP status.
      }
      throw new Error(detail);
    }
    const payload = await res.json();
    // #region agent log
    fetch("http://127.0.0.1:7821/ingest/6cac46ee-9fe0-452a-8122-888150964940", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1add04" },
      body: JSON.stringify({
        sessionId: "1add04",
        runId: `req-${startedAt}`,
        hypothesisId: "H5",
        location: "api.ts:request:payload",
        message: "Payload recebido",
        data: {
          path,
          metaTotalRows:
            typeof payload === "object" && payload && "meta" in payload
              ? (payload as { meta?: { total_rows?: number } }).meta?.total_rows ?? null
              : null,
          dataLength:
            typeof payload === "object" && payload && "data" in payload
              ? Array.isArray((payload as { data?: unknown[] }).data)
                ? (payload as { data?: unknown[] }).data?.length ?? null
                : null
              : null,
          hasErrorsArray:
            typeof payload === "object" && payload && "errors" in payload
              ? Array.isArray((payload as { errors?: unknown[] }).errors)
              : null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return payload as T;
  })()
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, pending);
  return pending;
}

export async function fetchAcordosTodos(): Promise<ApiEnvelope<AcordoRow>> {
  return request<ApiEnvelope<AcordoRow>>("/dashboard/acordos-hoje/todos");
}

export async function fetchAcordosPorBanco(
  db: Exclude<DatabaseOption, "todos">,
): Promise<ApiEnvelope<AcordoRow>> {
  return request<ApiEnvelope<AcordoRow>>(`/dashboard/acordos-hoje/${db}`);
}

export async function fetchAcordos(
  db: DatabaseOption,
): Promise<ApiEnvelope<AcordoRow>> {
  if (db === "todos") return fetchAcordosTodos();
  return fetchAcordosPorBanco(db);
}

export async function fetchHealth(db: DatabaseOption): Promise<Record<string, string>> {
  if (db === "todos") return request<Record<string, string>>("/health/db");
  return request<Record<string, string>>(`/health/db/${db}`);
}

export async function fetchProdutividade(
  db: Exclude<DatabaseOption, "todos">,
  filters?: ProdutividadeFilters,
): Promise<ApiEnvelope<ProdutividadeRow>> {
  const query = new URLSearchParams();
  if (filters?.assessoria && filters.assessoria !== "todos") query.set("assessoria", filters.assessoria);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<ProdutividadeRow>>(`/dashboard/produtividade-hoje/${db}${suffix}`);
}
