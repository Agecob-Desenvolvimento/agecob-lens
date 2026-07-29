/**
 * Modo TV — Placar do Dia (canvas 1920×1080).
 */
import type { ReactNode } from "react";
import { NUM, TV, TV_BG, TV_SANS, tvBRLc, tvBRLk, tvNum, type TvBu, useTvData } from "./tvShared";
import { DeltaChip, Eyebrow, KpiTile, LivePulse, MetaProgressBar, RitmoWorm, Ticker, TvBrand, TvCard, TvClock } from "./TvAtoms";

function TvScreen({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        background: TV_BG,
        color: TV.t1,
        fontFamily: TV_SANS,
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
    <div style={{ flexShrink: 0, height: 158, padding: "68px 80px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderBottom: `1px solid ${TV.line}` }}>
      <TvBrand sub={sub} />
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <LivePulse />
        <TvClock />
      </div>
    </div>
  );
}

/** Par número + rótulo dos cards de BU. Rótulo fica secundário — não compete com o dado. */
function BuStat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      <span style={{ ...NUM, fontSize: 34, fontWeight: 800, color: TV.t1, lineHeight: 0.9 }}>{value}</span>
      <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.14em", color: TV.t3, whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

/** Bloco de unidade de negócio no painel lateral do Placar. `share` = fatia da 1ª parcela do dia. */
function BuCard({ b, share }: { b: TvBu; share: number | null }) {
  return (
    <div style={{ flex: 1, minHeight: 0, background: TV.cardHi, borderRadius: 16, padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.18em", color: TV.t2 }}>{b.bu}</span>
        <span style={{ ...NUM, fontSize: 58, fontWeight: 800, color: TV.t1, lineHeight: 0.9, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{tvBRLk(b.valor)}</span>
      </div>
      <div style={{ display: "flex", gap: 36, flexShrink: 0 }}>
        <BuStat value={tvNum(b.acordos)} label="Acordos" />
        <BuStat value={share == null ? "—" : share + "%"} label="Da 1ª parcela" />
      </div>
    </div>
  );
}

// Safe area vertical (§3.7): TV em modo Zoom corta ~5% da borda. Marca e relógio
// descem 40px; o ticker sobe 60px do rodapé.
export const OVERSCAN_BOTTOM = 60;

// C — Placar do Dia
export function VariantScoreboard() {
  const { valor: v, kpis, bu, buTotal } = useTvData();

  // Cor do % = posição vs ritmo esperado do dia. Gold nunca carrega estado (§3.6):
  // dentro de ±3pp do esperado o número fica neutro.
  const diff = v.pctMetaDia != null && v.pctEsperado != null ? v.pctMetaDia - v.pctEsperado : null;
  const pctCor = v.pctMetaDia != null && v.pctMetaDia >= 1 ? TV.good : diff == null ? TV.t1 : diff >= 0.03 ? TV.good : diff <= -0.03 ? TV.warn : TV.t1;
  // mesmo limiar da barra de meta — um só conceito de "atrás do ritmo" na tela
  const atrasado = diff != null && diff <= -0.03 && !(v.pctMetaDia != null && v.pctMetaDia >= 1);

  return (
    <TvScreen>
      <TopBar sub="Placar do Dia · Modo TV" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "28px 80px 20px", gap: 22, minHeight: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: bu.length ? "1fr 620px" : "1fr", gap: 40, alignItems: "stretch", flexShrink: 0, height: 262 }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <Eyebrow color={TV.goldText}>Hoje</Eyebrow>
            {/* grid de 3 colunas × 3 linhas (rótulo · número · nota). `alignItems:
                baseline` alinha cada linha entre si: os números têm corpos diferentes
                (96 vs 96 vs 132) e, empilhados em flex aninhado, as bases saíam tortas
                e cada nota caía numa altura. `justifyItems: center` centra o número
                sobre a nota — quem dita a largura da coluna é o texto mais longo. */}
            <div
              style={{
                display: "grid",
                // 1fr por coluna + space-between: as 3 medidas ocupam a largura toda
                // do hero em vez de se amontoarem à esquerda deixando vão até os BU
                gridTemplateColumns: "repeat(3, auto)",
                justifyContent: "space-between",
                justifyItems: "center",
                alignItems: "baseline",
                columnGap: 52,
                rowGap: 10,
                marginTop: 14,
              }}
            >
              <Eyebrow size={17} color={TV.t3} style={{ letterSpacing: "0.16em" }}>Valor de acordos</Eyebrow>
              <Eyebrow size={17} color={TV.t3} style={{ letterSpacing: "0.16em" }}>1ª parcela</Eyebrow>
              <Eyebrow size={17} color={TV.t3} style={{ letterSpacing: "0.16em" }}>Meta do dia</Eyebrow>

              {/* `nowrap` obrigatório: as trilhas são `auto` e, sem ele, um valor
                  longo ("R$ 1,61 mi") quebra em duas linhas e estoura a faixa por
                  cima da barra de meta. Corpos somam ~1050px em 1100 disponíveis. */}
              <div style={{ ...NUM, fontWeight: 800, fontSize: 76, lineHeight: 0.92, color: TV.t1, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>{tvBRLc(v.valorAcordosDia)}</div>
              <div style={{ ...NUM, fontWeight: 800, fontSize: 76, lineHeight: 0.92, color: TV.gold, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>{tvBRLc(v.realizadoDia)}</div>
              {/* maior glifo da tela — é a métrica que a operação olha primeiro */}
              <div style={{ ...NUM, fontWeight: 800, fontSize: 110, lineHeight: 0.92, color: pctCor, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>
                {v.pctMetaDia == null ? "—" : Math.round(v.pctMetaDia * 100) + "%"}
              </div>

              <div style={{ ...NUM, fontSize: 17, color: TV.t3, whiteSpace: "nowrap" }}>{tvNum(v.qtdAcordosDia)} acordos</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <DeltaChip value={v.vsOntemDia} size={20} />
                <span style={{ fontSize: 17, color: TV.t3, whiteSpace: "nowrap" }}>vs dia útil anterior, mesma hora</span>
              </div>
              {/* único lugar da tela que usa o vermelho saturado (§3.6): fora do
                  estado atrasado não existe um pixel de `alarm` na tela.
                  Diz "abaixo da meta", não "abaixo do ritmo": este chip mede CAIXA
                  (1ª parcela / meta do dia) e a pill do gráfico mede CONTAGEM de
                  acordos. Podem discordar legitimamente — dois rótulos iguais para
                  métricas diferentes leem como contradição na parede. */}
              {atrasado ? (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 999, background: TV.alarmSoft, border: `1px solid rgba(255,77,66,0.35)`, whiteSpace: "nowrap" }}>
                  <span style={{ ...NUM, fontSize: 17, fontWeight: 700, color: TV.alarmText }}>▼ {Math.round(Math.abs(diff! * 100))} pp</span>
                  <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.10em", color: TV.alarmText, textTransform: "uppercase" }}>abaixo da meta</span>
                </div>
              ) : (
                <div style={{ fontSize: 17, color: TV.t2, whiteSpace: "nowrap" }}>
                  de <strong style={{ color: TV.t1, fontWeight: 700 }}>{tvBRLc(v.metaDia)}</strong>
                </div>
              )}
            </div>
          </div>
          {bu.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
              {bu.map((b) => (
                <BuCard key={b.bu} b={b} share={buTotal ? Math.round(((b.valor ?? 0) / buTotal) * 100) : null} />
              ))}
            </div>
          )}
        </div>

        <div style={{ flexShrink: 0 }}>
          <MetaProgressBar pct={v.pctMetaDia} pctEsperado={v.pctEsperado} />
        </div>

        {/* tiles 2×2 à esquerda, card do gráfico ao lado — o split é o que dá altura ao gráfico */}
        <div style={{ display: "grid", gridTemplateColumns: "680px 1fr", gap: 24, flex: 1, minHeight: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 24, minHeight: 0 }}>
            {kpis.map((k) => (
              <KpiTile key={k.id} kpi={k} />
            ))}
          </div>
          <TvCard style={{ minHeight: 0 }} pad={26}>
            <RitmoWorm />
          </TvCard>
        </div>
      </div>
      <div style={{ flexShrink: 0, height: 96, marginBottom: OVERSCAN_BOTTOM }}>
        <Ticker />
      </div>
    </TvScreen>
  );
}
