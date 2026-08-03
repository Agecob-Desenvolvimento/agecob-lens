/* ============================================================
   AgDash — RitmoDiaHeatmap (Acordos do dia — card por hora)
   ============================================================ */

function SectionHeader({ title, unit, description, actions }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      gap: 24, paddingBottom: 12, borderBottom: "1px solid #e2e8f0",
    }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", color: "#0f172a", margin: 0,
          }}>{title}</h3>
          {unit && (
            <span style={{
              display: "inline-flex", alignItems: "center",
              padding: "2px 6px", borderRadius: 2,
              background: "#f1f5f9", color: "#475569",
              fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500,
            }}>{unit}</span>
          )}
        </div>
        {description && (
          <p style={{ marginTop: 4, fontSize: 13, color: "#64748b", lineHeight: 1.5, maxWidth: 560 }}>{description}</p>
        )}
      </div>
      {actions && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {actions.map((a, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ color: "#cbd5e1" }}>·</span>}
              <button style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 12, color: "#64748b", textDecoration: "underline",
                textDecorationColor: "#cbd5e1", textUnderlineOffset: 3,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "#0f172a"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#64748b"; }}
              >{a}</button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function RitmoDiaHeatmap() {
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  const currentHour = 8; // Only 8h has data so far

  // Acordos do dia — single metric per hour
  const hourData = {
    8:  { esp: 2, real: 0, acum: 0, delta: -2 },
    9:  { esp: 2, real: null, acum: null, delta: null },
    10: { esp: 2, real: null, acum: null, delta: null },
    11: { esp: 2, real: null, acum: null, delta: null },
    12: { esp: 2, real: null, acum: null, delta: null },
    13: { esp: 2, real: null, acum: null, delta: null },
    14: { esp: 2, real: null, acum: null, delta: null },
    15: { esp: 2, real: null, acum: null, delta: null },
    16: { esp: 2, real: null, acum: null, delta: null },
    17: { esp: 2, real: null, acum: null, delta: null },
    18: { esp: 2, real: null, acum: null, delta: null },
    19: { esp: 2, real: null, acum: null, delta: null },
  };

  const acumuladoAtual = 0;
  const faixa = "Basal";
  const dPlus = "D+21";
  const projecaoFechamento = 22;
  const esperadoTotal = 24;

  // Indicator color: red = below, yellow = on target (±10%), green = above, gray = no data
  const getDotColor = (d) => {
    if (d.real == null) return null; // no data yet
    if (d.delta == null) return null;
    if (d.delta < 0) return "#ef4444"; // red
    if (d.delta === 0) return "#eab308"; // yellow
    return "#22c55e"; // green
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 }}>
      {/* Header */}
      <div style={{ marginBottom: 4 }}>
        <h4 style={{
          fontSize: 13, fontWeight: 700, letterSpacing: "0.12em",
          textTransform: "uppercase", color: "#0f172a", margin: 0,
        }}>Ritmo de acordos do dia baseado em dias semelhantes</h4>
        <p style={{
          fontSize: 12, color: "#64748b", marginTop: 4,
          fontVariantNumeric: "tabular-nums",
        }}>
          Faixa: {faixa} · {dPlus} · Projeção fechamento:{" "}
          <span style={{ fontWeight: 600, color: "#334155" }}>{projecaoFechamento}</span>
          {" · Esperado total: "}
          <span style={{ fontWeight: 600, color: "#334155" }}>{esperadoTotal}</span>
        </p>
      </div>

      {/* Hour cards grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${hours.length}, minmax(68px, 1fr))`,
        gap: 6,
        marginTop: 12,
        overflowX: "auto",
      }}>
        {hours.map(h => {
          const d = hourData[h];
          const hasData = d && d.real != null;
          const dotColor = d ? getDotColor(d) : null;
          const isActive = h <= currentHour && hasData;

          return (
            <div key={h} style={{
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              padding: "8px 8px 6px",
              background: isActive ? "#fff" : "#f8fafc",
              textAlign: "center",
              fontSize: 11,
              fontVariantNumeric: "tabular-nums",
              color: hasData ? "#334155" : "#94a3b8",
              position: "relative",
            }}>
              {/* Hour label */}
              <div style={{
                fontWeight: 700, fontSize: 12,
                color: isActive ? "#0f172a" : "#64748b",
                marginBottom: 4,
              }}>{h}h</div>

              {/* Expected */}
              <div style={{ lineHeight: 1.5 }}>
                <span style={{ color: "#94a3b8" }}>esp </span>
                <span style={{ fontWeight: 500 }}>{d?.esp ?? "—"}</span>
              </div>

              {/* Actual */}
              <div style={{ lineHeight: 1.5 }}>
                <span style={{ color: "#94a3b8" }}>real </span>
                <span style={{ fontWeight: 600, color: hasData ? "#0f172a" : "#94a3b8" }}>
                  {hasData ? d.real : "—"}
                </span>
              </div>

              {/* Accumulated */}
              <div style={{ lineHeight: 1.5 }}>
                <span style={{ color: "#94a3b8" }}>acum </span>
                <span style={{ fontWeight: 500 }}>
                  {hasData ? d.acum : "—"}
                </span>
              </div>

              {/* Delta indicator */}
              {hasData && d.delta != null && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 4, marginTop: 4,
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: dotColor,
                    display: "inline-block",
                  }}></span>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: d.delta < 0 ? "#dc2626" : d.delta > 0 ? "#16a34a" : "#ca8a04",
                  }}>
                    {d.delta > 0 ? "+" : ""}{d.delta}
                  </span>
                </div>
              )}

              {/* Pending indicator for future hours */}
              {!hasData && (
                <div style={{ marginTop: 4, fontSize: 10, color: "#cbd5e1" }}>·</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Accumulated footer */}
      <div style={{
        marginTop: 10, fontSize: 12,
        color: "#2563eb", fontWeight: 600,
      }}>
        Acumulado atual: {acumuladoAtual}
      </div>
    </div>
  );
}

Object.assign(window, { SectionHeader, RitmoDiaHeatmap });
