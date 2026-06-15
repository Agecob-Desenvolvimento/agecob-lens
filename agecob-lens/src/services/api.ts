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
  qtd_alo: number;
  qtd_contatos: number;
  cpc_percentual: number;
  qtd_acordos: number;
  qtd_boletos_emitidos: number;
  qtd_boletos_pagos: number;
  acordos_percentual: number;
  valor_acordos: number;
  acordo_medio: number;
  parcelamento_medio: number;
  desconto_medio_percentual: number;
  valor_p1_recebido: number;
  valor_primeira_parcela: number;
  qtd_excecoes: number;
  valor_excecoes: number;
  valor_primeira_parcela_excecoes: number;
  qtd_rejeitados: number;
  valor_rejeitados: number;
  idade_media_acordos: number;
  horas_trabalhadas: number;
}

export interface ProdutividadeFilters {
  assessoria?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Portfólio = DIV_AUX.CAMPO010 (string) */
  portfolio?: string;
}

export interface PortfolioRow {
  /** = CAMPO010 (o próprio nome do portfólio é o id) */
  id: string;
  nome: string;
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
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    const headers: Record<string, string> = { "X-Run-Id": runId };
    if (API_KEY) headers["X-API-Key"] = API_KEY;
    if (API_TOKEN) headers.Authorization = `Bearer ${API_TOKEN}`;
    // FormData: o browser define Content-Type com o boundary multipart — não forçar.
    if (options.body !== undefined && !isFormData) headers["Content-Type"] = "application/json";

    const init: RequestInit = { method, headers };
    if (options.body !== undefined) {
      init.body = isFormData ? (options.body as FormData) : JSON.stringify(options.body);
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
        if (body?.detail) {
          // FastAPI 422 retorna detail como array de objetos de validação.
          detail = typeof body.detail === "string"
            ? body.detail
            : Array.isArray(body.detail)
              ? body.detail.map((d: { msg?: string }) => d?.msg ?? JSON.stringify(d)).join("; ")
              : JSON.stringify(body.detail);
        }
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
  if (filters?.assessoria && filters.assessoria !== "Todas") query.set("assessoria", filters.assessoria);
  if (filters?.dateFrom) query.set("date_from", filters.dateFrom);
  if (filters?.dateTo) query.set("date_to", filters.dateTo);
  if (filters?.portfolio) query.set("portfolio", filters.portfolio);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<ProdutividadeRow>>(`/dashboard/produtividade-hoje/${db}${suffix}`);
}

export async function fetchPortfolios(
  db: Exclude<DatabaseOption, "todos">,
): Promise<ApiEnvelope<PortfolioRow>> {
  return request<ApiEnvelope<PortfolioRow>>(`/dashboard/portfolios/${db}`);
}

// ── Metas (PDF → JSON) ────────────────────────────────────────────────────────

export interface MetaMensal {
  "202604": number;
  "202605": number;
  "202606": number;
}

export interface MetaRow {
  escritorio: string | null;
  portfolio: string;
  grupo: string | null;
  qtd_negociadores: number | null;
  meta_caixa: MetaMensal;
  meta_retomadas_qtd: MetaMensal;
  meta_retomadas_valor: MetaMensal;
  meta_pnt: MetaMensal;
}

export interface MetasEnvelope {
  meta: {
    periodo: string;
    extraido_em: string;
    arquivo_origem: string;
    total_registros: number;
    validado: boolean;
    checksum_pnt_202604: number;
    checksum_total_geral_202604: number;
  };
  metas: MetaRow[];
}

export async function fetchMetas(): Promise<MetasEnvelope> {
  return request<MetasEnvelope>("/dashboard/metas");
}

export async function uploadMetasPDF(file: File): Promise<MetasEnvelope> {
  const form = new FormData();
  form.append("file", file);
  // O backend responde HTTP 200 mesmo em falha de validação (envelope com errors).
  const resp = await request<MetasEnvelope & { errors?: ApiErrorItem[] }>("/dashboard/metas/upload", {
    method: "POST",
    body: form,
    skipInflightDedup: true,
  });
  if (resp.errors?.length) throw new Error(resp.errors.map((e) => e.message).join("; "));
  return resp;
}

// ── Real por Portfólio (MetaVsRealPanel) ──────────────────────────────────────

export interface RealPorPortfolioRow {
  portfolio_name: string;
  qtd_acordos: number;
  valor_acordos: number;
  valor_primeira_parcela: number;
}

export async function fetchRealPorPortfolio(
  db: DatabaseOption,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<RealPorPortfolioRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<RealPorPortfolioRow>>(`/dashboard/real-por-portfolio/${db}${suffix}`);
}

export interface PrimeiraParcelaDiaRow {
  total_valor: number;
  total_acordos: number;
}

export interface RejeitadosTotaisRow {
  valor_total: number;
  valor_primeira_parcela: number;
  qtd_rejeitados: number;
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

export interface RejeitadosPorAgenteRow {
  agente: string;
  qtd_rejeitados: number;
  valor_rejeitados: number;
  valor_primeira_parcela_rejeitados: number;
}

export interface AcordosPorPortfolioRow {
  portfolio_name: string;
  qtd_acordos: number;
  valor_acordos: number;
}

export interface RejeitadosPorPortfolioRow {
  portfolio_name: string;
  qtd_rejeitados: number;
  valor_rejeitados: number;
}

export interface QuebradosPorPortfolioRow {
  portfolio_name: string;
  qtd_quebrados: number;
  valor_quebrados: number;
}

export interface ExcecaoSemPortfolioRow {
  NR_RECEBIMENTO: number;
  ID_CARTEIRA: number;
  valor_primeira_parcela: number;
  valor_total: number;
  agente: string;
  matricula: string;
  cpf_mask: string;
  nome_devedor: string;
  data_acordo: string | null;
  data_vencimento: string | null;
  total_parcelas: number;
  // Opcionais — só os sidebars de KPI de efetividade (boletos-detalhe) retornam estes
  parcelas_pagas?: number | null;
  data_quebra?: string | null;
  portfolio_name?: string | null;
  divida_original?: number | null;
}

export type QuebradoDetalheRow = ExcecaoSemPortfolioRow;

export interface PrimeiraParcelaPorAgenteRow {
  agente: string;
  qtd_acordos_primeira_parcela: number;
  valor_primeira_parcela: number;
}

export interface BenchmarkQuartiles {
  q1: number | null;
  median: number | null;
  q3: number | null;
  top10_mean: number | null;
  mean: number | null;
}

export interface BenchmarkData {
  taxa_contato: BenchmarkQuartiles;
  taxa_conversao: BenchmarkQuartiles;
  efetividade_caixa: BenchmarkQuartiles;
  pct_excecoes: BenchmarkQuartiles;
  n_agentes: number;
  lookback_months: number;
}

/** Benchmarks return a single object as `data`, not an array. */
export interface BenchmarkEnvelope {
  meta: ApiMeta;
  data: BenchmarkData;
  errors: ApiErrorItem[];
}

export interface PrimeiraParcelaPorPortfolioRow {
  portfolio_name: string;
  qtd_acordos: number;
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
  assessoria?: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<PrimeiraParcelaDiaRow>> {
  const query = new URLSearchParams();
  if (assessoria && assessoria !== "Todas") query.set("assessoria", assessoria);
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<PrimeiraParcelaDiaRow>>(`/dashboard/primeira-parcela-dia/${db}${suffix}`);
}

export async function fetchRejeitadosTotais(
  db: DatabaseOption,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<RejeitadosTotaisRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<RejeitadosTotaisRow>>(`/dashboard/rejeitados-totais/${db}${suffix}`);
}

export async function fetchExcecoesPorPortfolio(
  db: DatabaseOption,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<ExcecoesPorPortfolioRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<ExcecoesPorPortfolioRow>>(`/dashboard/excecoes-por-portfolio/${db}${suffix}`);
}

export async function fetchExcecoesPorAgente(
  db: DatabaseOption,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<ExcecoesPorAgenteRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<ExcecoesPorAgenteRow>>(`/dashboard/excecoes-por-agente/${db}${suffix}`);
}

export async function fetchRejeitadosPorAgente(
  db: DatabaseOption,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<RejeitadosPorAgenteRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<RejeitadosPorAgenteRow>>(`/dashboard/rejeitados-por-agente/${db}${suffix}`);
}

export async function fetchAcordosPorPortfolio(
  db: DatabaseOption,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<AcordosPorPortfolioRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<AcordosPorPortfolioRow>>(`/dashboard/acordos-por-portfolio/${db}${suffix}`);
}

// ── Cluster A consolidated (Phase 2) ─────────────────────────────
/** One row per (portfolio, ID_REC_STATUS). Slice by status to rebuild the
 *  5 legacy por-portfolio shapes — see lib/portfolioRollup.ts. */
export interface PortfolioRollupRow {
  portfolio_name: string;
  id_rec_status: number;
  qtd: number;
  valor: number;
}

export async function fetchPortfolioRollup(
  db: DatabaseOption,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<PortfolioRollupRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<PortfolioRollupRow>>(`/dashboard/portfolio-rollup/${db}${suffix}`);
}

export async function fetchExcecoesSemPortfolio(
  db: DatabaseOption,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<ExcecaoSemPortfolioRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<ExcecaoSemPortfolioRow>>(`/dashboard/excecoes-sem-portfolio/${db}${suffix}`);
}

export async function fetchRejeitadosPorPortfolio(
  db: DatabaseOption,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<RejeitadosPorPortfolioRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<RejeitadosPorPortfolioRow>>(`/dashboard/rejeitados-por-portfolio/${db}${suffix}`);
}

export async function fetchQuebradosPorPortfolio(
  db: DatabaseOption,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<QuebradosPorPortfolioRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<QuebradosPorPortfolioRow>>(`/dashboard/quebrados-por-portfolio/${db}${suffix}`);
}

export async function fetchExcecoesDetalhe(
  db: DatabaseOption,
  portfolio: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<QuebradoDetalheRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<QuebradoDetalheRow>>(
    `/dashboard/excecoes-detalhe/${db}/${encodeURIComponent(portfolio)}${suffix}`,
  );
}

export async function fetchRejeitadosDetalhe(
  db: DatabaseOption,
  portfolio: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<QuebradoDetalheRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<QuebradoDetalheRow>>(
    `/dashboard/rejeitados-detalhe/${db}/${encodeURIComponent(portfolio)}${suffix}`,
  );
}

export async function fetchAcordosDetalhe(
  db: DatabaseOption,
  portfolio: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<QuebradoDetalheRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<QuebradoDetalheRow>>(
    `/dashboard/acordos-detalhe/${db}/${encodeURIComponent(portfolio)}${suffix}`,
  );
}

export async function fetchQuebradosDetalhe(
  db: DatabaseOption,
  portfolio: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<QuebradoDetalheRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<QuebradoDetalheRow>>(
    `/dashboard/quebrados-detalhe/${db}/${encodeURIComponent(portfolio)}${suffix}`,
  );
}

// ── agent-level detail ─────────────────────────────────────────

export async function fetchExcecoesDetalheAgente(
  db: DatabaseOption,
  agente: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<ExcecaoSemPortfolioRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<ExcecaoSemPortfolioRow>>(
    `/dashboard/excecoes-detalhe-agente/${db}/${encodeURIComponent(agente)}${suffix}`,
  );
}

export async function fetchRejeitadosDetalheAgente(
  db: DatabaseOption,
  agente: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<ExcecaoSemPortfolioRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<ExcecaoSemPortfolioRow>>(
    `/dashboard/rejeitados-detalhe-agente/${db}/${encodeURIComponent(agente)}${suffix}`,
  );
}

export async function fetchQuebradosDetalheAgente(
  db: DatabaseOption,
  agente: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<QuebradoDetalheRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<QuebradoDetalheRow>>(
    `/dashboard/quebrados-detalhe-agente/${db}/${encodeURIComponent(agente)}${suffix}`,
  );
}

export async function fetchBenchmarks(
  db: DatabaseOption,
  lookbackMonths = 9,
): Promise<BenchmarkEnvelope> {
  const resolved = db === "todos" ? "COBwebRCBAUTOS" : db;
  return request<BenchmarkEnvelope>(
    `/dashboard/benchmarks/${resolved}?lookback_months=${lookbackMonths}`,
  );
}

export async function fetchPrimeiraParcelaPorAgente(
  db: DatabaseOption,
  assessoria?: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<PrimeiraParcelaPorAgenteRow>> {
  const query = new URLSearchParams();
  if (assessoria && assessoria !== "Todas") query.set("assessoria", assessoria);
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<PrimeiraParcelaPorAgenteRow>>(`/dashboard/primeira-parcela-por-agente/${db}${suffix}`);
}

export async function fetchPrimeiraParcelaPorPortfolio(
  db: DatabaseOption,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<PrimeiraParcelaPorPortfolioRow>> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<PrimeiraParcelaPorPortfolioRow>>(`/dashboard/primeira-parcela-por-portfolio/${db}${suffix}`);
}

export async function fetchStatusCarga(
  db: DatabaseOption,
  assessoria?: string,
): Promise<ApiEnvelope<StatusCargaRow>> {
  const query = new URLSearchParams();
  if (assessoria && assessoria !== "Todas") query.set("assessoria", assessoria);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<StatusCargaRow>>(`/dashboard/status-carga/${db}${suffix}`);
}

export async function fetchAcordosHojeAgente(
  db: DatabaseOption,
  agente?: string,
  assessoria?: string,
): Promise<ApiEnvelope<AcordoHojeAgenteRow>> {
  const query = new URLSearchParams();
  if (agente && agente.trim() && agente.trim().toLowerCase() !== "todos") query.set("agente", agente.trim());
  if (assessoria && assessoria !== "Todas") query.set("assessoria", assessoria);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<AcordoHojeAgenteRow>>(`/dashboard/acordos-hoje-agente/${db}${suffix}`);
}

// ─────────────────────────────────────────────────────────────────
// TABELA PERFORMANCE PERÍODO (2026-04-01 a 2026-05-05)
// ─────────────────────────────────────────────────────────────────
export interface TabelaPerformancePeriodoRow {
  nome_agente: string;
  matricula: string;
  qtd_acionamentos: number;
  qtd_alo: number;
  qtd_contatos: number;
  qtd_acordos: number;
  conversao_pct: number;
  valor_total: number;
  soma_primeira_parcela: number;
  valor_p1_recebido: number;
  qtd_reprovados: number;
  cpc_pct: number;
  qtd_excecoes: number;
  valor_excecoes: number;
}

export async function fetchTabelaPerformancePeriodo(
  db: DatabaseOption,
  agente?: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiEnvelope<TabelaPerformancePeriodoRow>> {
  const query = new URLSearchParams();
  if (agente && agente.trim() && agente.trim().toLowerCase() !== "todos") query.set("agente", agente.trim());
  if (dateFrom) query.set("date_from", dateFrom);
  if (dateTo) query.set("date_to", dateTo);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApiEnvelope<TabelaPerformancePeriodoRow>>(`/dashboard/tabela-performance-periodo/${db}${suffix}`);
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

function _efSuffix(db?: string): string {
  if (!db || db === "todos") return "";
  return `?db=${encodeURIComponent(db)}`;
}

export async function fetchEfDiariaPrimeira(db?: string): Promise<ApiEnvelope<EfDiariaRow>> {
  return request<ApiEnvelope<EfDiariaRow>>(`/efetividade/diaria-primeira${_efSuffix(db)}`);
}

export async function fetchEfDiariaColchao(db?: string): Promise<ApiEnvelope<EfDiariaColchaoRow>> {
  return request<ApiEnvelope<EfDiariaColchaoRow>>(`/efetividade/diaria-colchao${_efSuffix(db)}`);
}

export async function fetchEfMensalPrimeira(db?: string): Promise<ApiEnvelope<EfMensalRow>> {
  return request<ApiEnvelope<EfMensalRow>>(`/efetividade/mensal-primeira${_efSuffix(db)}`);
}

export async function fetchEfMensalColchao(db?: string): Promise<ApiEnvelope<EfMensalColchaoRow>> {
  return request<ApiEnvelope<EfMensalColchaoRow>>(`/efetividade/mensal-colchao${_efSuffix(db)}`);
}

export async function fetchEfAgentePrimeira(db?: string): Promise<ApiEnvelope<EfAgenteRow>> {
  return request<ApiEnvelope<EfAgenteRow>>(`/efetividade/mensal-agente-primeira${_efSuffix(db)}`);
}

export async function fetchEfAgenteColchao(db?: string): Promise<ApiEnvelope<EfAgenteColchaoRow>> {
  return request<ApiEnvelope<EfAgenteColchaoRow>>(`/efetividade/mensal-agente-colchao${_efSuffix(db)}`);
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

export async function fetchEfDiariaColchaoVencimento(db?: string): Promise<ApiEnvelope<EfDiariaColchaoVencimentoRow>> {
  return request<ApiEnvelope<EfDiariaColchaoVencimentoRow>>(`/efetividade/diaria-colchao-vencimento${_efSuffix(db)}`);
}

export async function fetchEfMensalColchaoVencimento(db?: string): Promise<ApiEnvelope<EfMensalColchaoVencimentoRow>> {
  return request<ApiEnvelope<EfMensalColchaoVencimentoRow>>(`/efetividade/mensal-colchao-vencimento${_efSuffix(db)}`);
}

export interface EfAgenteColchaoVencimentoRow {
  Agente: string;
  Ano: number;
  Mes: number;
  Boletos_Gerados_Colchao: number;
  Pagos_No_Prazo: number;
  Conversao_Colchao: number;
  Quebrados: number;
}

export async function fetchEfAgenteColchaoVencimento(db?: string): Promise<ApiEnvelope<EfAgenteColchaoVencimentoRow>> {
  return request<ApiEnvelope<EfAgenteColchaoVencimentoRow>>(`/efetividade/mensal-agente-colchao-vencimento${_efSuffix(db)}`);
}

// ── Efetividade Resumo (live, date-range) ────────────────────────────────────

export interface EfResumoDayRow {
  dia: string;
  generated: number;
  paid_on_time: number;
  conversion_pct: number;
  amount_maturing: number;
  amount_received: number;
  effectiveness_pct: number;
}

export interface EfResumoKpis {
  generated: number;
  total_acordos: number;
  to_mature: number;
  overdue_unpaid: number;
  paid_on_time: number;
  broken: number;
  conversion_pct: number;
  amount_maturing: number;
  amount_received: number;
  effectiveness_pct: number;
}

export interface EfResumoData {
  kpis: EfResumoKpis;
  daily: EfResumoDayRow[];
  best_day: EfResumoDayRow | null;
  worst_day: EfResumoDayRow | null;
}

export interface EfResumoEnvelope {
  meta: { generated_at: string; sources: string[]; filters: Record<string, unknown> };
  data: EfResumoData;
  errors: unknown[];
}

export async function fetchEfResumo(
  dateFrom: string,
  dateTo: string,
  db?: string,
  parcelaTipo: "primeira" | "colchao" = "primeira",
  idPortfolio?: number,
): Promise<EfResumoEnvelope> {
  const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, parcela_tipo: parcelaTipo });
  if (db && db !== "todos") params.set("db", db);
  if (idPortfolio != null) params.set("id_portfolio", String(idPortfolio));
  return request<EfResumoEnvelope>(`/efetividade/resumo?${params.toString()}`);
}

export type BoletosDetalheKind = "a_vencer" | "vencidos_nao_pagos" | "quebrados" | "pagos_prazo";

export async function fetchBoletosDetalhe(
  kind: BoletosDetalheKind,
  dateFrom: string,
  dateTo: string,
  db?: string,
  parcelaTipo: "primeira" | "colchao" = "primeira",
): Promise<ApiEnvelope<QuebradoDetalheRow>> {
  const params = new URLSearchParams({ kind, date_from: dateFrom, date_to: dateTo, parcela_tipo: parcelaTipo });
  if (db && db !== "todos") params.set("db", db);
  return request<ApiEnvelope<QuebradoDetalheRow>>(`/efetividade/boletos-detalhe?${params.toString()}`);
}

// ── Curva de Quebra por Atraso ──────────────────────────────────────────

export interface EfCurvaQuebraRow {
  faixa: string;
  total: number;
  quebrados: number;
  taxa_quebra: number;
}

export async function fetchEfCurvaQuebra(
  dateFrom: string,
  dateTo: string,
  db?: string,
): Promise<ApiEnvelope<EfCurvaQuebraRow>> {
  const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
  if (db && db !== "todos") params.set("db", db);
  return request<ApiEnvelope<EfCurvaQuebraRow>>(`/efetividade/curva-quebra?${params.toString()}`);
}

export interface RitmoDiaBanda {
  hora: number;
  esperado: number;
  real: number | null;
  delta: number | null;
  status: "acima" | "ok" | "abaixo" | "em_andamento" | "futuro";
  acumulado: number | null;
}

export interface RitmoDiaResponse {
  meta: {
    generated_at: string;
    em_operacao: boolean;
    modelo: string;
    faixa_batimento?: string;
    dias_desde_ultimo_batimento?: number;
  };
  data: {
    hora_atual: number;
    acumulado_atual: number;
    esperado_total?: number;
    projecao_fechamento?: number;
    bandas: RitmoDiaBanda[];
  };
  errors: ApiErrorItem[];
}

export async function fetchRitmoDia(db: DatabaseOption): Promise<RitmoDiaResponse> {
  return request<RitmoDiaResponse>(`/dashboard/ritmo-dia/${db}`);
}

// ── Regressao ──────────────────────────────────────────────────────────────

export interface RegressionModelResult {
  id: string;
  label: string;
  description: string;
  drawable: boolean;
  r2_train: number;
  r2_test: number;
  adj_r2: number;
  cv_train_n: number;
  cv_test_n: number;
  intercept: number;
  intercept_se: number;
  coefficients: Array<{ name: string; value: number; se: number }>;
}

export interface RegressionCleaningMeta {
  raw_count: number;
  clean_count: number;
  removed_nulls: number;
  removed_duplicates: number;
  removed_outliers: number;
}

export interface RegressionEnvelope {
  meta: ApiMeta & { raw_count?: number };
  data: Array<{
    meta: RegressionCleaningMeta;
    modelos: RegressionModelResult[];
  }>;
  errors: ApiErrorItem[];
}

export interface RegressionPoint {
  id: string;
  nome: string;
  eficiencia: number;
  valor: number;
  acionamentos: number;
  contatos: number;
  cpc: number;
  conversao: number;
}

export async function fetchRegressionModels(
  pontos: RegressionPoint[],
): Promise<RegressionEnvelope> {
  return request<RegressionEnvelope>("/regressao/agentes", {
    method: "POST",
    body: { pontos },
    skipInflightDedup: true,
  });
}

// ─────────────────────────────────────────────────────────────────
// AGENTE DE CHAT — ANALISTA DE CARTEIRAS
// Backend: POST /agente/chat (api/routers/agente.py), atras de ENABLE_AGENT_CHAT.
// ─────────────────────────────────────────────────────────────────
export interface AgentChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentHighlight {
  type: "anomaly" | "metric" | "portfolio";
  label: string;
  value?: string;
}

export interface AgentSuggestedAction {
  label: string;
  /** Pergunta de follow-up enviada ao clicar; ausente = botao apenas informativo. */
  prompt?: string;
}

export interface AgentResponse {
  text: string;
  highlights: AgentHighlight[];
  suggested_actions: AgentSuggestedAction[];
  data_sources: string[];
  confidence: "high" | "medium" | "low";
  data_referencia?: string;
}

export async function postAgentChat(
  messages: AgentChatMessage[],
  db: DatabaseOption,
  dateFrom?: string,
  dateTo?: string,
): Promise<AgentResponse> {
  const envelope = await request<ApiEnvelope<AgentResponse>>("/agente/chat", {
    method: "POST",
    body: { messages, database: db, dateFrom, dateTo },
    skipInflightDedup: true,
  });
  const first = envelope.data[0];
  if (!first) throw new Error("Resposta vazia do agente.");
  return first;
}