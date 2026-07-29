/**
 * Modo TV ViewModel — adapta o data layer real (useHomeViewModel + /ritmo-dia)
 * para o shape consumido pelos componentes do Modo TV.
 *
 * Real: 1ª parcela do dia, KPIs (acordos/CPC/conversão/ticket), ritmo horário
 * de acordos (esperado vs real + projeção), 1ª parcela e acordos por unidade,
 * destaques do ticker.
 * Placeholder ("—"): metas diárias de 1ª parcela (sem endpoint) — ver `placeholders`.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { useHomeViewModel } from "@/hooks/useHomeViewModel";
import { useMetasData } from "@/hooks/useMetasData";
import { useProdutividadeData } from "@/hooks/useProdutividadeData";
import { fetchRitmoDia, fetchPrimeiraParcelaDia } from "@/services/api";
import { currentMonthKey, isBusinessDay, previousBusinessDayStr, todayStr } from "@/lib/dates";
import { DIAS_UTEIS_MES, calcConversao } from "@/lib/metrics";
import {
  tvBRLk,
  tvNum,
  tvPct,
  type TvAgenteRow,
  type TvBu,
  type TvKpi,
  type TvModeViewModel,
  type TvRitmoBanda,
  type TvTickerItem,
} from "@/components/tv/tvShared";

const TV_PLACEHOLDERS = [
  "Meta da 1ª parcela = meta de CAIXA do mês (PDF trimestral, soma office de /dashboard/metas). Mensal e da carteira inteira, sem split por BU — atingimento mais fiel com filtro “Todas”.",
  "Projeção de 1ª parcela = run-rate do período extrapolado por dias úteis ao fim do mês (não é um endpoint de projeção).",
  "Meta de 1ª parcela por unidade de negócio — TV_BU.metaValor / % (metas do PDF não têm dimensão BU).",
  "“Ontem mesma hora” = 1ª parcela do período anterior (aproximação, não a mesma hora literal).",
];

export function useTvModeViewModel(): TvModeViewModel {
  const { selectedDatabase, dateFrom, dateTo } = useGlobalFilters();
  const home = useHomeViewModel();

  // Agentes do período — mesma fonte do "Heatmap de Performance" (detalhamento),
  // consumido pelo Modo TV Operacional.
  const { rows: agentesRows } = useProdutividadeData(selectedDatabase, { dateFrom, dateTo });

  const { data: ritmoResp } = useQuery({
    queryKey: ["tv", "ritmo-dia", selectedDatabase] as const,
    queryFn: () => fetchRitmoDia(selectedDatabase),
  });

  // Meta de caixa do mês corrente — soma office de todos os portfólios (canônico via
  // useMetasData; o PDF trimestral é o único alvo real). Metas não têm dimensão BU,
  // então o atingimento é mais fiel com o filtro "Todas".
  const { mediaRow: metaTotalMes } = useMetasData(null, currentMonthKey());

  // 1ª parcela gerada HOJE (sempre o dia, independe do filtro global período) —
  // numerador da meta do dia. O `realizado` do hero é do período (mês-até-hoje).
  const { data: ppHojeEnv } = useQuery({
    queryKey: ["tv", "pp-dia-hoje", selectedDatabase, todayStr()] as const,
    queryFn: () => fetchPrimeiraParcelaDia(selectedDatabase, undefined, todayStr(), todayStr()),
  });

  // Dia útil anterior fechado — base do "vs ontem" do placar do dia. Mesmo endpoint,
  // só muda a data; fica em cache separado porque a chave inclui o dia.
  const { data: ppOntemEnv } = useQuery({
    queryKey: ["tv", "pp-dia-ontem", selectedDatabase, previousBusinessDayStr()] as const,
    queryFn: () => {
      const d = previousBusinessDayStr();
      return fetchPrimeiraParcelaDia(selectedDatabase, undefined, d, d);
    },
  });

  // Valor de acordos gerados HOJE — mesma métrica do KPI primário da Home
  // (VALOR_TOTAL_ACORDO). NÃO usar /acordos-por-portfolio: aquele endpoint filtra
  // PARCELA = 0, então o "valor_acordos" dele é a 1ª parcela — o mesmo dinheiro
  // que já está na coluna do meio, com outro rótulo.
  const { rows: agentesHoje } = useProdutividadeData(selectedDatabase, { dateFrom: todayStr(), dateTo: todayStr() });

  return useMemo<TvModeViewModel>(() => {
    const allKpis = [...home.kpiPrimary, ...home.kpiSecondary];
    const kpiObj = (label: string) => allKpis.find((k) => k.label === label);
    const kpiVal = (label: string): number | null => {
      const k = kpiObj(label);
      return typeof k?.value === "number" ? k.value : null;
    };

    // Meta do dia = meta de caixa do mês (PDF trimestral) rateada por dias úteis.
    const metaCaixaMes = metaTotalMes?.meta_caixa ?? null;
    const metaDia = metaCaixaMes && metaCaixaMes > 0 ? metaCaixaMes / DIAS_UTEIS_MES : null;
    const ppHoje = ppHojeEnv?.data?.[0] ? Number(ppHojeEnv.data[0].total_valor) || 0 : null;

    // Ritmo esperado do DIA: fração da janela operacional 8h–19h já decorrida.
    // Fora de dia útil não há ritmo a comparar — marcador omitido (estado neutro).
    const agora = new Date();
    const fracDoDia = Math.min(Math.max((agora.getHours() + agora.getMinutes() / 60 - 8) / 11, 0), 1);
    const pctEsperado = isBusinessDay(agora) ? fracDoDia : null;

    const ppOntem = ppOntemEnv?.data?.[0] ? Number(ppOntemEnv.data[0].total_valor) || 0 : null;
    const valorAcordosDia = agentesHoje.length
      ? agentesHoje.reduce((s, r) => s + (Number(r.valor_acordos) || 0), 0)
      : null;
    const qtdAcordosDia = agentesHoje.length
      ? agentesHoje.reduce((s, r) => s + (Number(r.qtd_acordos) || 0), 0)
      : null;
    const valor = {
      metaDia,
      realizadoDia: ppHoje,
      valorAcordosDia,
      qtdAcordosDia,
      ontemDia: ppOntem,
      // hoje é parcial; comparar com o dia anterior FECHADO daria ▼80% às 10h por
      // construção. A base é reduzida à mesma fração da janela já decorrida.
      vsOntemDia:
        ppOntem && ppOntem > 0 && ppHoje != null && fracDoDia > 0
          ? ppHoje / (ppOntem * fracDoDia) - 1
          : null,
      pctMetaDia: metaDia && ppHoje != null ? ppHoje / metaDia : null,
      pctEsperado,
    };

    // KPIs (real, totais do período) — CPC = contatos (count, dicionário oficial)
    const qtdAcordos = kpiVal("Qtd Acordos");
    const cpcCount = kpiVal("CPC");
    const conv = kpiVal("Conversão %");
    const valorAcordos = typeof home.kpiPrimary[0]?.value === "number" ? home.kpiPrimary[0].value : null;
    const ticket = qtdAcordos && qtdAcordos > 0 && valorAcordos != null ? valorAcordos / qtdAcordos : null;
    // Referência do KPI — reaproveita o baseline que a Home já calcula (média do
    // escritório / período anterior). Sem baseline no payload, a tile omite a linha
    // em vez de mostrar placeholder.
    const refDe = (label: string, fmt: (v: number) => string): Pick<TvKpi, "baseline" | "delta"> => {
      const k = kpiObj(label);
      const b = k && "baseline" in k ? k.baseline : undefined;
      if (!b) return {};
      // o rótulo sempre acompanha: chip de variação sem referência visível é
      // número solto — exatamente o que a linha de baseline existe para evitar
      return {
        baseline: { label: b.label, value: b.baselineValue != null ? fmt(b.baselineValue) : undefined },
        delta: { pct: b.value, betterWhen: b.betterWhen },
      };
    };
    const kpis: TvKpi[] = [
      { id: "acordos", label: "Acordos", value: tvNum(qtdAcordos), sub: "no período", tone: "neutral", ...refDe("Qtd Acordos", tvNum) },
      { id: "cpc", label: "CPC", value: tvNum(cpcCount), sub: "contatos (RPC)", tone: "neutral", ...refDe("CPC", tvNum) },
      { id: "conversao", label: "Conversão", value: tvPct(conv), sub: "acordos / CPC", tone: "neutral", ...refDe("Conversão %", tvPct) },
      { id: "ticket", label: "Ticket médio", value: tvBRLk(ticket), sub: `${tvNum(qtdAcordos)} acordos`, tone: "neutral" },
    ];

    // BU — 1ª parcela (real) + qtd acordos do funil (real); metas sem fonte
    const funnelByBu = new Map(home.funnelData.map((f) => [f.bu, f]));
    const bu: TvBu[] = home.financeiroData.map((d) => ({
      bu: d.bu,
      valor: d.primeiraParcela ?? null,
      acordos: funnelByBu.get(d.bu)?.acordos ?? null,
      metaValor: null,
      pct: null,
    }));
    const buTotal = bu.reduce((s, b) => s + (b.valor ?? 0), 0);

    // Ritmo horário de acordos (real, /ritmo-dia)
    const bandas = ritmoResp?.data.bandas ?? [];
    const ritmo: TvRitmoBanda[] = bandas.map((b) => ({
      h: b.hora,
      esp: b.esperado,
      real: b.real,
      isNow: b.status === "em_andamento",
    }));
    // só horas fechadas — alinha com acumulado_atual (backend exclui a hora em andamento)
    const espAteAgora = bandas
      .filter((b) => b.status !== "futuro" && b.status !== "em_andamento")
      .reduce((s, b) => s + b.esperado, 0);
    // meta.em_operacao=false (fora 8h-19h ou fds) → backend retorna acumulado_atual
    // stub (0), não dado real. Sem essa checagem a URA anunciaria "0 acordos".
    const emOperacao = ritmoResp?.meta.em_operacao ?? false;
    const ritmoAgg = {
      real: emOperacao ? ritmoResp?.data.acumulado_atual ?? null : null,
      espAteAgora: emOperacao && bandas.length ? espAteAgora : null,
      proj: emOperacao ? ritmoResp?.data.projecao_fechamento ?? null : null,
      meta: emOperacao ? ritmoResp?.data.esperado_total ?? null : null,
    };
    // Ticker — destaques derivados de dados reais. Cada item é [chip · frase · valor]:
    // o rodapé pagina um por vez, então a frase precisa caber sozinha na tela.
    const ticker: TvTickerItem[] = [];
    const top = home.top10PrimeiraParcela[0];
    if (top) ticker.push({ kind: "win", chip: "Líder do dia", frase: `${top.label} na 1ª parcela`, valor: tvBRLk(top.value) });
    if (conv != null) ticker.push({ kind: "info", chip: "Conversão", frase: "acordos sobre CPC no período", valor: tvPct(conv) });
    if (buTotal && bu[0]) {
      const share = Math.round(((bu[0].valor ?? 0) / buTotal) * 100);
      // `bu` vem de home.financeiroData — escopo do filtro global, não do dia
      ticker.push({ kind: "info", chip: bu[0].bu, frase: "da 1ª parcela do período", valor: `${share}%` });
    }
    if (cpcCount != null) ticker.push({ kind: "info", chip: "CPC", frase: "contatos com a pessoa certa", valor: tvNum(cpcCount) });
    if (qtdAcordos != null) ticker.push({ kind: "win", chip: "Acordos", frase: `${tvNum(qtdAcordos)} no período · ticket médio`, valor: tvBRLk(ticket) });
    if (typeof home.insight?.description === "string" && home.insight.description.trim()) {
      const positivo = home.insight.variant === "positive";
      // teto no builder, não com ellipsis no CSS: o rodapé pagina uma frase por vez
      // e cortar no meio é justamente o que motivou aposentar o letreiro rolante
      const d = home.insight.description.trim();
      ticker.push({ kind: positivo ? "up" : "alert", chip: positivo ? "Destaque" : "Atenção", frase: d.length > 88 ? d.slice(0, 85).trimEnd() + "…" : d });
    }
    if (ticker.length === 0) ticker.push({ kind: "info", chip: "Aguardando", frase: "sem dados do dia até agora" });

    // Agentes (Modo TV Operacional) — conversão via métrica canônica (acordos / CPC)
    const agentes: TvAgenteRow[] = agentesRows.map((r) => ({
      id: r.CHAVE,
      nome: r.NOME,
      login: r.CHAVE,
      acion: r.qtd_acionamentos,
      contato: r.qtd_alo,
      cpc: r.qtd_contatos,
      conv: calcConversao({ qtd_acordos: r.qtd_acordos, qtd_contatos: r.qtd_contatos }),
      acordos: r.qtd_acordos,
      vlrAcordos: Number(r.valor_acordos || 0),
      parc1: Number(r.valor_primeira_parcela || 0),
    }));

    return {
      loading: home.loading,
      valor,
      kpis,
      bu,
      buTotal,
      ritmo,
      ritmoAgg,
      ticker,
      topAgentes: home.top10PrimeiraParcela.slice(0, 3),
      agentes,
      placeholders: TV_PLACEHOLDERS,
    };
  }, [home, ritmoResp, metaTotalMes, ppHojeEnv, ppOntemEnv, agentesHoje, agentesRows]);
}
