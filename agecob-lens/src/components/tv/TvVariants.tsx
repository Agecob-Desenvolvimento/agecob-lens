/**
 * Modo TV — Placar do Dia (canvas 1920×1080).
 */
import type { ReactNode } from "react";
import { NUM, TV, TV_BG, TV_SANS, tvBRLc, tvBRLk, tvF, tvH, tvNum, tvW, type TvBu, useTvData } from "./tvShared";
import { DeltaChip, Eyebrow, KpiTile, LivePulse, MetaProgressBar, RitmoWorm, Ticker, TvBrand, TvCard, TvClock } from "./TvAtoms";
import { useAnimatedFormattedValue } from "@/hooks/useAnimatedFormattedValue";

function TvScreen({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        // dimensão vem do canvas (TvMode): 1920×1080 na TV 16:9, maior quando a
        // janela tem outra proporção — a tela se estende em vez de virar tarja
        width: "100%",
        height: "100%",
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
    <div style={{ flexShrink: 0, height: tvH(158), padding: `${tvH(68)} ${tvW(80)} 0`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderBottom: `1px solid ${TV.line}` }}>
      <TvBrand sub={sub} />
      <div style={{ display: "flex", alignItems: "center", gap: tvW(40) }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: tvH(6), alignItems: "flex-end", maxWidth: tvW(82) }}>
      <span style={{ ...NUM, fontSize: tvF(30), fontWeight: 800, color: TV.t1, lineHeight: 0.9, whiteSpace: "nowrap" }}>{animatedValue}</span>
      <span style={{ fontSize: tvF(14), fontWeight: 600, letterSpacing: "0.14em", color: TV.t3, textAlign: "right", lineHeight: 1.2 }}>{label}</span>
    </div>
  );
}

/** Bloco de unidade de negócio no painel lateral do Placar. `share` = fatia da 1ª parcela do dia. */
function BuCard({ b, share }: { b: TvBu; share: number | null }) {
  const animatedValor = useAnimatedFormattedValue(tvBRLk(b.valor));
  return (
    <div style={{ flex: 1, minHeight: 0, background: TV.cardHi, borderRadius: tvW(16), padding: `${tvH(20)} ${tvW(22)}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: tvW(20) }}>
      <div style={{ display: "flex", flexDirection: "column", gap: tvH(8), minWidth: 0 }}>
        <span style={{ fontSize: tvF(20), fontWeight: 700, letterSpacing: "0.18em", color: TV.t2 }}>{b.bu}</span>
        <span style={{ ...NUM, fontSize: tvF(52), fontWeight: 800, color: TV.t1, lineHeight: 0.9, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{animatedValor}</span>
      </div>
      <div style={{ display: "flex", gap: tvW(24), flexShrink: 0 }}>
        <BuStat value={tvNum(b.acordos)} label="Acordos" />
        <BuStat value={share == null ? "—" : share + "%"} label="Da 1ª parcela" />
      </div>
    </div>
  );
}

// Safe area vertical (§3.7): TV em modo Zoom corta ~5% da borda. Marca e relógio
// descem 40px; o ticker sobe 60px do rodapé.
export const OVERSCAN_BOTTOM = tvH(60);

// C — Placar do Dia
export function VariantScoreboard() {
  const { valor: v, kpis, bu, buTotal } = useTvData();

  const valorAcordosDiaTxt = useAnimatedFormattedValue(tvBRLc(v.valorAcordosDia));
  const realizadoDiaTxt = useAnimatedFormattedValue(tvBRLc(v.realizadoDia));
  const excecoesP1DiaTxt = useAnimatedFormattedValue(tvBRLc(v.excecoesPrimeiraParcelaDia));

  return (
    <TvScreen>
      <TopBar sub="Placar do Dia · Modo TV" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: `${tvH(28)} ${tvW(64)} ${tvH(20)}`, gap: tvH(22), minHeight: 0 }}>
        {/* `minmax(0, …)`, não `1fr` puro: `1fr` = `minmax(auto, 1fr)` e o auto é o
            min-content do hero — qualquer texto `nowrap` mais largo que a fatia
            estoura a trilha e empurra os cards de BU para fora do canvas (ficavam
            cortados pelo `overflow: hidden`). */}
        <div style={{ display: "grid", gridTemplateColumns: bu.length ? `minmax(0, 1fr) ${tvW(660)}` : "minmax(0, 1fr)", gap: tvW(40), alignItems: "stretch", flexShrink: 0, height: tvH(262) }}>
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
                columnGap: tvW(52),
                rowGap: tvH(10),
                marginTop: tvH(14),
              }}
            >
              <Eyebrow size={tvF(17)} color={TV.t3} style={{ letterSpacing: "0.16em" }}>Valor de acordos</Eyebrow>
              <Eyebrow size={tvF(17)} color={TV.t3} style={{ letterSpacing: "0.16em" }}>1ª parcela</Eyebrow>
              <Eyebrow size={tvF(17)} color={TV.t3} style={{ letterSpacing: "0.16em" }}>Exceção · 1ª parcela</Eyebrow>

              {/* `nowrap` obrigatório: as trilhas são `auto` e, sem ele, um valor
                  longo ("R$ 1,61 mi") quebra em duas linhas e estoura a faixa por
                  cima da barra de meta. Corpos somam ~1050px em 1100 disponíveis. */}
              <div style={{ ...NUM, fontWeight: 800, fontSize: tvF(76), lineHeight: 0.92, color: TV.t1, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>{valorAcordosDiaTxt}</div>
              <div style={{ ...NUM, fontWeight: 800, fontSize: tvF(76), lineHeight: 0.92, color: TV.gold, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>{realizadoDiaTxt}</div>
              {/* goldText, não warn: única cor "amarela" auditada p/ texto < 28px (§ paleta APCA); aqui em corpo grande fica gold cheio */}
              <div style={{ ...NUM, fontWeight: 800, fontSize: tvF(76), lineHeight: 0.92, color: TV.goldText, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>
                {excecoesP1DiaTxt}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: tvH(4) }}>
                <div style={{ ...NUM, fontSize: tvF(17), color: TV.t3, whiteSpace: "nowrap" }}>{tvNum(v.qtdAcordosDia)} acordos</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: tvW(10) }}>
                <DeltaChip value={v.vsOntemDia} size={20} />
                {/* sem `nowrap`: é a única prosa longa do hero e, travada em uma
                    linha, era ela quem definia o min-content da trilha (595px) */}
                <span style={{ fontSize: tvF(17), color: TV.t3 }}>
                  vs dia útil anterior, mesma hora <span style={{ fontSize: tvF(13), color: TV.t3small }}>(estimado por hora do dia)</span>
                </span>
              </div>
              {/* total geral em exceção — legenda sob a 1ª parcela */}
              <div style={{ ...NUM, fontSize: tvF(17), color: TV.t3, whiteSpace: "nowrap" }}>{tvBRLk(v.excecoesValorDia)} total · {tvNum(v.excecoesQtdDia)} acordos</div>
            </div>
          </div>
          {bu.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: tvH(16), minHeight: 0 }}>
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
        <div style={{ display: "grid", gridTemplateColumns: `${tvW(680)} 1fr`, gap: tvW(24), flex: 1, minHeight: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: tvW(24), minHeight: 0 }}>
            {kpis.map((k) => (
              <KpiTile key={k.id} kpi={k} />
            ))}
          </div>
          <TvCard style={{ minHeight: 0 }} pad={26}>
            <RitmoWorm />
          </TvCard>
        </div>
      </div>
      <div style={{ flexShrink: 0, height: tvH(96), marginBottom: OVERSCAN_BOTTOM }}>
        <Ticker />
      </div>
    </TvScreen>
  );
}
