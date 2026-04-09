export const API_BASE_URL = "http://127.0.0.1:8000";

export type DatabaseOption = "COBwebRCBAUTOS" | "COBwebRCBCONSUMER" | "todos";

export interface ModuleConfig {
  id: string;
  title: string;
  endpoint: string; // e.g. "/dashboard/acordos-hoje" — {db} is appended automatically
}

export const MODULES: ModuleConfig[] = [
  {
    id: "acordos-hoje",
    title: "Acordos fechados hoje",
    endpoint: "/dashboard/acordos-hoje",
  },
];

export async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
