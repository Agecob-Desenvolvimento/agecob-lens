/**
 * Modo TV Operacional — segundo modo TV (não substitui "Ritmo de Acordos").
 * Heatmap de performance por agente em tela cheia (1920×1080): dois painéis
 * lado a lado (ranking 01–10 · 11–20), cor por percentil na distribuição do
 * período. Mesmo topo (marca + relógio ao vivo) e rodapé/ticker do modo original.
 */
import { useMemo, useState } from "react";
import { NUM, TV, TV_BG, TV_SANS, tvBRL, tvNum, tvPct, useTvData, type TvAgenteRow } from "./tvShared";
import { OVERSCAN_BOTTOM, TopBar } from "./TvVariants";
import { Ticker } from "./TvAtoms";
import { buildPercentileMap, classifyCell } from "@/components/detalhamento/PerformanceHeatmap";

type ColKind = "brl" | "num" | "pct";
type MetricKey = "parc1" | "acordos" | "cpc" | "conv" | "acion" | "contato";
/** Coluna ordenável: métricas + Agente (alfabética) — mesmo contrato do Heatmap. */
type SortKey = MetricKey | "nome";
type SortDir = "desc" | "asc";

interface Col {
  key: MetricKey;
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
  good: TV.goodSoft,
  warn: TV.warnSoft,
  bad: TV.badSoft,
};
// células são texto pequeno: `bad` só é legível a distância em ≥48px/700 → badText
const BAND_FG: Record<"good" | "warn" | "bad", string> = {
  good: TV.good,
  warn: TV.warn,
  bad: TV.badText,
};

function fmtCell(v: number, kind: ColKind): string {
  if (kind === "brl") return tvBRL(v, 2);
  if (kind === "pct") return tvPct(v);
  return tvNum(v);
}

const HEAD_BTN = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  font: "inherit",
  color: "inherit",
  letterSpacing: "inherit",
  textTransform: "uppercase",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap",
} as const;

function ColHeader({ sortCol, sortDir, onSort }: { sortCol: SortKey | null; sortDir: SortDir; onSort: (k: SortKey) => void }) {
  const head = (key: SortKey, label: string, ativo: boolean) => (
    <button type="button" onClick={() => onSort(key)} style={HEAD_BTN} data-testid={`tv-sort-${key}`} aria-label={`Ordenar por ${label}`}>
      <span>{label}</span>
      {ativo && <span aria-hidden="true">{sortDir === "desc" ? "↓" : "↑"}</span>}
    </button>
  );
  return (
    <div style={{ display: "flex", gap: 6, paddingBottom: 10 }}>
      <div style={{ flex: "18 1 0", display: "flex", alignItems: "center", padding: "0 16px", fontSize: 16, color: sortCol === "nome" ? TV.t1 : TV.t2, letterSpacing: "0.14em", fontWeight: 700 }}>
        {head("nome", "Agente", sortCol === "nome")}
      </div>
      {COLS.map((c) => (
        <div key={c.key} style={{ flex: `${c.w} 1 0`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: sortCol === c.key ? TV.t1 : TV.t2, letterSpacing: "0.08em", fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>
          {head(c.key, c.label, sortCol === c.key)}
        </div>
      ))}
    </div>
  );
}

function AgentRowView({ a, rank, pctMaps, podio }: { a: TvAgenteRow; rank: number; pctMaps: Record<string, Map<number, number>>; podio: boolean }) {
  // ouro só no ranking padrão: sob ordenação manual o número é posição na lista,
  // não colocação — dourar o topo de um "CPC crescente" premiaria os piores.
  const rankColor = podio && rank <= 3 ? TV.goldText : TV.t3small;
  return (
    <div style={{ flex: 1, display: "flex", gap: 6, minHeight: 0 }}>
      <div style={{ flex: "18 1 0", display: "flex", alignItems: "center", gap: 14, padding: "0 16px", background: "rgba(255,255,255,0.04)", borderRadius: 6, minWidth: 0 }}>
        <div style={{ ...NUM, fontSize: 20, fontWeight: 700, color: rankColor, width: 30, flexShrink: 0 }}>
          {String(rank).padStart(2, "0")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: TV.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.nome}</div>
          <div style={{ fontSize: 14, color: TV.t3small, letterSpacing: "0.04em" }}>{a.login}</div>
        </div>
      </div>
      {COLS.map((c) => {
        const raw = a[c.key];
        const pct = pctMaps[c.key].get(raw) ?? 0;
        const band = classifyCell(pct);
        return (
          <div key={c.key} style={{ ...NUM, flex: `${c.w} 1 0`, display: "flex", alignItems: "center", justifyContent: "center", background: BAND_BG[band], color: BAND_FG[band], borderRadius: 6, fontWeight: 700, fontSize: c.kind === "brl" ? 19 : c.kind === "pct" ? 22 : 24, whiteSpace: "nowrap", minWidth: 0 }}>
            {fmtCell(raw, c.kind)}
          </div>
        );
      })}
    </div>
  );
}

function Panel({ rows, startRank, pctMaps, divider = false, sortCol, sortDir, onSort }: { rows: TvAgenteRow[]; startRank: number; pctMaps: Record<string, Map<number, number>>; divider?: boolean; sortCol: SortKey | null; sortDir: SortDir; onSort: (k: SortKey) => void }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, ...(divider ? { borderLeft: `1px solid ${TV.line}`, paddingLeft: 32 } : {}) }}>
      <ColHeader sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}>
        {rows.map((a, i) => (
          <AgentRowView key={a.id} a={a} rank={startRank + i} pctMaps={pctMaps} podio={sortCol == null} />
        ))}
      </div>
    </div>
  );
}

const LEGEND = [
  { label: "TOP", c: "rgba(121,198,147,0.55)" },
  { label: "MEDIANO", c: "rgba(231,170,108,0.55)" },
  { label: "INFERIOR", c: "rgba(224,117,106,0.55)" },
];

function Legend() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 28, marginBottom: 16 }}>
      {LEGEND.map((it) => (
        <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: it.c }} />
          <div style={{ fontSize: 15, color: TV.t2, letterSpacing: "0.14em", fontWeight: 600, textTransform: "uppercase" }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function TvOperacional() {
  const { agentes } = useTvData();
  const [sortCol, setSortCol] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Mesmo ciclo do Heatmap: 1º clique ordena, 2º inverte, 3º volta ao padrão.
  const onSort = (key: SortKey) => {
    if (sortCol !== key) {
      setSortCol(key);
      setSortDir(key === "nome" ? "asc" : "desc");
      return;
    }
    if (key === "nome" || sortDir === "asc") {
      setSortCol(null);
      setSortDir("desc");
      return;
    }
    setSortDir("asc");
  };

  // Padrão (desempate decrescente): 1ª Parcela → Acordos → CPC → Conversão →
  // Acionamento → nome. Rank 01–20; painel A = 01–10, painel B = 11–20.
  const rows = useMemo(() => {
    const copy = [...agentes];
    if (sortCol === "nome") {
      copy.sort((a, b) => {
        const cmp = a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
        return sortDir === "asc" ? cmp : -cmp;
      });
    } else if (sortCol) {
      copy.sort((a, b) => (sortDir === "desc" ? b[sortCol] - a[sortCol] : a[sortCol] - b[sortCol]));
    } else {
      copy.sort((a, b) => b.parc1 - a.parc1 || b.acordos - a.acordos || b.cpc - a.cpc || b.conv - a.conv || b.acion - a.acion || a.nome.localeCompare(b.nome, "pt-BR"));
    }
    return copy.slice(0, 20);
  }, [agentes, sortCol, sortDir]);

  // Percentil sobre a POPULAÇÃO, não sobre as 20 linhas exibidas: senão reordenar
  // troca o conjunto e repinta os mesmos números — um CPC=0 viraria "TOP" verde.
  const pctMaps = useMemo(() => {
    const m: Record<string, Map<number, number>> = {};
    COLS.forEach((c) => {
      m[c.key] = buildPercentileMap(agentes.map((r) => r[c.key]));
    });
    return m;
  }, [agentes]);

  const rowsA = rows.slice(0, 10);
  const rowsB = rows.slice(10, 20);

  return (
    <div style={{ width: 1920, height: 1080, background: TV_BG, color: TV.t1, fontFamily: TV_SANS, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <TopBar sub="Operacional · Modo TV" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "28px 80px 22px", minHeight: 0 }}>
        <Legend />
        <div style={{ flex: 1, display: "flex", gap: 40, minHeight: 0 }}>
          <Panel rows={rowsA} startRank={1} pctMaps={pctMaps} sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
          <Panel rows={rowsB} startRank={11} pctMaps={pctMaps} divider sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
        </div>
      </div>
      <div style={{ flexShrink: 0, height: 96, marginBottom: OVERSCAN_BOTTOM }}>
        <Ticker />
      </div>
    </div>
  );
}
