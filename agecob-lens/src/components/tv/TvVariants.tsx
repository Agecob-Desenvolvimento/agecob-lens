/**
 * Modo TV — 3 variantes de layout (1920×1080). Transcrição do design standalone.
 */
import type { ReactNode } from "react";
import { TV, tvBRLk, tvNum, type TvBu, useTvData } from "./tvShared";
import { BuPanel, DeltaChip, Eyebrow, HeroValor, KpiTile, LivePulse, MetaBar, RitmoStrip, Ticker, TvBrand, TvCard, TvClock } from "./TvAtoms";

function TvScreen({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        background: `radial-gradient(120% 90% at 80% -10%, ${TV.petrol} 0%, ${TV.bg1} 45%, ${TV.bg0} 100%)`,
        color: TV.t1,
        fontFamily: "'Inter', system-ui, sans-serif",
        textTransform: "uppercase",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {children}
    </div>
  );
}

export function TopBar({ sub }: { sub: string }) {
  return (
    <div style={{ flexShrink: 0, height: 110, padding: "0 56px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${TV.line}` }}>
      <TvBrand sub={sub} />
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <LivePulse />
        <TvClock />
      </div>
    </div>
  );
}

function BuMini({ b, align }: { b: TvBu; align: "left" | "right" }) {
  const ok = b.pct != null && b.pct >= 0.9;
  const c = b.pct == null ? TV.t3 : ok ? TV.good : b.pct >= 0.6 ? TV.warn : TV.bad;
  return (
    <div style={{ textAlign: align, display: "flex", flexDirection: "column", gap: 12, alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      <span style={{ fontWeight: 800, fontSize: 26, letterSpacing: "0.1em", color: TV.t2 }}>{b.bu}</span>
      <span style={{ fontWeight: 800, fontSize: 64, color: TV.t1, lineHeight: 0.9, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{tvBRLk(b.valor)}</span>
      <span style={{ fontSize: 18, color: TV.t2, fontVariantNumeric: "tabular-nums" }}>{tvNum(b.acordos)} acordos</span>
      <div style={{ width: 240, maxWidth: "100%" }}>
        <MetaBar pct={b.pct} color={c} height={9} />
      </div>
      <span style={{ fontSize: 15, color: c, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{b.pct == null ? "—" : Math.round(b.pct * 100) + "%"} da meta</span>
    </div>
  );
}

// A — Hero Central
export function VariantHeroCentral() {
  const { kpis } = useTvData();
  return (
    <TvScreen>
      <TopBar sub="Ritmo de Acordos · Modo TV" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "40px 56px 28px", gap: 32, minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 48 }}>
          <HeroValor scale={1} />
          <div style={{ width: 360, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            {kpis.slice(0, 2).map((k) => (
              <KpiTile key={k.id} kpi={k} />
            ))}
          </div>
        </div>
        <TvCard style={{ flex: 1, minHeight: 0 }} pad={30}>
          <RitmoStrip />
        </TvCard>
      </div>
      <div style={{ flexShrink: 0, height: 96 }}>
        <Ticker />
      </div>
    </TvScreen>
  );
}

// B — Centro de Comando
export function VariantSplitCommand() {
  const { kpis } = useTvData();
  return (
    <TvScreen>
      <TopBar sub="Centro de Comando · Modo TV" />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, padding: "36px 56px 28px", minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24, minHeight: 0 }}>
          <TvCard pad={36} style={{ background: TV.cardHi, borderColor: TV.lineHi }}>
            <HeroValor scale={0.82} />
          </TvCard>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, flex: 1 }}>
            {kpis.map((k) => (
              <KpiTile key={k.id} kpi={k} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24, minHeight: 0 }}>
          <TvCard style={{ flex: 1.3, minHeight: 0 }} pad={30}>
            <RitmoStrip />
          </TvCard>
          <div style={{ flex: 1, minHeight: 0 }}>
            <BuPanel />
          </div>
        </div>
      </div>
      <div style={{ flexShrink: 0, height: 96 }}>
        <Ticker />
      </div>
    </TvScreen>
  );
}

// C — Placar do Dia
export function VariantScoreboard() {
  const { valor: v, kpis, bu } = useTvData();
  return (
    <TvScreen>
      <TopBar sub="Placar do Dia · Modo TV" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "44px 56px 28px", gap: 30, minHeight: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 40, alignItems: "center" }}>
          {bu[0] && <BuMini b={bu[0]} align="right" />}
          <div style={{ textAlign: "center", padding: "0 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center" }}>
              <Eyebrow color={TV.gold}>Primeira parcela · hoje</Eyebrow>
            </div>
            <div style={{ fontWeight: 800, fontSize: 130, lineHeight: 0.95, color: TV.t1, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", marginTop: 10 }}>{tvBRLk(v.realizado)}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 20, justifyContent: "center", marginTop: 14 }}>
              <DeltaChip value={v.vsOntem} size={24} />
              <span style={{ fontSize: 18, color: TV.t2 }}>vs ontem mesma hora</span>
            </div>
            <div style={{ marginTop: 22, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
              <MetaBar pct={v.pctMeta} color={TV.gold} height={12} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 16, color: TV.t3 }}>
                <span>{v.pctMeta == null ? "—" : Math.round(v.pctMeta * 100) + "%"} da meta {tvBRLk(v.meta)}</span>
                <span style={{ color: TV.good, fontWeight: 700 }}>proj. {tvBRLk(v.projecao)}</span>
              </div>
            </div>
          </div>
          {bu[1] && <BuMini b={bu[1]} align="left" />}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18 }}>
          {kpis.map((k) => (
            <KpiTile key={k.id} kpi={k} />
          ))}
        </div>
        <TvCard style={{ flex: 1, minHeight: 0 }} pad={30}>
          <RitmoStrip />
        </TvCard>
      </div>
      <div style={{ flexShrink: 0, height: 96 }}>
        <Ticker />
      </div>
    </TvScreen>
  );
}
