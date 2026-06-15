/**
 * Hook para buscar e filtrar metas extraídas do PDF via extrator.py.
 *
 * Regra de ouro: quando portfolio === null ("Todos"), mostra TODOS os portfólios
 * com uma linha de média ponderada por headcount no topo. NUNCA soma as metas.
 *
 * Modo "Todos" → banner de aviso + média + lista completa de portfólios
 * Modo específico → metas exatas do portfólio selecionado
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMetas, type MetaRow, type MetasEnvelope } from "@/services/api";

export interface MetaFiltrada {
  portfolio: string;
  grupo: string | null;
  qtd_negociadores: number;
  meta_pnt: number;
  meta_caixa: number;
  meta_retomadas_valor: number;
  /** True quando é a linha de média (modo "Todos"), não meta exata */
  _isMedia: boolean;
}

export interface UseMetasDataResult {
  metasFiltradas: MetaFiltrada[];
  /** Linha de média no topo — só preenchida no modo "Todos" */
  mediaRow: MetaFiltrada | null;
  envelopeMeta: MetasEnvelope["meta"] | null;
  isLoading: boolean;
  error: Error | null;
  isMedia: boolean;
}

const DEFAULT_MES = "202606";

/** Headcount é fracionário no PDF (alocação rateada). Formata pt-BR. */
function fmtHc(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function rowToMeta(m: MetaRow, mes: keyof MetaRow["meta_pnt"]): MetaFiltrada {
  return {
    portfolio: m.portfolio,
    grupo: m.grupo,
    qtd_negociadores: m.qtd_negociadores ?? 0,
    meta_pnt: m.meta_pnt[mes],
    meta_caixa: m.meta_caixa[mes],
    meta_retomadas_valor: m.meta_retomadas_valor[mes],
    _isMedia: false,
  };
}

export function useMetasData(
  portfolio: string | null,
  mesSelecionado: string = DEFAULT_MES,
): UseMetasDataResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ["metas"],
    queryFn: fetchMetas,
    staleTime: 10 * 60_000,
  });

  const result = useMemo((): Omit<UseMetasDataResult, "isLoading" | "error"> => {
    if (!data?.metas || data.metas.length === 0) {
      return {
        metasFiltradas: [],
        mediaRow: null,
        envelopeMeta: data?.meta ?? null,
        isMedia: false,
      };
    }

    const mes = mesSelecionado as keyof MetaRow["meta_pnt"];

    if (portfolio !== null) {
      // Modo portfolio específico: metas exatas
      const filtradas = data.metas
        .filter((m) => m.portfolio === portfolio)
        .map((m) => rowToMeta(m, mes));

      return {
        metasFiltradas: filtradas,
        mediaRow: null,
        envelopeMeta: data.meta,
        isMedia: false,
      };
    }

    // ── Modo "Todos os portfólios" ──
    // Exibe portfólios COM meta no mês + uma linha de média no topo.
    // Portfólios com meta 0 no PDF (linhas "-") são omitidos — nada a comparar.

    // Comparação é Caixa vs Caixa, então filtra/ordena por meta_caixa.
    const todas = data.metas
      .map((m) => rowToMeta(m, mes))
      .filter((m) => m.meta_caixa > 0)
      .sort((a, b) => b.meta_caixa - a.meta_caixa); // maior meta primeiro

    // Linha de resumo = TOTAL da carteira (soma das metas = alvo do escritório).
    // Somar metas por portfólio é válido (≠ somar por agente). O real agregado
    // correspondente é calculado no painel a partir de dadosReais.
    const totalHeadcount = todas.reduce((s, m) => s + m.qtd_negociadores, 0);

    let mediaRow: MetaFiltrada | null = null;
    if (todas.length > 0) {
      const hc = totalHeadcount > 0 ? ` · ${fmtHc(totalHeadcount)} HC` : "";
      mediaRow = {
        portfolio: `Total da carteira (${todas.length} portfólios${hc})`,
        grupo: null,
        qtd_negociadores: totalHeadcount,
        meta_pnt: todas.reduce((s, m) => s + m.meta_pnt, 0),
        meta_caixa: todas.reduce((s, m) => s + m.meta_caixa, 0),
        meta_retomadas_valor: todas.reduce((s, m) => s + m.meta_retomadas_valor, 0),
        _isMedia: true,
      };
    }

    return {
      metasFiltradas: todas,
      mediaRow,
      envelopeMeta: data.meta,
      isMedia: true,
    };
  }, [data, portfolio, mesSelecionado]);

  return {
    ...result,
    isLoading,
    error: error as Error | null,
  };
}
