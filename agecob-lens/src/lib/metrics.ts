import type { ProdutividadeRowWithSource } from "@/hooks/useProdutividadeData";
import type { MetricUnit } from "@/types/executive";

/**
 * Single source of truth for executive metric formulas.
 * Definitions match docs/redesign_executivo_dashboard_v2.md.
 */

/**
 * Dias úteis por mês para ratear meta mensal → meta diária (meta_dia = meta_mensal / 18).
 * Valor fixo definido pela gestão — não calculado do calendário.
 */
export const DIAS_UTEIS_MES = 18;

export interface MetricTotals {
  qtd_acionamentos: number;
  qtd_alo: number;
  qtd_contatos: number;
  qtd_acordos: number;
  qtd_boletos_emitidos: number;
  qtd_boletos_pagos: number;
  qtd_excecoes: number;
  valor_acordos: number;
  valor_primeira_parcela: number;
  valor_primeira_parcela_recebida: number;
  valor_excecoes: number;
  valor_primeira_parcela_excecoes: number;
  qtd_rejeitados: number;
  valor_rejeitados: number;
  horas_trabalhadas: number;
  /** Σ(idade_media_acordos × qtd_acordos) — divide por qtd_acordos para a média ponderada */
  idade_ponderada: number;
  agentes: number;
}

export function aggregateTotals(rows: ProdutividadeRowWithSource[]): MetricTotals {
  return rows.reduce<MetricTotals>(
    (acc, row) => {
      acc.qtd_acionamentos += Number(row.qtd_acionamentos || 0);
      acc.qtd_alo += Number(row.qtd_alo || 0);
      acc.qtd_contatos += Number(row.qtd_contatos || 0);
      acc.qtd_acordos += Number(row.qtd_acordos || 0);
      acc.qtd_boletos_emitidos += Number(row.qtd_boletos_emitidos || 0);
      acc.qtd_boletos_pagos += Number(row.qtd_boletos_pagos || 0);
      acc.qtd_excecoes += Number(row.qtd_excecoes || 0);
      acc.valor_acordos += Number(row.valor_acordos || 0);
      acc.valor_primeira_parcela += Number(row.valor_primeira_parcela || 0);
      acc.valor_primeira_parcela_recebida += Number(row.valor_p1_recebido || 0);
      acc.valor_excecoes += Number(row.valor_excecoes || 0);
      acc.valor_primeira_parcela_excecoes += Number(row.valor_primeira_parcela_excecoes || 0);
      acc.qtd_rejeitados += Number(row.qtd_rejeitados || 0);
      acc.valor_rejeitados += Number(row.valor_rejeitados || 0);
      acc.horas_trabalhadas += Number(row.horas_trabalhadas || 0);
      acc.idade_ponderada += Number(row.idade_media_acordos || 0) * Number(row.qtd_acordos || 0);
      return acc;
    },
    {
      qtd_acionamentos: 0,
      qtd_alo: 0,
      qtd_contatos: 0,
      qtd_acordos: 0,
      qtd_boletos_emitidos: 0,
      qtd_boletos_pagos: 0,
      qtd_excecoes: 0,
      valor_acordos: 0,
      valor_primeira_parcela: 0,
      valor_primeira_parcela_recebida: 0,
      valor_excecoes: 0,
      valor_primeira_parcela_excecoes: 0,
      qtd_rejeitados: 0,
      valor_rejeitados: 0,
      horas_trabalhadas: 0,
      idade_ponderada: 0,
      agentes: rows.length,
    },
  );
}

/** Receita por hora trabalhada = valor_acordos / horas_trabalhadas (proxy janela intradiária) */
export function calcReceitaPorHora(t: Pick<MetricTotals, "valor_acordos" | "horas_trabalhadas">): number {
  if (t.horas_trabalhadas <= 0) return 0;
  return t.valor_acordos / t.horas_trabalhadas;
}

/** Idade média dos acordos (dias de atraso do título) = Σ(idade × qtd) / Σ qtd */
export function calcIdadeMediaAcordos(t: Pick<MetricTotals, "idade_ponderada" | "qtd_acordos">): number {
  if (t.qtd_acordos <= 0) return 0;
  return t.idade_ponderada / t.qtd_acordos;
}

/** Taxa de CPC = qtd_contatos (RPC) / qtd_alo (alguém atendeu) */
export function calcCpc(t: Pick<MetricTotals, "qtd_contatos" | "qtd_alo">): number {
  if (!t.qtd_alo || t.qtd_alo <= 0) return 0;
  return (t.qtd_contatos * 100) / t.qtd_alo;
}

/** Taxa de contato = qtd_alo / qtd_acionamentos */
export function calcTaxaContato(t: Pick<MetricTotals, "qtd_alo" | "qtd_acionamentos">): number {
  if (t.qtd_acionamentos <= 0) return 0;
  return ((t.qtd_alo ?? 0) * 100) / t.qtd_acionamentos;
}

/** Conversão = acordos gerados (qtd_acordos) / CPC (qtd_contatos) */
export function calcConversao(t: Pick<MetricTotals, "qtd_acordos" | "qtd_contatos">): number {
  if (t.qtd_contatos <= 0) return 0;
  return (t.qtd_acordos * 100) / t.qtd_contatos;
}

/** Ticket médio = valor_acordos / qtd_acordos */
export function calcTicketMedio(t: Pick<MetricTotals, "valor_acordos" | "qtd_acordos">): number {
  if (t.qtd_acordos <= 0) return 0;
  return t.valor_acordos / t.qtd_acordos;
}

/** Exceções (% sobre valor) = valor_excecoes / valor_acordos * 100 */
export function calcExcecoesPctValor(t: Pick<MetricTotals, "valor_excecoes" | "valor_acordos">): number {
  if (t.valor_acordos <= 0) return 0;
  return (t.valor_excecoes * 100) / t.valor_acordos;
}

/** Composição de entrada = valor_primeira_parcela / valor_acordos * 100 (quanto do acordo é a entrada) */
export function calcComposicaoEntrada(t: Pick<MetricTotals, "valor_primeira_parcela" | "valor_acordos">): number {
  if (t.valor_acordos <= 0) return 0;
  return (t.valor_primeira_parcela * 100) / t.valor_acordos;
}

/** Efetividade de caixa = valor_p1_recebido / valor_primeira_parcela * 100 (quanto da entrada combinada entrou) */
export function calcEfetividadeCaixa(t: { valor_primeira_parcela: number; valor_p1_recebido: number }): number {
  if (t.valor_primeira_parcela <= 0) return 0;
  return (t.valor_p1_recebido * 100) / t.valor_primeira_parcela;
}

/** Taxa de exceções (sobre quantidade) = qtd_excecoes / qtd_acordos * 100 */
export function calcExcecoesPctQtd(t: Pick<MetricTotals, "qtd_excecoes" | "qtd_acordos">): number {
  if (t.qtd_acordos <= 0) return 0;
  return (t.qtd_excecoes * 100) / t.qtd_acordos;
}

/** Concentração: Top N pelo valor / total */
export function calcConcentracao(rows: ProdutividadeRowWithSource[], topN = 3): number {
  const total = rows.reduce((acc, r) => acc + Number(r.valor_acordos || 0), 0);
  if (total <= 0) return 0;
  const top = [...rows]
    .sort((a, b) => Number(b.valor_acordos || 0) - Number(a.valor_acordos || 0))
    .slice(0, topN)
    .reduce((acc, r) => acc + Number(r.valor_acordos || 0), 0);
  return (top * 100) / total;
}

/** Produtividade média por agente (BRL/agente) */
export function calcProdutividadeMediaAgente(rows: ProdutividadeRowWithSource[]): number {
  const ativos = rows.filter((r) => Number(r.qtd_acordos || 0) > 0).length;
  if (ativos <= 0) return 0;
  const total = rows.reduce((acc, r) => acc + Number(r.valor_acordos || 0), 0);
  return total / ativos;
}

/**
 * Operational Health Score: weighted normalized score 0–100.
 * Weights:
 *   - cpc            (target 35%)  weight 25%
 *   - conversao      (target 10%)  weight 30% — acordos/CPC; estimativa inicial
 *     (doc: "50 acordos de 500 contatos"), calibrar pós-deploy
 *   - ticket         (target 1500) weight 20%
 *   - exception_rate (target <=5%) weight 25% (inverted)
 */
export function calcHealthScore(t: MetricTotals): number {
  const cpc = calcCpc(t);
  const conv = calcConversao(t);
  const ticket = calcTicketMedio(t);
  const excPct = calcExcecoesPctQtd(t);
  const norm = (v: number, target: number) => Math.min(1, Math.max(0, v / target));
  const cpcN = norm(cpc, 35);
  const convN = norm(conv, 10);
  const ticketN = norm(ticket, 1500);
  const excN = 1 - Math.min(1, Math.max(0, excPct / 25));
  const score = cpcN * 25 + convN * 30 + ticketN * 20 + excN * 25;
  return Math.round(score);
}

const brlFull = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 2,
});

/**
 * Anti-truncamento BRL. Threshold compacto: R$ 100k.
 *   formatBRLCompact(1611575.51)         → "R$ 1,61 mi"
 *   formatBRLCompact(1611575.51, "full") → "R$ 1.611.575,51"
 *   formatBRLCompact(0)                  → "R$ 0,00"
 *   formatBRLCompact(null)               → "—"
 */
export function formatBRLCompact(
  value: number | null | undefined,
  mode: "auto" | "full" | "compact" = "auto",
): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (mode === "full") return brlFull.format(value);
  if (mode === "compact") return brlCompact.format(value);
  return Math.abs(value) >= 100_000 ? brlCompact.format(value) : brlFull.format(value);
}

/**
 * Delta magnitude inteira (sem seta — o ícone é renderizado pelo componente).
 * Espera fração (0.124 = 12,4%).
 *   formatDelta(0.124, "up")   → "12%"
 *   formatDelta(0.041, "down") → "4%"
 *   formatDelta(0.003, "flat") → "0%"
 */
export function formatDelta(value: number, _direction: "up" | "down" | "flat"): string {
  return `${Math.round(Math.abs(value) * 100)}%`;
}

export function fmtBRL(v: number, options?: { compact?: boolean }): string {
  const opts: Intl.NumberFormatOptions = {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: options?.compact ? 1 : 2,
  };
  if (options?.compact) {
    return v.toLocaleString("pt-BR", { ...opts, notation: "compact" });
  }
  return v.toLocaleString("pt-BR", opts);
}

export function fmtNum(v: number): string {
  return v.toLocaleString("pt-BR");
}

export function fmtPct(v: number, fractionDigits = 1): string {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}%`;
}

export function fmtByUnit(v: number, unit: MetricUnit): string {
  if (unit === "BRL") return fmtBRL(v);
  if (unit === "%") return fmtPct(v);
  return fmtNum(v);
}

export function shortAgentName(fullName: string): string {
  const cleaned = (fullName || "").trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const firstName = parts[0];
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  return lastName ? `${firstName} ${lastName.charAt(0).toUpperCase()}.` : firstName;
}

export function buFromSource(source: string): "AUTOS" | "CONSUMER" {
  return source.toUpperCase().includes("AUTO") ? "AUTOS" : "CONSUMER";
}
