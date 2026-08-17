/**
 * Modo TV — paleta escura, formatadores e tipos compartilhados.
 * Transcrição fiel do design standalone (canvas 1920×1080, caixa alta).
 * Estilos inline preservam a régua de tamanhos em px do broadcast.
 */
import { createContext, useContext } from "react";

/**
 * Paleta travada por auditoria APCA (Lc medido sobre `card`/`bg0`) — ver
 * docs/spec-modo-tv.md §1. Regra de uso por tamanho, porque a tela é lida a 3–6 m:
 * (caminho relativo a agecob-lens/)
 *   texto < 48px regular  → só Lc ≥ 75: t1, t2, t3small, goldText, badText, alarmText
 *   texto ≥ 28px e ≥ 600  → Lc ≥ 60 liberado: t3, good, warn, gold
 *   texto ≥ 48px/700      → Lc ≥ 45 liberado: bad
 * `hairline` é o antigo t3 (Lc 23): régua/divisor, nunca texto.
 */
export const TV = {
  bg0: "#060912",
  bg1: "#0a1020",
  card: "#0e1730",
  cardHi: "#122046",
  /** divisor interno — nunca borda de card (hierarquia vem de degrau de fundo) */
  line: "rgba(255,255,255,0.07)",
  /** único uso: border interno do track da barra de meta */
  lineHi: "rgba(255,255,255,0.14)",
  t1: "#eef2fb",
  t2: "#c9d0df",
  t3: "#afb6c7",
  t3small: "#ccd0db",
  hairline: "#5d6886",
  /** identidade; nunca carrega estado (convenção Bloomberg) — só ≥ 48px/600+ ou fills */
  gold: "#d4af5a",
  goldText: "#e4ce99",
  goldLight: "#f0d68c",
  goldDeep: "#9a7a35",
  /** dado/"esperado" apenas — estados nunca usam cyan */
  cyan: "#5cd0e8",
  good: "#79c693",
  warn: "#e7aa6c",
  bad: "#e0756a",
  badText: "#eba59e",
  /** único saturado do sistema: exclusivo de "atrás do ritmo"; nunca texto */
  alarm: "#ff4d42",
  alarmText: "#ff9b94",
  goodSoft: "rgba(121,198,147,0.14)",
  warnSoft: "rgba(231,170,108,0.14)",
  badSoft: "rgba(224,117,106,0.14)",
  alarmSoft: "rgba(255,77,66,0.12)",
} as const;

/** Fundo do canvas: luz direcional dourada no topo, sem grain (moiré em painel barato). */
export const TV_BG =
  "radial-gradient(ellipse 55% 38% at 50% -8%, rgba(212,175,90,0.14), transparent 70%)," +
  "radial-gradient(ellipse 90% 70% at 50% 120%, rgba(4,6,12,0.9), transparent)," +
  "linear-gradient(180deg, #0a1020 0%, #060912 100%)";

export type TvTone = "good" | "warn" | "bad" | "neutral";

// TONE só alimenta texto pequeno (sub-label de KpiTile) → `bad` entra na variante clara
export const TONE: Record<TvTone, string> = {
  good: TV.good,
  warn: TV.warn,
  bad: TV.badText,
  neutral: TV.t1,
};

export const TV_SANS = "'Inter', system-ui, sans-serif";
export const TV_MONO = "'JetBrains Mono', ui-monospace, monospace";

/** Numerais: tabular para a coluna não dançar a cada refresh. */
export const NUM = {
  fontVariantNumeric: "tabular-nums",
} as const;

/**
 * Unidades fluidas do Modo TV.
 *
 * O design foi desenhado em px sobre 1920×1080. Isso é a PROPORÇÃO de referência,
 * não uma resolução alvo: cada medida vira % do viewport real, então o layout se
 * recompõe em qualquer tela em vez de ser um bloco escalado por `transform`.
 *
 * `tvW` mede largura, `tvH` mede altura, `tvF` mede fonte. A fonte pega o MENOR
 * dos dois eixos, então numa janela larga e baixa o texto segue a altura (não
 * estoura a linha) e numa alta e estreita segue a largura (não estoura a coluna),
 * e o `clamp()` prende esse valor entre um piso e um teto.
 *
 * Só a FONTE leva `clamp`. Largura, altura, gap e padding ficam proporcionais
 * puros de propósito: numa faixa de grid a soma das partes tem que continuar
 * fechando 100% e, se uma medida trava no piso enquanto a vizinha continua
 * encolhendo, a soma estoura e volta o overflow que a mudança quer eliminar.
 */
const proporcao = (px: number, base: number) => ((px / base) * 100).toFixed(3);
/** Piso: abaixo de 0,55× o rótulo fica ilegível numa janela pequena.
 *  Teto: acima de 2,5× o número passa a brigar com a célula em telas enormes
 *  (4K entra inteiro em 2×, então o teto só age de 5K/8K em diante). */
const FONTE_PISO = 0.55;
const FONTE_TETO = 2.5;
export const tvW = (px: number) => `${proporcao(px, 1920)}vw`;
export const tvH = (px: number) => `${proporcao(px, 1080)}vh`;
export const tvF = (px: number) =>
  `clamp(${(px * FONTE_PISO).toFixed(2)}px, min(${proporcao(px, 1080)}vh, ${proporcao(px, 1920)}vw), ${(px * FONTE_TETO).toFixed(2)}px)`;

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

/** Compacto para o hero: acima de 1 mi vira "R$ 1,61 mi" — "R$ 1610,5k" é largo demais. */
export const tvBRLc = (v: number | null | undefined): string => {
  if (v == null) return "—";
  if (Math.abs(v) >= 1_000_000) return "R$ " + (v / 1_000_000).toFixed(2).replace(".", ",") + " mi";
  return tvBRLk(v);
};

export const tvNum = (v: number | null | undefined): string =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR").format(v);

export const tvPct = (v: number | null | undefined): string =>
  v == null ? "—" : v.toFixed(1).replace(".", ",") + "%";

// ---------- Tipos do ViewModel do Modo TV ----------
/** Placar do dia. Tudo aqui é do DIA corrente, não do período do filtro global. */
export interface TvHeroValor {
  /** meta diária = meta de caixa do mês / dias úteis do mês */
  metaDia: number | null;
  /** 1ª parcela gerada HOJE (numerador do placar do dia) */
  realizadoDia: number | null;
  /** valor de acordos gerados HOJE (mesma métrica do KPI primário da Home) */
  valorAcordosDia: number | null;
  /** qtd de acordos gerados HOJE */
  qtdAcordosDia: number | null;
  /** valor em exceção (ID_REC_STATUS=5, "Exceção" no negócio) gerado HOJE */
  excecoesValorDia: number | null;
  /** qtd de acordos em exceção gerados HOJE */
  excecoesQtdDia: number | null;
  /** 1ª parcela dos acordos em exceção gerados HOJE (fatia da entrada) */
  excecoesPrimeiraParcelaDia: number | null;
  /** 1ª parcela dos acordos rejeitados (ID_REC_STATUS=7) emitidos HOJE */
  rejeitadosPrimeiraParcelaDia: number | null;
  /** qtd de acordos rejeitados HOJE */
  rejeitadosQtdDia: number | null;
  /** 1ª parcela do dia útil anterior (fechado) */
  ontemDia: number | null;
  /** delta fracionário do dia vs dia útil anterior */
  vsOntemDia: number | null;
  /** realizadoDia / metaDia */
  pctMetaDia: number | null;
  /**
   * Ritmo esperado do DIA: fração da janela operacional 8h–19h já decorrida.
   * `null` fora de dia útil — aí não há ritmo a comparar.
   */
  pctEsperado: number | null;
}

export interface TvKpi {
  id: string;
  label: string;
  value: string;
  sub: string;
  tone: TvTone;
  /** referência do indicador (ex.: "média do escritório" + "9,1%") — omitido quando não há */
  baseline?: { label: string; value?: string };
  /** variação vs a referência em FRAÇÃO (-0.085 = −8,5%); `betterWhen` diz se subir é bom */
  delta?: { pct: number; betterWhen: "up" | "down" | "flat" };
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
  /** mesmo agregado, em R$ (valor de acordos) — espelha Home/RitmoDiaCard */
  valorReal: number | null;
  valorEspAteAgora: number | null;
  valorProj: number | null;
  valorMeta: number | null;
}

export type TvTickerKind = "win" | "up" | "alert" | "info";
/**
 * Item do rodapé. Estruturado (não uma frase pronta) porque o rodapé virou um
 * rotator paginado: o número precisa de cor e corpo próprios, e a frase fica em
 * caixa normal — prosa em movimento é o pior caso para caixa alta.
 */
export interface TvTickerItem {
  kind: TvTickerKind;
  /** rótulo curto da categoria (caixa alta, dourado) */
  chip: string;
  /** frase em caixa normal */
  frase: string;
  /** número em destaque, colorido pelo `kind` */
  valor?: string;
}

export interface TvTopAgente {
  label: string;
  value: number;
}

/** Linha de agente do Modo TV Operacional (heatmap por agente). */
export interface TvAgenteRow {
  id: string;
  nome: string;
  /** matrícula (sub-rótulo abaixo do nome) */
  login: string;
  /** acionamentos */
  acion: number;
  /** CPC = contato com a pessoa certa (RPC), qtd_contatos */
  cpc: number;
  /** conversão % */
  conv: number;
  acordos: number;
  vlrAcordos: number;
  /** 1ª parcela */
  parc1: number;
}

export interface TvModeViewModel {
  loading: boolean;
  valor: TvHeroValor;
  kpis: TvKpi[];
  bu: TvBu[];
  buTotal: number;
  ritmo: TvRitmoBanda[];
  ritmoAgg: TvRitmoAgg;
  ticker: TvTickerItem[];
  /** top 3 agentes do dia por 1ª parcela — usado no boletim horário da URA */
  topAgentes: TvTopAgente[];
  /** agentes do período — consumido pelo Modo TV Operacional (heatmap) */
  agentes: TvAgenteRow[];
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
