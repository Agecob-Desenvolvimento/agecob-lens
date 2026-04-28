export type DatabaseOption = "COBwebRCBAUTOS" | "COBwebRCBCONSUMER" | "todos";
import { trackApiMetric } from "@/services/analytics";

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
  qtd_excecoes: number;
  valor_excecoes: number;
}

export interface ProdutividadeFilters {
  assessoria?: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
const API_KEY = (import.meta.env.VITE_API_KEY ?? "").trim();
const API_TOKEN = (import.meta.env.VITE_API_TOKEN ?? "").trim();
const inflight = new Map<string, Promise<unknown>>();
const IS_DEV = Boolean(import.meta.env.DEV);
const RUNTIME_ORIGIN =
  typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "http://127.0.0.1:8000";
const API_BASE_CANDIDATES = Array.from(
  new Set(
    API_BASE_URL
      ? (API_BASE_URL.startsWith("/") ? [API_BASE_URL] : [API_BASE_URL, RUNTIME_ORIGIN])
      : IS_DEV
        ? ["http://127.0.0.1:8000", "http://localhost:8000"]
        : [RUNTIME_ORIGIN, "http://127.0.0.1:8000", "http://localhost:8000"],
  ),
);

type HttpMethod = "GET" | "POST";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  /**
   * Quando true, desativa a deduplicacao por chave path.
   * Util para endpoints com side-effects (POST) que nao devem ser coalescidos.
   */
  skipInflightDedup?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method: HttpMethod = options.method ?? "GET";
  const key = `${method} ${path}`;
  const runId = `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!options.skipInflightDedup && method === "GET") {
    const existing = inflight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }
  }

  const pending = (async () => {
    let res: Response | null = null;
    let resolvedData: T | null = null;
    let lastError: unknown = null;
    let triedAnyResponse = false;
    const startedAt = performance.now();
    const headers: Record<string, string> = { "X-Run-Id": runId };
    if (API_KEY) headers["X-API-Key"] = API_KEY;
    if (API_TOKEN) headers.Authorization = `Bearer ${API_TOKEN}`;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    const init: RequestInit = { method, headers };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    for (const base of API_BASE_CANDIDATES) {
      try {
        const candidateRes = await fetch(`${base}${path}`, init);
        triedAnyResponse = true;
        const contentType = (candidateRes.headers.get("content-type") ?? "").toLowerCase();
        const isLikelyJson = contentType.includes("application/json") || contentType.includes("+json");

        if (!candidateRes.ok) {
          res = candidateRes;
          break;
        }

        if (!isLikelyJson) {
          lastError = new Error(
            `Unexpected content-type for ${base}${path}: ${contentType || "unknown"}`,
          );
          continue;
        }

        try {
          resolvedData = await candidateRes.json() as T;
          res = candidateRes;
          break;
        } catch (err) {
          lastError = err;
        }
      } catch (err) {
        lastError = err;
      }
    }
    if (!res) {
      trackApiMetric({
        endpoint: path,
        method,
        durationMs: performance.now() - startedAt,
        ok: false,
      });
      throw new Error(lastError instanceof Error ? lastError.message : "Failed to fetch");
    }
    trackApiMetric({
      endpoint: path,
      method,
      statusCode: res.status,
      durationMs: performance.now() - startedAt,
      ok: res.ok,
    });
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

    if (resolvedData !== null) {
      return resolvedData;
    }

    if (triedAnyResponse) {
      throw new Error(
        lastError instanceof Error ? lastError.message : "API returned non-JSON response",
      );
    }

    throw new Error("Failed to fetch");
  })()
    .finally(() => {
      if (!options.skipInflightDedup && method === "GET") {
        inflight.delete(key);
      }
    });

  if (!options.skipInflightDedup && method === "GET") {
    inflight.set(key, pending);
  }
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

export interface PrimeiraParcelaDiaRow {
  total_valor: number;
  total_acordos: number;
}

export interface ExcecoesPorPortfolioRow {
  portfolio_name: string;
  qtd_excecoes: number;
  valor_excecoes: number;
}

export interface ExcecoesPorAgenteRow {
  agente: string;
  qtd_excecoes: number;
  valor_excecoes: number;
}

export interface AcordosPorPortfolioRow {
  portfolio_name: string;
  qtd_acordos: number;
  valor_acordos: number;
}

export interface PrimeiraParcelaPorAgenteRow {
  agente: string;
  qtd_acordos_primeira_parcela: number;
  valor_primeira_parcela: number;
}

export interface AcordoHojeAgenteRow {
  agente: string;
  cpf_cnpj: string;
  nome_devedor: string;
  nr_acordo: number;
  tipo_acordo: string;
  vencimento_primeira_parcela: string | null;
  valor_primeira_parcela: number | null;
  valor_demais_parcelas: number | null;
  qtd_parcelas: number | null;
  valor_total_acordo: number;
  data_emissao: string | null;
}

export interface StatusCargaRow {
  database: string;
  agentes: number;
  qtd_acionamentos: number;
  qtd_contatos: number;
  qtd_acordos: number;
  valor_acordos: number;
  qtd_excecoes: number;
  valor_excecoes: number;
}

export async function fetchPrimeiraParcelaDia(
  db: DatabaseOption,
): Promise<ApiEnvelope<PrimeiraParcelaDiaRow>> {
  return request<ApiEnvelope<PrimeiraParcelaDiaRow>>(`/dashboard/primeira-parcela-dia/${db}`);
}

export async function fetchExcecoesPorPortfolio(
  db: DatabaseOption,
): Promise<ApiEnvelope<ExcecoesPorPortfolioRow>> {
  return request<ApiEnvelope<ExcecoesPorPortfolioRow>>(`/dashboard/excecoes-por-portfolio/${db}`);
}

export async function fetchExcecoesPorAgente(
  db: DatabaseOption,
): Promise<ApiEnvelope<ExcecoesPorAgenteRow>> {
  return request<ApiEnvelope<ExcecoesPorAgenteRow>>(`/dashboard/excecoes-por-agente/${db}`);
}

export async function fetchAcordosPorPortfolio(
  db: DatabaseOption,
): Promise<ApiEnvelope<AcordosPorPortfolioRow>> {
  return request<ApiEnvelope<AcordosPorPortfolioRow>>(`/dashboard/acordos-por-portfolio/${db}`);
}

export async function fetchPrimeiraParcelaPorAgente(
  db: DatabaseOption,
): Promise<ApiEnvelope<PrimeiraParcelaPorAgenteRow>> {
  return request<ApiEnvelope<PrimeiraParcelaPorAgenteRow>>(`/dashboard/primeira-parcela-por-agente/${db}`);
}

export async function fetchStatusCarga(
  db: DatabaseOption,
  assessoria?: string,
): Promise<ApiEnvelope<StatusCargaRow>> {
  const query = new URLSearchParams();
  if (assessoria && assessoria !== "todos") query.set("assessoria", assessoria);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<StatusCargaRow>>(`/dashboard/status-carga/${db}${suffix}`);
}

export async function fetchAcordosHojeAgente(
  db: DatabaseOption,
  agente?: string,
): Promise<ApiEnvelope<AcordoHojeAgenteRow>> {
  const query = new URLSearchParams();
  if (agente && agente.trim() && agente.trim().toLowerCase() !== "todos") query.set("agente", agente.trim());
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<AcordoHojeAgenteRow>>(`/dashboard/acordos-hoje-agente/${db}${suffix}`);
}

// ─────────────────────────────────────────────────────────────────
// ADMIN: indices recomendados
// Endpoints protegidos por ENABLE_INDEX_ADMIN=true + REQUIRE_API_AUTH no backend.
// Ver main.py (/admin/indexes/*) e agecob-lens/docs/sql-indexes-recommendations.sql.
// ─────────────────────────────────────────────────────────────────
export type AdminDatabase = Exclude<DatabaseOption, "todos">;

export interface IndexDescriptor {
  name: string;
  table: string;
  key_columns: string[];
  include_columns: string[];
  purpose: string;
  exists: boolean;
}

export interface IndexesStatusResponse {
  database: string;
  total_recommended: number;
  existing: number;
  missing: number;
  indexes: IndexDescriptor[];
}

export type IndexApplyAction =
  | "skipped_existing"
  | "would_create"
  | "created"
  | "failed";

export type StatisticsApplyAction = "would_update" | "updated" | "failed";

export interface IndexApplyStep {
  name: string;
  table: string;
  sql: string;
  action: IndexApplyAction;
  error: string | null;
}

export interface StatisticsApplyStep {
  target: string;
  sql: string;
  action: StatisticsApplyAction;
  error: string | null;
}

export interface IndexesApplyResponse {
  database: string;
  dry_run: boolean;
  online: boolean;
  update_statistics: boolean;
  elapsed_ms: number;
  indexes: IndexApplyStep[];
  statistics: StatisticsApplyStep[];
}

export interface IndexesApplyOptions {
  dryRun?: boolean;
  online?: boolean;
  updateStatistics?: boolean;
}

export async function fetchAdminIndexesStatus(
  db: AdminDatabase,
): Promise<IndexesStatusResponse> {
  return request<IndexesStatusResponse>(`/admin/indexes/status/${db}`);
}

export async function applyAdminIndexes(
  db: AdminDatabase,
  options: IndexesApplyOptions = {},
): Promise<IndexesApplyResponse> {
  const query = new URLSearchParams();
  query.set("dry_run", String(options.dryRun ?? true));
  query.set("online", String(options.online ?? false));
  query.set("update_statistics", String(options.updateStatistics ?? false));
  return request<IndexesApplyResponse>(
    `/admin/indexes/apply/${db}?${query.toString()}`,
    { method: "POST", skipInflightDedup: true },
  );
}

// ─────────────────────────────────────────────────────────────────
// EFETIVIDADE DE BOLETOS
// ─────────────────────────────────────────────────────────────────
export interface EfDiariaRow {
  Dia_Emissao: string;
  Boletos_Gerados: number;
  Pagos_No_Prazo: number;
  Conversao_Prazo_5d: number;
}

export interface EfDiariaColchaoRow {
  Dia_Emissao: string;
  Boletos_Gerados_Colchao: number;
  Pagos_No_Prazo: number;
  Conversao_Colchao: number;
}

export interface EfMensalRow {
  Ano: number;
  Mes: number;
  Boletos_Gerados: number;
  Pagos_No_Prazo: number;
  Conversao_Prazo_5d: number;
}

export interface EfMensalColchaoRow {
  Ano: number;
  Mes: number;
  Boletos_Gerados_Colchao: number;
  Pagos_No_Prazo: number;
  Conversao_Colchao: number;
}

export interface EfAgenteRow {
  Agente: string;
  Ano: number;
  Mes: number;
  Boletos_Gerados: number;
  Pagos_No_Prazo: number;
  Conversao_Prazo_5d: number;
}

export interface EfAgenteColchaoRow {
  Agente: string;
  Ano: number;
  Mes: number;
  Boletos_Gerados_Colchao: number;
  Pagos_No_Prazo: number;
  Conversao_Colchao: number;
}

export async function fetchEfDiariaPrimeira(): Promise<ApiEnvelope<EfDiariaRow>> {
  return request<ApiEnvelope<EfDiariaRow>>("/efetividade/diaria-primeira");
}

export async function fetchEfDiariaColchao(): Promise<ApiEnvelope<EfDiariaColchaoRow>> {
  return request<ApiEnvelope<EfDiariaColchaoRow>>("/efetividade/diaria-colchao");
}

export async function fetchEfMensalPrimeira(): Promise<ApiEnvelope<EfMensalRow>> {
  return request<ApiEnvelope<EfMensalRow>>("/efetividade/mensal-primeira");
}

export async function fetchEfMensalColchao(): Promise<ApiEnvelope<EfMensalColchaoRow>> {
  return request<ApiEnvelope<EfMensalColchaoRow>>("/efetividade/mensal-colchao");
}

export async function fetchEfAgentePrimeira(): Promise<ApiEnvelope<EfAgenteRow>> {
  return request<ApiEnvelope<EfAgenteRow>>("/efetividade/mensal-agente-primeira");
}

export async function fetchEfAgenteColchao(): Promise<ApiEnvelope<EfAgenteColchaoRow>> {
  return request<ApiEnvelope<EfAgenteColchaoRow>>("/efetividade/mensal-agente-colchao");
}

export interface EfDiariaColchaoVencimentoRow {
  Dia_Vencimento: string;
  Boletos_Gerados_Colchao: number;
  Pagos_No_Prazo: number;
  Conversao_Colchao: number;
}

export interface EfMensalColchaoVencimentoRow {
  Ano: number;
  Mes: number;
  Boletos_Gerados_Colchao: number;
  Pagos_No_Prazo: number;
  Conversao_Colchao: number;
}

export async function fetchEfDiariaColchaoVencimento(): Promise<ApiEnvelope<EfDiariaColchaoVencimentoRow>> {
  return request<ApiEnvelope<EfDiariaColchaoVencimentoRow>>("/efetividade/diaria-colchao-vencimento");
}

export async function fetchEfMensalColchaoVencimento(): Promise<ApiEnvelope<EfMensalColchaoVencimentoRow>> {
  return request<ApiEnvelope<EfMensalColchaoVencimentoRow>>("/efetividade/mensal-colchao-vencimento");
}

export interface EfAgenteColchaoVencimentoRow {
  Agente: string;
  Ano: number;
  Mes: number;
  Boletos_Gerados_Colchao: number;
  Pagos_No_Prazo: number;
  Conversao_Colchao: number;
}

export async function fetchEfAgenteColchaoVencimento(): Promise<ApiEnvelope<EfAgenteColchaoVencimentoRow>> {
  return request<ApiEnvelope<EfAgenteColchaoVencimentoRow>>("/efetividade/mensal-agente-colchao-vencimento");
}
