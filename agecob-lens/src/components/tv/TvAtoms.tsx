/**
 * Modo TV — átomos compartilhados (tema escuro).
 * Transcrição do design standalone para TSX. Dados reais vêm de useTvData().
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { TV, TONE, TV_MONO, tvBRLk, tvNum, type TvKpi, useTvData } from "./tvShared";
import { isDemoMode } from "@/services/demoMask";

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
        <div style={{ marginTop: 6, fontSize: 16, letterSpacing: "0.18em", textTransform: "uppercase", color: TV.t3 }}>{sub}</div>
      </div>
    </div>
  );
}

export function MetaBar({ pct, color = TV.good, height = 10 }: { pct: number | null; color?: string; height?: number }) {
  const w = pct == null ? 0 : Math.min(pct, 1) * 100;
  return (
    <div style={{ position: "relative", height, background: "rgba(255,255,255,0.06)", borderRadius: height, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, width: w + "%", background: color, borderRadius: height, transition: "width 600ms ease" }} />
    </div>
  );
}

export function DeltaChip({ value, size = 20 }: { value: number | null; size?: number }) {
  if (value == null) return <span style={{ fontSize: size, fontWeight: 700, color: TV.t3, fontVariantNumeric: "tabular-nums" }}>—</span>;
  const up = value >= 0;
  const c = up ? TV.good : TV.bad;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: size, fontWeight: 700, color: c, fontVariantNumeric: "tabular-nums" }}>
      <svg width={size * 0.8} height={size * 0.8} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3">
        {up ? <path d="M7 17L17 7M17 7H9M17 7v8" /> : <path d="M7 7l10 10M17 7v10H7" transform="rotate(90 12 12)" />}
      </svg>
      {up ? "+" : "−"}
      {Math.abs(value * 100).toFixed(1).replace(".", ",")}%
    </span>
  );
}

export function HeroValor({ scale = 1, align = "left" }: { scale?: number; align?: "left" | "center" }) {
  const { valor: v } = useTvData();
  const centered = align === "center";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 * scale, alignItems: centered ? "center" : "stretch", textAlign: align }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: centered ? "center" : "flex-start" }}>
        <Eyebrow color={TV.gold}>Primeira parcela · hoje</Eyebrow>
        <LivePulse label="Parcial" />
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 18, justifyContent: centered ? "center" : "flex-start", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, color: TV.t1, lineHeight: 0.9, fontSize: 150 * scale, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
          {tvBRLk(v.realizado)}
        </span>
        <DeltaChip value={v.vsOntem} size={30 * scale} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 22 * scale, color: TV.t2, justifyContent: centered ? "center" : "flex-start" }}>
        <span>
          Meta do mês <strong style={{ color: TV.t1, fontWeight: 700 }}>{tvBRLk(v.meta)}</strong>
        </span>
        <span style={{ color: TV.t3 }}>·</span>
        <span>
          vs. ontem mesma hora <strong style={{ color: TV.t1, fontWeight: 700 }}>{tvBRLk(v.ontemMesmaHora)}</strong>
        </span>
      </div>

      <div style={{ width: "100%", maxWidth: centered ? 720 * scale : "none" }}>
        <MetaBar pct={v.pctMeta} color={TV.gold} height={14 * scale} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 16 * scale, color: TV.t3 }}>
          <span>{v.pctMeta == null ? "—" : Math.round(v.pctMeta * 100) + "%"} da meta do mês</span>
          <span>faltam {v.meta == null ? "—" : tvBRLk(Math.max(0, v.meta - (v.realizado ?? 0)))}</span>
        </div>
      </div>

      <div
        style={{
          marginTop: 6 * scale,
          display: "inline-flex",
          alignSelf: centered ? "center" : "flex-start",
          alignItems: "center",
          gap: 16,
          padding: `${14 * scale}px ${22 * scale}px`,
          background: "rgba(55,211,154,0.10)",
          border: "1px solid rgba(55,211,154,0.32)",
          borderRadius: 12,
        }}
      >
        <Eyebrow color={TV.good} size={14 * scale} style={{ letterSpacing: "0.18em" }}>
          Projeção de fechamento
        </Eyebrow>
        <span style={{ fontWeight: 800, fontSize: 40 * scale, color: TV.good, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
          {tvBRLk(v.projecao)}
        </span>
        <span style={{ fontSize: 18 * scale, fontWeight: 700, color: TV.good }}>
          {v.projPctMeta == null ? "—" : "+" + Math.round((v.projPctMeta - 1) * 100) + "%"} vs meta
        </span>
      </div>
    </div>
  );
}

export function RitmoStrip() {
  const { ritmo, ritmoAgg, nowHour } = useTvData();
  const max = Math.max(...ritmo.map((d) => Math.max(d.esp ?? 0, d.real ?? 0)), 1);
  const semDados = ritmo.length === 0 || ritmo.every((d) => d.real == null && d.esp == null);
  const ph = (x: number | null) => (x == null ? "—" : x);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <Eyebrow color={TV.cyan} size={22}>
          Ritmo de acordos do dia
        </Eyebrow>
        <div style={{ fontSize: 20, color: TV.t2, fontVariantNumeric: "tabular-nums" }}>
          acum. <strong style={{ color: TV.t1, fontWeight: 700 }}>{ph(ritmoAgg.real)}</strong>
          <span style={{ color: TV.t3 }}> / esp. {ph(ritmoAgg.espAteAgora)}</span>
          <span style={{ color: TV.t3 }}> · </span>
          proj. <strong style={{ color: TV.good, fontWeight: 700 }}>{ph(ritmoAgg.proj)}</strong>
          <span style={{ color: TV.t3 }}> / meta {ph(ritmoAgg.meta)}</span>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 10, position: "relative" }}>
        {semDados && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: TV.t3, textAlign: "center" }}>
            <Eyebrow color={TV.t3} size={18}>
              Ritmo do dia indisponível
            </Eyebrow>
            <span style={{ fontSize: 15, letterSpacing: "0.04em" }}>fora do horário operacional ou sem dados</span>
          </div>
        )}
        {ritmo.map((d) => {
          const has = d.real != null;
          const espH = ((d.esp ?? 0) / max) * 100;
          const realH = has ? ((d.real as number) / max) * 100 : 0;
          const ahead = has && (d.real as number) >= (d.esp ?? 0);
          return (
            <div key={d.h} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%" }}>
              <div style={{ flex: 1, width: "100%", position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                {d.esp != null && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: "19%",
                      width: "62%",
                      height: espH + "%",
                      borderTop: `4px dashed ${TV.cyan}`,
                      borderLeft: `4px dashed ${TV.cyan}`,
                      borderRight: `4px dashed ${TV.cyan}`,
                      borderRadius: "5px 5px 0 0",
                      opacity: 0.9,
                    }}
                  />
                )}
                {has && (
                  <div
                    style={{
                      position: "relative",
                      zIndex: 1,
                      width: "62%",
                      height: realH + "%",
                      background: ahead ? TV.good : TV.bad,
                      borderRadius: "4px 4px 0 0",
                      boxShadow: d.isNow ? `0 0 0 3px ${TV.cyan}` : "none",
                      transition: "height 600ms ease",
                    }}
                  />
                )}
              </div>
              <div style={{ fontSize: 22, fontWeight: has ? 800 : 500, color: d.isNow ? TV.cyan : has ? TV.t1 : TV.t3, fontVariantNumeric: "tabular-nums" }}>
                {has ? d.real : "·"}
              </div>
              <div style={{ fontSize: 19, color: d.isNow ? TV.cyan : TV.t3, fontFamily: TV_MONO, textTransform: "none" }}>{d.h}h</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 28, fontSize: 18, color: TV.t2 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 20, height: 13, background: TV.good, borderRadius: 2, display: "inline-block" }} />real ≥ esperado
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 20, height: 13, background: TV.bad, borderRadius: 2, display: "inline-block" }} />abaixo
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 20, height: 13, border: `3px dashed ${TV.cyan}`, borderBottom: "none", borderRadius: "3px 3px 0 0", display: "inline-block" }} />esperado
        </span>
      </div>
    </div>
  );
}

export function KpiTile({ kpi, big = false }: { kpi: TvKpi; big?: boolean }) {
  const c = TONE[kpi.tone] ?? TV.t1;
  return (
    <div style={{ background: TV.card, border: `1px solid ${TV.line}`, borderRadius: 16, padding: big ? "28px 30px" : "22px 24px", display: "flex", flexDirection: "column", gap: 12, borderTop: `3px solid ${c}` }}>
      <Eyebrow size={18} color={TV.t3}>
        {kpi.label}
      </Eyebrow>
      <div style={{ fontWeight: 800, fontSize: big ? 84 : 60, color: TV.t1, lineHeight: 0.95, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{kpi.value}</div>
      <div style={{ fontSize: 18, color: c, fontWeight: 600 }}>{kpi.sub}</div>
    </div>
  );
}

export function BuPanel() {
  const { bu, buTotal } = useTvData();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
      <Eyebrow color={TV.t3} size={22}>
        Status por unidade de negócio
      </Eyebrow>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, flex: 1 }}>
        {bu.map((b) => {
          const ok = b.pct != null && b.pct >= 0.9;
          const c = b.pct == null ? TV.t3 : ok ? TV.good : b.pct >= 0.6 ? TV.warn : TV.bad;
          const share = buTotal ? Math.round(((b.valor ?? 0) / buTotal) * 100) : 0;
          return (
            <div key={b.bu} style={{ background: TV.card, border: `1px solid ${TV.line}`, borderRadius: 16, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 800, fontSize: 28, letterSpacing: "0.08em", color: TV.t1 }}>{b.bu}</span>
                <span style={{ fontSize: 18, color: TV.t3, fontVariantNumeric: "tabular-nums" }}>{share}% do dia</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontWeight: 800, fontSize: 56, color: TV.t1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{tvBRLk(b.valor)}</span>
                <span style={{ fontSize: 21, color: TV.t2, fontVariantNumeric: "tabular-nums" }}>{tvNum(b.acordos)} acordos</span>
              </div>
              <MetaBar pct={b.pct} color={c} height={12} />
              <div style={{ fontSize: 18, color: c, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {b.pct == null ? "—" : Math.round(b.pct * 100) + "%"} da meta {tvBRLk(b.metaValor)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TICKER_DOT: Record<string, string> = { win: TV.good, up: TV.cyan, alert: TV.bad, info: TV.gold };
export function Ticker() {
  const { ticker } = useTvData();
  const items = [...ticker, ...ticker];
  return (
    <div style={{ height: "100%", background: TV.bg0, borderTop: `1px solid ${TV.line}`, display: "flex", alignItems: "center", overflow: "hidden", position: "relative" }}>
      <div style={{ flexShrink: 0, height: "100%", display: "flex", alignItems: "center", gap: 12, padding: "0 36px", background: TV.gold, color: TV.bg0, fontWeight: 800, fontSize: 24, letterSpacing: "0.16em", textTransform: "uppercase", zIndex: 2 }}>
        Destaques do dia
      </div>
      <div className="tv-ticker-track" style={{ display: "flex", alignItems: "center", whiteSpace: "nowrap" }}>
        {items.map((t, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 16, padding: "0 42px", fontSize: 28, color: TV.t1 }}>
            <span style={{ width: 15, height: 15, borderRadius: "50%", background: TICKER_DOT[t.kind], flexShrink: 0 }} />
            {t.text}
            <span style={{ color: TV.t3, marginLeft: 28 }}>•</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function TvCard({ children, style, pad = 28 }: { children: ReactNode; style?: CSSProperties; pad?: number }) {
  return (
    <div style={{ background: TV.card, border: `1px solid ${TV.line}`, borderRadius: 18, padding: pad, ...style }}>
      {children}
    </div>
  );
}
