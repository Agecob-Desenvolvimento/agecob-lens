/* ============================================================
   AgDash — KpiDeltaBadge + ExecutiveKpiStrip
   ============================================================ */

// ---------- SVG Icons ----------
const KpiIcons = {
  arrowUp: (size = 12) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M7 17l10-10M17 17V7H7"/>
    </svg>
  ),
  arrowDown: (size = 12) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M7 7l10 10M17 7v10H7"/>
    </svg>
  ),
  minus: (size = 12) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 12h14"/>
    </svg>
  ),
  alert: (size = 12) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
    </svg>
  ),
};

// ---------- Tone styles ----------
const TONES = {
  positive:  { bg: "#ecfdf5", color: "#047857", border: "transparent" },
  critical:  { bg: "#fff1f2", color: "#be123c", border: "transparent" },
  attention: { bg: "#fffbeb", color: "#b45309", border: "transparent" },
  neutral:   { bg: "#f1f5f9", color: "#475569", border: "transparent" },
  empty:     { bg: "#f8fafc", color: "#94a3b8", border: "#e2e8f0" },
};

function KpiDeltaBadge({ value, direction, baseline, betterWhen = "up", compact = false }) {
  if (baseline == null || value == null) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "2px 8px", borderRadius: 999,
        fontSize: 12, fontWeight: 500,
        background: TONES.empty.bg, color: TONES.empty.color,
        border: `1px dashed ${TONES.empty.border}`,
      }}>sem comparativo</span>
    );
  }

  const tone = direction === "flat" ? "neutral"
    : (direction === betterWhen ? "positive" : "critical");
  const Icon = direction === "up" ? KpiIcons.arrowUp
    : direction === "down" ? KpiIcons.arrowDown : KpiIcons.minus;
  const label = baseline === "meta" ? "vs meta"
    : baseline === "period" ? "vs ontem" : "vs média 14d";
  const t = TONES[tone];
  const pct = Math.round(Math.abs(value) * 100);

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: compact ? "1px 6px" : "2px 8px", borderRadius: 999,
        fontSize: compact ? 11 : 12, fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        background: t.bg, color: t.color,
      }}>
        {Icon(compact ? 10 : 12)}
        {pct}%
      </span>
      {!compact && <span style={{ fontSize: 12, color: "#64748b" }}>{label}</span>}
    </span>
  );
}

function ExecutiveKpiStrip({ tweaks }) {
  const primaries = MOCK_KPIS.primary;
  const secondaries = MOCK_KPIS.secondary;

  const formatValue = (kpi) => {
    if (kpi.unit === "BRL") return formatBRLCompact(kpi.value);
    if (kpi.unit === "%") return formatPercent(kpi.value);
    if (kpi.unit === "count") {
      if (kpi.value >= 10000) return (kpi.value / 1000).toFixed(1).replace(".", ",") + "k";
      return formatNumber(kpi.value);
    }
    return String(kpi.value);
  };

  const unitLabel = (u) => u === "BRL" ? "BRL" : u === "%" ? "%" : "";

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(6, 1fr)",
      gap: 12,
    }}>
      {/* Primary KPIs */}
      {primaries.map(kpi => (
        <div key={kpi.id} style={{
          gridColumn: "span 2",
          background: "#fff", border: "1px solid #e2e8f0",
          borderRadius: 8, padding: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: "0.12em",
              textTransform: "uppercase", color: "#64748b",
            }}>{kpi.label}</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: "#94a3b8" }}>{unitLabel(kpi.unit)}</span>
          </div>
          <div style={{
            marginTop: 12, fontSize: 40, fontWeight: 700,
            letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums",
            color: "#0f172a", lineHeight: 1,
          }}>
            {formatValue(kpi)}
          </div>
          <div style={{ marginTop: 12 }}>
            {kpi.delta ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <KpiDeltaBadge
                  value={kpi.delta.value}
                  direction={kpi.delta.direction}
                  baseline={kpi.delta.baseline}
                  betterWhen={kpi.betterWhen}
                />
                {kpi.delta.baselineValue && (
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    · {formatBRLCompact(kpi.delta.baselineValue)}
                  </span>
                )}
              </div>
            ) : <span style={{ fontSize: 12, color: "#cbd5e1" }}>—</span>}
          </div>
        </div>
      ))}

      {/* Secondary KPIs - first row of 2 to fill remaining 2 cols */}
      {secondaries.slice(0, 2).map(kpi => (
        <SecondaryKpiCard key={kpi.id} kpi={kpi} formatValue={formatValue} />
      ))}

      {/* Secondary KPIs - next rows */}
      {secondaries.slice(2).map(kpi => (
        <SecondaryKpiCard key={kpi.id} kpi={kpi} formatValue={formatValue} />
      ))}
    </div>
  );
}

function SecondaryKpiCard({ kpi, formatValue }) {
  const deltaText = () => {
    if (!kpi.delta) return kpi.extra || null;
    const tone = kpi.delta.direction === "flat" ? "neutral"
      : (kpi.delta.direction === kpi.betterWhen ? "positive" : "critical");
    const colors = { positive: "#047857", critical: "#be123c", neutral: "#64748b", attention: "#b45309" };
    const arrows = { up: "↑", down: "↓", flat: "→" };
    const labels = { meta: "vs meta", period: "vs ontem", movavg: "vs média 14d" };
    const pct = Math.round(Math.abs(kpi.delta.value) * 100);
    return (
      <span style={{ fontSize: 11, fontWeight: 500, color: colors[tone] }}>
        {arrows[kpi.delta.direction]} {pct}% {labels[kpi.delta.baseline]}
      </span>
    );
  };

  return (
    <div style={{
      gridColumn: "span 1",
      background: "#fff", border: "1px solid #e2e8f0",
      borderRadius: 8, padding: 16,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "#64748b",
      }}>{kpi.label}</div>
      <div style={{
        marginTop: 8, fontSize: 24, fontWeight: 600,
        fontVariantNumeric: "tabular-nums", color: "#0f172a", lineHeight: 1,
      }}>
        {formatValue(kpi)}
      </div>
      <div style={{ marginTop: 8 }}>
        {deltaText() || (kpi.extra && <span style={{ fontSize: 11, color: "#64748b" }}>{kpi.extra}</span>)}
      </div>
    </div>
  );
}

Object.assign(window, { KpiDeltaBadge, ExecutiveKpiStrip, SecondaryKpiCard });
