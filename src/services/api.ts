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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
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
  return res.json();
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
