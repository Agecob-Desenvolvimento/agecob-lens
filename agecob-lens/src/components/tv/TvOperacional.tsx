/**
 * Modo TV Operacional — segundo modo TV (não substitui "Ritmo de Acordos").
 * Heatmap de performance por agente em tela cheia (1920×1080): dois painéis
 * lado a lado (ranking 01–10 · 11–20), cor por percentil na distribuição do
 * período. Mesmo topo (marca + relógio ao vivo) e rodapé/ticker do modo original.
 */
import { TV, tvBRL, tvNum, tvPct, useTvData, type TvAgenteRow } from "./tvShared";
import { TopBar } from "./TvVariants";
import { Ticker } from "./TvAtoms";
import { buildPercentileMap, classifyCell } from "@/components/detalhamento/PerformanceHeatmap";

type ColKind = "brl" | "num" | "pct";
interface Col {
  key: "parc1" | "acordos" | "cpc" | "conv" | "acion" | "contato";
  label: string;
  /** flex-grow proporcional (transcrito do design de referência) */
  w: number;
  kind: ColKind;
}

const COLS: Col[] = [
  { key: "parc1", label: "1ª Parc.", w: 9.4, kind: "brl" },
  { key: "acordos", label: "Acordos", w: 6, kind: "num" },
  { key: "cpc", label: "CPC", w: 5, kind: "num" },
  { key: "conv", label: "Conv. %", w: 6, kind: "pct" },
  { key: "acion", label: "Acionam.", w: 6.4, kind: "num" },
  { key: "contato", label: "Contato", w: 6.4, kind: "num" },
];

const BAND_BG: Record<"good" | "warn" | "bad", string> = {
  good: "rgba(55,211,154,0.15)",
  warn: "rgba(240,184,64,0.14)",
  bad: "rgba(240,113,111,0.13)",
};
const BAND_FG: Record<"good" | "warn" | "bad", string> = {
  good: TV.good,
  warn: TV.warn,
  bad: TV.bad,
};

function fmtCell(v: number, kind: ColKind): string {
  if (kind === "brl") return tvBRL(v, 2);
  if (kind === "pct") return tvPct(v);
  return tvNum(v);
}

function ColHeader() {
  return (
    <div style={{ display: "flex", gap: 6, paddingBottom: 10 }}>
      <div style={{ flex: "18 1 0", display: "flex", alignItems: "center", padding: "0 16px", fontSize: 16, color: TV.t2, letterSpacing: "0.14em", fontWeight: 700, textTransform: "uppercase" }}>
        Agente
      </div>
      {COLS.map((c) => (
        <div key={c.key} style={{ flex: `${c.w} 1 0`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: TV.t2, letterSpacing: "0.08em", fontWeight: 700, textAlign: "center", whiteSpace: "nowrap", textTransform: "uppercase" }}>
          {c.label}
        </div>
      ))}
    </div>
  );
}

function AgentRowView({ a, rank, pctMaps }: { a: TvAgenteRow; rank: number; pctMaps: Record<string, Map<number, number>> }) {
  const rankColor = rank <= 3 ? TV.gold : TV.t3;
  return (
    <div style={{ flex: 1, display: "flex", gap: 6, minHeight: 0 }}>
      <div style={{ flex: "18 1 0", display: "flex", alignItems: "center", gap: 14, padding: "0 16px", background: "rgba(255,255,255,0.04)", borderRadius: 6, minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: rankColor, width: 30, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
          {String(rank).padStart(2, "0")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: TV.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.nome}</div>
          <div style={{ fontSize: 14, color: TV.t3, letterSpacing: "0.04em" }}>{a.login}</div>
        </div>
      </div>
      {COLS.map((c) => {
        const raw = a[c.key];
        const pct = pctMaps[c.key].get(raw) ?? 0;
        const band = classifyCell(pct);
        return (
          <div key={c.key} style={{ flex: `${c.w} 1 0`, display: "flex", alignItems: "center", justifyContent: "center", background: BAND_BG[band], color: BAND_FG[band], borderRadius: 6, fontWeight: 700, fontSize: c.kind === "brl" ? 19 : c.kind === "pct" ? 22 : 24, whiteSpace: "nowrap", minWidth: 0, fontVariantNumeric: "tabular-nums" }}>
            {fmtCell(raw, c.kind)}
          </div>
        );
      })}
    </div>
  );
}

function Panel({ rows, startRank, pctMaps, divider = false }: { rows: TvAgenteRow[]; startRank: number; pctMaps: Record<string, Map<number, number>>; divider?: boolean }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, ...(divider ? { borderLeft: `1px solid ${TV.line}`, paddingLeft: 32 } : {}) }}>
      <ColHeader />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}>
        {rows.map((a, i) => (
          <AgentRowView key={a.id} a={a} rank={startRank + i} pctMaps={pctMaps} />
        ))}
      </div>
    </div>
  );
}

const LEGEND = [
  { label: "TOP", c: "rgba(55,211,154,0.55)" },
  { label: "MEDIANO", c: "rgba(240,184,64,0.55)" },
  { label: "INFERIOR", c: "rgba(240,113,111,0.55)" },
];

function Legend() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 28, marginBottom: 16 }}>
      {LEGEND.map((it) => (
        <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: it.c }} />
          <div style={{ fontSize: 15, color: TV.t2, letterSpacing: "0.14em", fontWeight: 600 }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function TvOperacional() {
  const { agentes } = useTvData();

  // Ordenação (desempate decrescente): 1ª Parcela → Acordos → CPC → Conversão →
  // Acionamento → nome. Rank 01–20; painel A = 01–10, painel B = 11–20.
  const rows = [...agentes]
    .sort((a, b) => b.parc1 - a.parc1 || b.acordos - a.acordos || b.cpc - a.cpc || b.conv - a.conv || b.acion - a.acion || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, 20);

  const pctMaps: Record<string, Map<number, number>> = {};
  COLS.forEach((c) => {
    pctMaps[c.key] = buildPercentileMap(rows.map((r) => r[c.key]));
  });

  const rowsA = rows.slice(0, 10);
  const rowsB = rows.slice(10, 20);

  return (
    <div style={{ width: 1920, height: 1080, background: `radial-gradient(120% 90% at 80% -10%, ${TV.petrol} 0%, ${TV.bg1} 45%, ${TV.bg0} 100%)`, color: TV.t1, fontFamily: "'Inter', system-ui, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <TopBar sub="Operacional · Modo TV" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "28px 56px 22px", minHeight: 0 }}>
        <Legend />
        <div style={{ flex: 1, display: "flex", gap: 40, minHeight: 0 }}>
          <Panel rows={rowsA} startRank={1} pctMaps={pctMaps} />
          <Panel rows={rowsB} startRank={11} pctMaps={pctMaps} divider />
        </div>
      </div>
      <div style={{ flexShrink: 0, height: 96 }}>
        <Ticker />
      </div>
    </div>
  );
}
