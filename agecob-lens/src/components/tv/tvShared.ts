/**
 * Modo TV — paleta escura, formatadores e tipos compartilhados.
 * Transcrição fiel do design standalone (canvas 1920×1080, caixa alta).
 * Estilos inline preservam a régua de tamanhos em px do broadcast.
 */
import { createContext, useContext } from "react";

export const TV = {
  bg0: "#060912",
  bg1: "#0a1020",
  card: "#0e1730",
  cardHi: "#122046",
  line: "rgba(255,255,255,0.07)",
  lineHi: "rgba(255,255,255,0.14)",
  petrol: "#15355c",
  t1: "#eef2fb",
  t2: "#9aa6c2",
  t3: "#5d6886",
  gold: "#d4af5a",
  cyan: "#5cd0e8",
  good: "#37d39a",
  warn: "#f0b840",
  bad: "#f0716f",
} as const;

export type TvTone = "good" | "warn" | "bad" | "neutral";

export const TONE: Record<TvTone, string> = {
  good: TV.good,
  warn: TV.warn,
  bad: TV.bad,
  neutral: TV.cyan,
};

export const TV_MONO = "'JetBrains Mono', ui-monospace, monospace";

// ---------- Formatadores (null → "—") ----------
export const tvBRL = (v: number | null | undefined, dec = 0): string =>
  v == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: dec }).format(v);

export const tvBRLk = (v: number | null | undefined): string => {
  if (v == null) return "—";
  if (Math.abs(v) >= 1000) return "R$ " + (v / 1000).toFixed(1).replace(".", ",") + "k";
  return tvBRL(v);
};

export const tvNum = (v: number | null | undefined): string =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR").format(v);

export const tvPct = (v: number | null | undefined): string =>
  v == null ? "—" : v.toFixed(1).replace(".", ",") + "%";

// ---------- Tipos do ViewModel do Modo TV ----------
export interface TvHeroValor {
  /** 1ª parcela realizada (real) */
  realizado: number | null;
  /** meta diária de 1ª parcela — sem fonte (placeholder) */
  meta: number | null;
  /** 1ª parcela do período anterior (aproxima "ontem mesma hora") */
  ontemMesmaHora: number | null;
  /** delta fracionário vs período anterior (real) */
  vsOntem: number | null;
  /** projeção de fechamento de 1ª parcela — sem fonte (placeholder) */
  projecao: number | null;
  /** realizado / meta (placeholder enquanto não há meta) */
  pctMeta: number | null;
  /** projecao / meta (placeholder) */
  projPctMeta: number | null;
}

export interface TvKpi {
  id: string;
  label: string;
  value: string;
  sub: string;
  tone: TvTone;
}

export interface TvBu {
  bu: string;
  /** 1ª parcela da unidade (real) */
  valor: number | null;
  /** qtd de acordos da unidade (real, via funil) */
  acordos: number | null;
  /** meta de 1ª parcela por unidade — sem fonte (placeholder) */
  metaValor: number | null;
  /** valor / metaValor (placeholder) */
  pct: number | null;
}

export interface TvRitmoBanda {
  h: number;
  esp: number | null;
  real: number | null;
  isNow: boolean;
}

export interface TvRitmoAgg {
  real: number | null;
  espAteAgora: number | null;
  proj: number | null;
  meta: number | null;
}

export type TvTickerKind = "win" | "up" | "alert" | "info";
export interface TvTickerItem {
  kind: TvTickerKind;
  text: string;
}

export interface TvModeViewModel {
  loading: boolean;
  valor: TvHeroValor;
  kpis: TvKpi[];
  bu: TvBu[];
  buTotal: number;
  ritmo: TvRitmoBanda[];
  ritmoAgg: TvRitmoAgg;
  nowHour: number | null;
  emOperacao: boolean;
  ticker: TvTickerItem[];
  /** campos sem dado real (mostrados como "—") */
  placeholders: string[];
}

// ---------- Context (evita prop drilling pelos átomos) ----------
export const TvDataContext = createContext<TvModeViewModel | null>(null);

export function useTvData(): TvModeViewModel {
  const ctx = useContext(TvDataContext);
  if (!ctx) throw new Error("useTvData deve ser usado dentro de <TvDataContext.Provider>");
  return ctx;
}
