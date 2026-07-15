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
import { fetchRitmoDia, fetchPrimeiraParcelaDia } from "@/services/api";
import { countBusinessDays, currentMonthKey, firstOfMonthStr, lastOfMonthStr, todayStr } from "@/lib/dates";
import { DIAS_UTEIS_MES } from "@/lib/metrics";
import {
  tvBRLk,
  tvNum,
  tvPct,
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

  return useMemo<TvModeViewModel>(() => {
    const allKpis = [...home.kpiPrimary, ...home.kpiSecondary];
    const kpiObj = (label: string) => allKpis.find((k) => k.label === label);
    const kpiVal = (label: string): number | null => {
      const k = kpiObj(label);
      return typeof k?.value === "number" ? k.value : null;
    };

    // Hero — 1ª parcela do período (real) vs meta de caixa do mês (real)
    const pp = home.kpiPrimary[1];
    const realizado = typeof pp?.value === "number" ? pp.value : null;
    const metaCaixaMes = metaTotalMes?.meta_caixa ?? null;
    // Projeção da 1ª parcela: run-rate do período extrapolado ao fim do mês (dias úteis).
    const diasDecorridos = countBusinessDays(dateFrom, dateTo);
    const diasMes = countBusinessDays(firstOfMonthStr(), lastOfMonthStr());
    const projecao = realizado != null && diasDecorridos > 0 ? (realizado / diasDecorridos) * diasMes : null;
    // Meta do dia = meta de caixa do mês rateada por dias úteis. % = 1ª parcela
    // gerada HOJE / meta-dia (não o realizado do período, que é mês-até-hoje).
    const metaDia = metaCaixaMes && metaCaixaMes > 0 ? metaCaixaMes / DIAS_UTEIS_MES : null;
    const ppHoje = ppHojeEnv?.data?.[0] ? Number(ppHojeEnv.data[0].total_valor) || 0 : null;
    const valor = {
      realizado,
      meta: metaCaixaMes,
      ontemMesmaHora: pp?.baseline?.baselineValue ?? null,
      vsOntem: pp?.baseline?.value ?? null,
      projecao,
      pctMeta: metaCaixaMes && realizado != null ? realizado / metaCaixaMes : null,
      projPctMeta: metaCaixaMes && projecao != null ? projecao / metaCaixaMes : null,
      metaDia,
      pctMetaDia: metaDia && ppHoje != null ? ppHoje / metaDia : null,
    };

    // KPIs (real, totais do período) — CPC = contatos (count, dicionário oficial)
    const qtdAcordos = kpiVal("Qtd Acordos");
    const cpcCount = kpiVal("CPC");
    const conv = kpiVal("Conversão %");
    const valorAcordos = typeof home.kpiPrimary[0]?.value === "number" ? home.kpiPrimary[0].value : null;
    const ticket = qtdAcordos && qtdAcordos > 0 && valorAcordos != null ? valorAcordos / qtdAcordos : null;
    const kpis: TvKpi[] = [
      { id: "acordos", label: "Acordos", value: tvNum(qtdAcordos), sub: "no período", tone: "neutral" },
      { id: "cpc", label: "CPC", value: tvNum(cpcCount), sub: "contatos (RPC)", tone: "neutral" },
      { id: "conversao", label: "Conversão", value: tvPct(conv), sub: "pagos / CPC", tone: "neutral" },
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
    // Ticker — destaques derivados de dados reais
    const ticker: TvTickerItem[] = [];
    const top = home.top10PrimeiraParcela[0];
    if (top) ticker.push({ kind: "win", text: `${top.label} lidera a 1ª parcela · ${tvBRLk(top.value)}` });
    if (conv != null)
      ticker.push({ kind: "info", text: `Conversão em ${tvPct(conv)} · pagos / CPC` });
    if (buTotal && bu[0]) {
      const share = Math.round(((bu[0].valor ?? 0) / buTotal) * 100);
      ticker.push({ kind: "info", text: `${bu[0].bu} responde por ${share}% da 1ª parcela` });
    }
    if (cpcCount != null) ticker.push({ kind: "info", text: `${tvNum(cpcCount)} contatos (CPC) no período` });
    if (qtdAcordos != null) ticker.push({ kind: "win", text: `${tvNum(qtdAcordos)} acordos · ticket médio ${tvBRLk(ticket)}` });
    if (typeof home.insight?.description === "string" && home.insight.description.trim()) {
      ticker.push({ kind: home.insight.variant === "positive" ? "up" : "alert", text: home.insight.description });
    }
    if (ticker.length === 0) ticker.push({ kind: "info", text: "Aguardando dados do dia" });

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
      placeholders: TV_PLACEHOLDERS,
    };
  }, [home, ritmoResp, metaTotalMes, ppHojeEnv, dateFrom, dateTo]);
}
