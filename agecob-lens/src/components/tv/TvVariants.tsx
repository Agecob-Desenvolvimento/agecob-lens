/**
 * Modo TV — Placar do Dia (canvas 1920×1080).
 */
import type { ReactNode } from "react";
import { NUM, TV, TV_BG, TV_SANS, tvBRLc, tvBRLk, tvNum, type TvBu, useTvData } from "./tvShared";
import { DeltaChip, Eyebrow, KpiTile, LivePulse, MetaProgressBar, RitmoWorm, Ticker, TvBrand, TvCard, TvClock } from "./TvAtoms";
import { useAnimatedFormattedValue } from "@/hooks/useAnimatedFormattedValue";

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
  const animatedValue = useAnimatedFormattedValue(value);
  return (
    // maxWidth + wrap (não nowrap): rótulo mais longo ("Da 1ª parcela") quebra em
    // 2 linhas em vez de forçar a largura do card — largura previsível, sem risco
    // de estourar o canvas de 1920px numa TV sem margem de sobra na lateral.
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", maxWidth: 82 }}>
      <span style={{ ...NUM, fontSize: 30, fontWeight: 800, color: TV.t1, lineHeight: 0.9, whiteSpace: "nowrap" }}>{animatedValue}</span>
      <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.14em", color: TV.t3, textAlign: "right", lineHeight: 1.2 }}>{label}</span>
    </div>
  );
}

/** Bloco de unidade de negócio no painel lateral do Placar. `share` = fatia da 1ª parcela do dia. */
function BuCard({ b, share }: { b: TvBu; share: number | null }) {
  const animatedValor = useAnimatedFormattedValue(tvBRLk(b.valor));
  return (
    <div style={{ flex: 1, minHeight: 0, background: TV.cardHi, borderRadius: 16, padding: "20px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.18em", color: TV.t2 }}>{b.bu}</span>
        <span style={{ ...NUM, fontSize: 52, fontWeight: 800, color: TV.t1, lineHeight: 0.9, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{animatedValor}</span>
      </div>
      <div style={{ display: "flex", gap: 24, flexShrink: 0 }}>
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

  const valorAcordosDiaTxt = useAnimatedFormattedValue(tvBRLc(v.valorAcordosDia));
  const realizadoDiaTxt = useAnimatedFormattedValue(tvBRLc(v.realizadoDia));
  const excecoesValorDiaTxt = useAnimatedFormattedValue(tvBRLc(v.excecoesValorDia));

  return (
    <TvScreen>
      <TopBar sub="Placar do Dia · Modo TV" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "28px 64px 20px", gap: 22, minHeight: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: bu.length ? "1fr 660px" : "1fr", gap: 40, alignItems: "stretch", flexShrink: 0, height: 262 }}>
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
              <Eyebrow size={17} color={TV.t3} style={{ letterSpacing: "0.16em" }}>Acordos em exceção</Eyebrow>

              {/* `nowrap` obrigatório: as trilhas são `auto` e, sem ele, um valor
                  longo ("R$ 1,61 mi") quebra em duas linhas e estoura a faixa por
                  cima da barra de meta. Corpos somam ~1050px em 1100 disponíveis. */}
              <div style={{ ...NUM, fontWeight: 800, fontSize: 76, lineHeight: 0.92, color: TV.t1, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>{valorAcordosDiaTxt}</div>
              <div style={{ ...NUM, fontWeight: 800, fontSize: 76, lineHeight: 0.92, color: TV.gold, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>{realizadoDiaTxt}</div>
              {/* goldText, não warn: única cor "amarela" auditada p/ texto < 28px (§ paleta APCA); aqui em corpo grande fica gold cheio */}
              <div style={{ ...NUM, fontWeight: 800, fontSize: 76, lineHeight: 0.92, color: TV.goldText, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>
                {excecoesValorDiaTxt}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ ...NUM, fontSize: 17, color: TV.t3, whiteSpace: "nowrap" }}>{tvNum(v.qtdAcordosDia)} acordos</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <DeltaChip value={v.vsOntemDia} size={20} />
                <span style={{ fontSize: 17, color: TV.t3, whiteSpace: "nowrap" }}>
                  vs dia útil anterior, mesma hora <span style={{ fontSize: 13, color: TV.t3small }}>(estimado por hora do dia)</span>
                </span>
              </div>
              {/* 1ª parcela dos acordos em exceção — legenda sob o total geral */}
              <div style={{ ...NUM, fontSize: 17, color: TV.t3, whiteSpace: "nowrap" }}>{tvBRLk(v.excecoesPrimeiraParcelaDia)} 1ª parcela · {tvNum(v.excecoesQtdDia)} acordos</div>
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
