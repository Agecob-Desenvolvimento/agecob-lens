/**
 * Modo TV — átomos compartilhados (tema escuro).
 * Transcrição do design standalone para TSX. Dados reais vêm de useTvData().
 */
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { NUM, TV, TONE, TV_MONO, tvBRLk, tvNum, type TvKpi, useTvData } from "./tvShared";
import { isDemoMode } from "@/services/demoMask";
import { useAnimatedFormattedValue } from "@/hooks/useAnimatedFormattedValue";

export function Eyebrow({
  children,
  color = TV.t3,
  size = 20,
  style,
}: {
  children: ReactNode;
  color?: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <div style={{ fontSize: size, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color, ...style }}>
      {children}
    </div>
  );
}

export function TvClock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const dia = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  return (
    <div style={{ textAlign: "right", lineHeight: 1 }}>
      <div style={{ fontFamily: TV_MONO, fontWeight: 700, color: TV.t1, fontSize: compact ? 40 : 54, letterSpacing: "0.02em", fontVariantNumeric: "tabular-nums" }}>
        {hh}:{mm}
        <span style={{ color: TV.t3 }}>:{ss}</span>
      </div>
      <div style={{ marginTop: 8, fontSize: 18, color: TV.t2, textTransform: "capitalize", letterSpacing: "0.04em" }}>{dia}</div>
    </div>
  );
}

export function LivePulse({ label = "Ao vivo" }: { label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span className="tv-pulse" style={{ width: 12, height: 12, borderRadius: "50%", background: TV.good, display: "inline-block" }} />
      <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: TV.t2 }}>{label}</span>
    </div>
  );
}

export function TvBrand({ sub = "Dashboard · Modo TV" }: { sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div style={{ width: 14, height: 44, background: TV.gold, borderRadius: 2 }} />
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 32, letterSpacing: "0.06em", color: TV.t1 }}>{isDemoMode() ? "AGDASH" : "AGECOB"}</div>
        <div style={{ marginTop: 6, fontSize: 16, letterSpacing: "0.18em", textTransform: "uppercase", color: TV.t2 }}>{sub}</div>
      </div>
    </div>
  );
}

/**
 * Barra de meta do dia (§3.1) — bullet graph, não anel: estudo Waldner (IEEE TVCG
 * 2019, n=92) mostra barra linear mais precisa e mais rápida a distância.
 * Fill = realizado · marcador ciano = ritmo esperado · réguas = 25/50/75.
 * O trecho entre o fill e o marcador só acende quando está atrás do ritmo.
 */
export function MetaProgressBar({ pct, pctEsperado, height = 52 }: { pct: number | null; pctEsperado: number | null; height?: number }) {
  const w = pct == null ? 0 : Math.min(pct, 1) * 100;
  const esp = pctEsperado == null ? null : Math.min(pctEsperado, 1) * 100;
  const bateu = pct != null && pct >= 1;
  const atrasado = esp != null && pct != null && pct < pctEsperado! - 0.03;
  const fill = bateu
    ? `linear-gradient(90deg, ${TV.good} 0%, #8fd0a5 100%)`
    : `linear-gradient(90deg, ${TV.goldDeep} 0%, ${TV.gold} 55%, ${TV.goldLight} 100%)`;
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative", height, borderRadius: 12, background: TV.card, border: `1px solid ${TV.lineHi}` }}>
        <div style={{ position: "absolute", inset: 1, borderRadius: 11, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: w + "%",
              background: fill,
              boxShadow: pct != null && pct >= 0.7 ? `0 0 42px ${bateu ? "rgba(121,198,147,0.45)" : "rgba(212,175,90,0.40)"}` : "none",
              transition: "width 600ms ease",
            }}
          />
          {/* mesma métrica e mesmo limiar do chip do hero: as duas superfícies do
              estado "atrás do ritmo" acendem juntas, com o mesmo token (§3.6) */}
          {atrasado && (
            <div style={{ position: "absolute", top: 0, bottom: 0, left: w + "%", width: Math.max(esp! - w, 0) + "%", background: TV.alarmSoft }} />
          )}
          {[25, 50, 75].map((m) => (
            <div key={m} style={{ position: "absolute", top: 0, bottom: 0, left: m + "%", width: 2, background: "rgba(255,255,255,0.26)" }} />
          ))}
        </div>
        {esp != null && (
          <div style={{ position: "absolute", top: -10, bottom: -10, left: esp + "%", width: 4, marginLeft: -2, background: TV.cyan, borderRadius: 2 }} />
        )}
      </div>
      <div style={{ position: "relative", height: 22, marginTop: 8 }}>
        {/* marco a menos de 8pp do marcador é suprimido: os dois rótulos se
            sobrepõem, e quem manda na leitura é o "esperado" */}
        {[25, 50, 75]
          .filter((m) => esp == null || Math.abs(m - esp) >= 8)
          .map((m) => (
            <span key={m} style={{ ...NUM, position: "absolute", left: m + "%", transform: "translateX(-50%)", fontSize: 15, color: TV.t3 }}>
              {m}%
            </span>
          ))}
        {/* no fim do mês o marcador chega perto de 100% e os dois rótulos brigam
            pelo mesmo canto — "Esperado" ganha, porque é ele que muda */}
        {(esp == null || esp < 96) && (
          <span style={{ position: "absolute", right: 0, fontSize: 15, fontWeight: 700, letterSpacing: "0.14em", color: TV.goldText }}>Meta</span>
        )}
        {esp != null && (
          <span
            style={{
              position: "absolute",
              left: esp + "%",
              // perto do fim da barra o rótulo ancora à direita para não invadir "Meta"
              transform: esp >= 88 ? "translateX(-100%)" : "translateX(-50%)",
              marginLeft: esp >= 88 ? -14 : 0,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: TV.cyan,
              whiteSpace: "nowrap",
            }}
          >
            ▲ Esperado
          </span>
        )}
      </div>
    </div>
  );
}

export function DeltaChip({ value, size = 20 }: { value: number | null; size?: number }) {
  if (value == null) return <span style={{ ...NUM, fontSize: size, fontWeight: 700, color: TV.t3 }}>—</span>;
  const up = value >= 0;
  // `bad` só é legível a 3–6 m em ≥48px/700; chip é menor que isso → badText
  const c = up ? TV.good : TV.badText;
  return (
    <span style={{ ...NUM, display: "inline-flex", alignItems: "center", gap: 6, fontSize: size, fontWeight: 700, color: c }}>
      <svg width={size * 0.8} height={size * 0.8} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3">
        {up ? <path d="M7 17L17 7M17 7H9M17 7v8" /> : <path d="M7 7l10 10M17 7v10H7" transform="rotate(90 12 12)" />}
      </svg>
      {up ? "+" : "−"}
      {Math.abs(value * 100).toFixed(1).replace(".", ",")}%
    </span>
  );
}


// Espaço do plot (viewBox). `preserveAspectRatio=none` + non-scaling-stroke:
// preenche o card em qualquer largura sem engordar traço.
// padR reserva o rótulo "◆ META n" à direita da curva esperada (~110px na régua do viewBox)
const WORM = { w: 1000, h: 210, padL: 6, padR: 132, padT: 18, padB: 6 };

/**
 * Ritmo do dia (§3.2) — linhas ACUMULADAS real × esperado, com a área entre elas
 * pintada de verde (à frente) ou rosa (atrás). Substitui as 12 barras por hora com
 * contorno tracejado: a pergunta da TV é de nível ("vamos bater a meta?"), e posição
 * em escala comum é a codificação mais precisa (Cleveland & McGill). Tracejado de
 * 4px é ilegível a 5 m — referência × real se distingue por peso e opacidade.
 */
export function RitmoWorm() {
  const { ritmo, ritmoAgg } = useTvData();
  // ids de <defs> são globais no documento — sem sufixo único, dois worms montados
  // ao mesmo tempo resolveriam o mesmo clip e um pintaria com a curva do outro.
  // useId() devolve ":r0:" — dois-pontos em id atrapalha `url(#…)`; sai fora.
  const uid = useId().replace(/:/g, "");
  const clipId = `wormClip${uid}`;
  const fillId = `wormFill${uid}`;

  let accReal = 0;
  let accEsp = 0;
  let lastReal = -1;
  const pts = ritmo.map((d, i) => {
    accEsp += d.esp ?? 0;
    if (d.real != null) {
      accReal += d.real;
      lastReal = i;
    }
    return { h: d.h, esp: accEsp, real: d.real != null ? accReal : null };
  });

  const semDados = pts.length === 0 || lastReal < 0;
  const maxY = Math.max(accEsp, accReal, ritmoAgg.meta ?? 0, 1) * 1.08;
  const { w: W, h: H, padL, padR, padT, padB } = WORM;
  const xAt = (i: number) => padL + (i * (W - padL - padR)) / Math.max(pts.length - 1, 1);
  const yAt = (v: number) => padT + (1 - v / maxY) * (H - padT - padB);
  const xPct = (i: number) => (xAt(i) / W) * 100;

  const espSeq = pts.map((p, i) => `${xAt(i)},${yAt(p.esp)}`).join(" ");
  const realIdx = pts.map((_, i) => i).filter((i) => i <= lastReal);
  const realSeq = realIdx.map((i) => `${xAt(i)},${yAt(pts[i].real as number)}`).join(" ");
  // banda = curva real (ida) + curva esperada (volta), fechada
  const banda = realIdx.length
    ? `M ${realIdx.map((i) => `${xAt(i)},${yAt(pts[i].real as number)}`).join(" L ")} L ${[...realIdx]
        .reverse()
        .map((i) => `${xAt(i)},${yAt(pts[i].esp)}`)
        .join(" L ")} Z`
    : "";
  // recorte "abaixo da curva real": onde real ≥ esp o verde sobrevive; onde real < esp
  // o recorte remove o verde e a rosa do passe 1 aparece. Sem calcular cruzamentos.
  const sobRealPath = realIdx.length
    ? `M ${xAt(realIdx[0])},${H} L ${realIdx.map((i) => `${xAt(i)},${yAt(pts[i].real as number)}`).join(" L ")} L ${xAt(lastReal)},${H} Z`
    : "";

  const delta = ritmoAgg.real != null && ritmoAgg.espAteAgora != null ? ritmoAgg.real - ritmoAgg.espAteAgora : null;
  const noRitmo = delta == null || Math.abs(delta) <= 2;
  // "em acordos" explícito: o chip do hero fala de caixa (1ª parcela / meta do dia)
  // e pode discordar deste. Sem o qualificador, a tela mostra dois vereditos opostos.
  const pill = noRitmo
    ? { bg: "rgba(238,242,251,0.08)", br: TV.lineHi, fg: TV.t2, txt: delta == null ? "sem dados" : "no ritmo em acordos", seta: "" }
    : delta > 0
      ? { bg: TV.goodSoft, br: TV.good, fg: TV.good, txt: "acima em acordos", seta: "▲" }
      : { bg: TV.badSoft, br: TV.bad, fg: TV.badText, txt: "abaixo em acordos", seta: "▼" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
        <Eyebrow color={TV.cyan} size={22}>
          Ritmo de acordos do dia
        </Eyebrow>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ ...NUM, fontSize: 17, color: TV.t3, whiteSpace: "nowrap" }}>
            proj. <strong style={{ color: TV.t2, fontWeight: 700 }}>{ritmoAgg.proj ?? "—"}</strong> / meta {ritmoAgg.meta ?? "—"}
          </span>
          <span
            style={{
              ...NUM,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 16px",
              borderRadius: 20,
              background: pill.bg,
              border: `1px solid ${pill.br}`,
              color: pill.fg,
              fontSize: 19,
              fontWeight: 700,
              letterSpacing: "0.06em",
              whiteSpace: "nowrap",
            }}
          >
            {pill.seta} {delta != null && !noRitmo ? (delta > 0 ? "+" : "−") + Math.abs(delta) + " " : ""}
            {pill.txt}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {semDados ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, textAlign: "center" }}>
            <Eyebrow color={TV.t3} size={18}>
              Ritmo do dia indisponível
            </Eyebrow>
            <span style={{ fontSize: 15, color: TV.t3small, letterSpacing: "0.04em", textTransform: "none" }}>
              fora do horário operacional ou sem dados
            </span>
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(212,175,90,0.20)" />
                <stop offset="100%" stopColor="rgba(212,175,90,0.02)" />
              </linearGradient>
              <clipPath id={clipId}>
                <path d={sobRealPath} />
              </clipPath>
            </defs>

            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1={0} x2={W} y1={yAt(maxY * g)} y2={yAt(maxY * g)} stroke="rgba(255,255,255,0.05)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {ritmoAgg.meta != null && (
              <line x1={0} x2={W} y1={yAt(ritmoAgg.meta)} y2={yAt(ritmoAgg.meta)} stroke="rgba(212,175,90,0.30)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            )}

            {/* passe 1 pinta a banda inteira de rosa; passe 2 pinta verde só no
                recorte "sob a curva real" (= à frente). O `fill={TV.card}` antes do
                verde apaga a rosa por baixo — sem ele os dois translúcidos somam
                num cinza barrento e o legendado deixa de bater com o desenho. */}
            <path d={banda} fill={TV.bad} fillOpacity={0.3} />
            <g clipPath={`url(#${clipId})`}>
              <path d={banda} fill={TV.card} />
              <path d={banda} fill={TV.good} fillOpacity={0.34} />
            </g>

            <polyline points={espSeq} fill="none" stroke={TV.cyan} strokeOpacity={0.55} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d={sobRealPath} fill={`url(#${fillId})`} />
            <polyline points={realSeq} fill="none" stroke={TV.gold} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

            <line x1={xAt(lastReal)} x2={xAt(lastReal)} y1={0} y2={H} stroke="rgba(255,255,255,0.20)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            <circle cx={xAt(lastReal)} cy={yAt(pts[lastReal].real as number)} r={7} fill={TV.gold} stroke={TV.card} strokeWidth={3} vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        {!semDados && (
          <>
            <span
              style={{
                ...NUM,
                position: "absolute",
                left: xPct(pts.length - 1) + "%",
                top: (yAt(pts[pts.length - 1].esp) / H) * 100 + "%",
                transform: "translate(10px, -50%)",
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: "0.10em",
                color: TV.goldText,
                whiteSpace: "nowrap",
              }}
            >
              ◆ Meta {ritmoAgg.meta ?? ""}
            </span>
            <span
              style={{
                ...NUM,
                position: "absolute",
                left: xPct(lastReal) + "%",
                top: (yAt(pts[lastReal].real as number) / H) * 100 + "%",
                transform: "translate(-50%, -32px)",
                fontSize: 22,
                fontWeight: 800,
                color: TV.t1,
                whiteSpace: "nowrap",
              }}
            >
              {pts[lastReal].real}
            </span>
          </>
        )}
      </div>

      <div style={{ position: "relative", height: 20, flexShrink: 0 }}>
        {pts.map((p, i) => (
          <span
            key={p.h}
            style={{
              position: "absolute",
              left: xPct(i) + "%",
              transform: "translateX(-50%)",
              fontFamily: TV_MONO,
              fontSize: 16,
              color: i === lastReal ? TV.t1 : TV.t3,
              fontWeight: i === lastReal ? 700 : 400,
              textTransform: "none",
            }}
          >
            {p.h}h
          </span>
        ))}
      </div>

      <div style={{ display: "flex", gap: 24, fontSize: 15, color: TV.t3, flexShrink: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 18, height: 5, background: TV.gold, borderRadius: 3, display: "inline-block" }} />acumulado real
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 18, height: 3, background: TV.cyan, opacity: 0.55, borderRadius: 3, display: "inline-block" }} />esperado
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 18, height: 12, background: TV.good, opacity: 0.34, borderRadius: 2, display: "inline-block" }} />à frente
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 18, height: 12, background: TV.bad, opacity: 0.3, borderRadius: 2, display: "inline-block" }} />atrás
        </span>
      </div>
    </div>
  );
}

/** Chip de variação vs a referência do KPI. Dentro de ±3% o estado é neutro e some. */
function KpiDelta({ delta }: { delta: NonNullable<TvKpi["delta"]> }) {
  // `pct` vem em fração (-0.085 = −8,5%), mesma convenção do DeltaChip
  const pp = delta.pct * 100;
  if (delta.betterWhen === "flat" || Math.abs(pp) < 3) return null;
  const bom = delta.betterWhen === "up" ? delta.pct > 0 : delta.pct < 0;
  const cor = bom ? TV.good : TV.badText;
  const fundo = bom ? TV.goodSoft : TV.badSoft;
  const borda = bom ? "rgba(121,198,147,0.35)" : "rgba(224,117,106,0.35)";
  return (
    <span style={{ ...NUM, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, background: fundo, border: `1px solid ${borda}`, color: cor, fontSize: 18, fontWeight: 700 }}>
      {pp > 0 ? "▲" : "▼"} {Math.abs(pp).toFixed(0)}%
    </span>
  );
}

export function KpiTile({ kpi }: { kpi: TvKpi }) {
  const c = TONE[kpi.tone] ?? TV.t1;
  const animatedValue = useAnimatedFormattedValue(kpi.value);
  return (
    // line-height explícito nos rótulos: com `justifyContent: center` o conteúdo
    // que não cabe come o padding em vez de transbordar, e a tile fica sem respiro.
    <div style={{ background: TV.card, borderRadius: 16, padding: "18px 26px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, minHeight: 0 }}>
      <Eyebrow size={18} color={TV.t1} style={{ whiteSpace: "nowrap", lineHeight: 1.2 }}>
        {kpi.label}
      </Eyebrow>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
        <div style={{ ...NUM, fontWeight: 800, fontSize: 64, color: TV.t1, lineHeight: 0.95, letterSpacing: "-0.02em" }}>{animatedValue}</div>
        {kpi.delta && <KpiDelta delta={kpi.delta} />}
      </div>
      <div style={{ fontSize: 19, color: c, fontWeight: 600, whiteSpace: "nowrap", lineHeight: 1.2 }}>
        {kpi.baseline ? [kpi.baseline.label, kpi.baseline.value].filter(Boolean).join(" ") : kpi.sub}
      </div>
    </div>
  );
}

// `up` e `alert` são estado → nunca cyan (cyan = dado/"esperado"); `info` é neutro
const TICKER_COR: Record<string, string> = { win: TV.good, up: TV.good, alert: TV.badText, info: TV.goldText };
/** ms por item. Frase longa ganha folga — ninguém relê o que já saiu. */
const TICKER_HOLD = 8000;
/**
 * Rodapé paginado (§3.3) — um destaque por vez, 8s cada. Substitui o letreiro
 * rolante: texto em movimento contínuo corta frase no meio e não permite reler
 * (a própria ESPN aposentou o crawl em 2018 pelo mesmo motivo). Também some a
 * violação de WCAG 2.2.2 (movimento contínuo acima de 5s sem controle).
 */
export function Ticker() {
  const { ticker } = useTvData();
  const total = ticker.length;
  const [i, setI] = useState(0);

  useEffect(() => {
    if (total < 2) return;
    const id = setInterval(() => setI((v) => (v + 1) % total), TICKER_HOLD);
    return () => clearInterval(id);
  }, [total]);

  // lista encurtou entre renders (troca de filtro) — evita índice órfão
  const idx = total ? i % total : 0;
  const item = ticker[idx];
  if (!item) return <div style={{ height: "100%", background: TV.bg0, borderTop: `1px solid ${TV.line}` }} />;

  return (
    <div style={{ height: "100%", background: TV.bg0, borderTop: `1px solid ${TV.line}`, display: "flex", alignItems: "center", gap: 32, position: "relative", padding: "0 80px", overflow: "hidden" }}>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", padding: "9px 24px", borderRadius: 999, border: `1px solid rgba(212,175,90,0.35)`, color: TV.goldText, fontWeight: 700, fontSize: 19, letterSpacing: "0.16em", textTransform: "uppercase" }}>
        Destaques do dia
      </div>

      {/* key={idx} reinicia a animação de entrada a cada troca */}
      {/* a key inclui o conteúdo: refetch que troca o item mantendo o tamanho da
          lista precisa reiniciar entrada e barra, senão a frase nova aparece com o
          contador do item antigo prestes a virar */}
      <div key={`${idx}-${item.chip}-${item.frase}`} className="tv-ticker-in" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 18, overflow: "hidden" }}>
        <span style={{ flexShrink: 0, fontSize: 19, fontWeight: 700, letterSpacing: "0.14em", color: TV.goldText, textTransform: "uppercase" }}>{item.chip}</span>
        <span style={{ fontSize: 30, color: TV.t1, textTransform: "none", whiteSpace: "nowrap" }}>{item.frase}</span>
        {item.valor && (
          <span style={{ ...NUM, flexShrink: 0, fontSize: 34, fontWeight: 800, color: TICKER_COR[item.kind] ?? TV.t1 }}>{item.valor}</span>
        )}
      </div>

      {total > 1 && (
        <span style={{ ...NUM, flexShrink: 0, fontFamily: TV_MONO, fontSize: 18, color: TV.t3 }}>
          {idx + 1}/{total}
        </span>
      )}
      {/* progresso do item atual: substitui o movimento contínuo por um único
          elemento animado, previsível e reiniciado a cada troca */}
      {total > 1 && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: "rgba(255,255,255,0.07)" }}>
          <div key={`${idx}-${item.chip}`} className="tv-ticker-hold" style={{ height: "100%", background: TV.gold }} />
        </div>
      )}
    </div>
  );
}

export function TvCard({ children, style, pad = 28 }: { children: ReactNode; style?: CSSProperties; pad?: number }) {
  return (
    <div style={{ background: TV.card, borderRadius: 18, padding: pad, ...style }}>
      {children}
    </div>
  );
}
