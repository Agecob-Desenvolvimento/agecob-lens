/* ============================================================
   AgDash — ExecutiveInsightCard (Hero Banner / Daily Readout)
   ============================================================ */

function ExecutiveInsightCard({ variant, metric, value, delta, description, cta }) {
  if (variant == null || variant === "neutral") return null;

  const isCritical = variant === "critical";

  const palette = isCritical
    ? { bg: "#fff1f2", border: "#fecdd3", iconBg: "#ffe4e6", iconBorder: "#fecdd3", text: "#9f1239", textLight: "rgba(136,19,55,0.7)", accent: "#be123c", btnBg: "#be123c", btnHover: "#9f1239" }
    : { bg: "#ecfdf5", border: "#a7f3d0", iconBg: "#d1fae5", iconBorder: "#a7f3d0", text: "#064e3b", textLight: "rgba(6,78,59,0.7)", accent: "#047857", btnBg: "transparent", btnHover: "transparent" };

  const [hoverCta, setHoverCta] = React.useState(false);

  return (
    <div role="status" style={{
      width: "100%",
      background: palette.bg,
      border: `1px solid ${palette.border}`,
      borderRadius: 8,
      padding: isCritical ? "20px 24px" : "14px 24px",
      display: "flex",
      alignItems: isCritical ? "flex-start" : "center",
      gap: 16,
    }}>
      {/* Icon */}
      <div style={{
        flexShrink: 0,
        width: isCritical ? 40 : 32,
        height: isCritical ? 40 : 32,
        borderRadius: "50%",
        background: palette.iconBg,
        border: `1px solid ${palette.iconBorder}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: palette.accent,
        marginTop: isCritical ? 2 : 0,
      }}>
        {isCritical ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {isCritical ? (
          <React.Fragment>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: palette.accent }}>Crítico</span>
              <span style={{ fontSize: 12, color: palette.textLight }}>·</span>
              <span style={{ fontSize: 12, color: palette.textLight }}>{metric}</span>
            </div>
            <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", color: palette.text, lineHeight: 1 }}>{value}</span>
              {delta && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "2px 8px", borderRadius: 999,
                  background: "#fff", border: `1px solid ${palette.border}`,
                  color: palette.accent, fontSize: 12, fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M7 7l10 10M17 7v10H7"/>
                  </svg>
                  {delta}
                </span>
              )}
            </div>
            <p style={{ marginTop: 8, fontSize: 14.5, color: "rgba(136,19,55,0.85)", lineHeight: 1.5, maxWidth: 640 }}>{description}</p>
          </React.Fragment>
        ) : (
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: palette.accent }}>Positivo</span>
            <span style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: palette.text, lineHeight: 1 }}>{value} {metric}</span>
            <span style={{ fontSize: 13.5, color: "rgba(6,78,59,0.85)" }}>{description}</span>
          </div>
        )}
      </div>

      {/* CTA */}
      {cta && (
        <div style={{ flexShrink: 0, alignSelf: "center" }}>
          {isCritical ? (
            <button
              onMouseEnter={() => setHoverCta(true)}
              onMouseLeave={() => setHoverCta(false)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer",
                background: hoverCta ? palette.btnHover : palette.btnBg,
                color: "#fff", fontSize: 13, fontWeight: 600,
                transition: "background 150ms ease",
              }}
            >
              {cta.label}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M13 5l7 7-7 7"/>
              </svg>
            </button>
          ) : (
            <button
              onMouseEnter={() => setHoverCta(true)}
              onMouseLeave={() => setHoverCta(false)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600,
                color: hoverCta ? "#064e3b" : "#047857",
                textDecoration: "underline",
                textUnderlineOffset: 3,
                textDecorationColor: hoverCta ? "#a7f3d0" : "#6ee7b7",
              }}
            >
              {cta.label} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ExecutiveInsightCard });
