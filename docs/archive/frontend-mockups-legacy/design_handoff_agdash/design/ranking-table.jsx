/* ============================================================
   AgDash — ExecutiveRankingTable
   ============================================================ */

const RankingIcons = {
  externalLink: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 3h6v6M10 14L21 3M21 14v7H3V3h7"/>
    </svg>
  ),
  compare: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12h6M15 12h6M9 4l-6 8 6 8M15 4l6 8-6 8"/>
    </svg>
  ),
  phone: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  ),
  alertTriangle: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <path d="M12 9v4M12 17h.01"/>
    </svg>
  ),
};

function ExecutiveRankingTable() {
  const [hoveredRow, setHoveredRow] = React.useState(null);
  const mediana = 50309.71; // pre-calculated

  const thStyle = {
    textAlign: "left", padding: "10px 12px",
    fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
    textTransform: "uppercase", color: "#64748b",
    background: "#f8fafc", borderBottom: "1px solid #e2e8f0",
  };

  const tdStyle = {
    padding: "12px", borderBottom: "1px solid #f1f5f9",
    verticalAlign: "middle",
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "14px 20px", borderBottom: "1px solid #e2e8f0",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <h4 style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", margin: 0 }}>
            Top 10 Agentes por Valor de Acordos
          </h4>
          <p style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            Período: 01/05 → 19/05 · Categoria: Todas
          </p>
        </div>
        <button style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 12, color: "#64748b", textDecoration: "underline",
          textDecorationColor: "#cbd5e1", textUnderlineOffset: 3,
        }}
        onMouseEnter={e => e.currentTarget.style.color = "#0f172a"}
        onMouseLeave={e => e.currentTarget.style.color = "#64748b"}
        >Ver todos</button>
      </div>

      {/* Table */}
      <table style={{ width: "100%", fontSize: 13.5, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 48, paddingLeft: 20 }}>#</th>
            <th style={thStyle}>Agente</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Valor Acordos</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Qtd Acordos</th>
            <th style={{ ...thStyle, textAlign: "right" }}>vs Mediana</th>
            <th style={{ ...thStyle, textAlign: "right", width: 120, paddingRight: 20 }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {MOCK_RANKING.map((row) => {
            const isTop3 = row.rank <= 3;
            const isHovered = hoveredRow === row.rank;

            return (
              <tr
                key={row.rank}
                onMouseEnter={() => setHoveredRow(row.rank)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  background: isHovered ? "#f8fafc" : "transparent",
                  transition: "background 80ms ease",
                }}
              >
                {/* Rank */}
                <td style={{ ...tdStyle, paddingLeft: 20 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 24, height: 24, borderRadius: "50%",
                    fontSize: 11, fontVariantNumeric: "tabular-nums",
                    background: isTop3 ? "#d1fae5" : "#f1f5f9",
                    color: isTop3 ? "#065f46" : "#475569",
                    fontWeight: isTop3 ? 700 : 600,
                  }}>{row.rank}</span>
                </td>

                {/* Agent */}
                <td style={tdStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 500, color: "#0f172a" }}>{row.name}</span>
                    {row.excecao && (
                      <span title={`Taxa de exceção: ${row.excecao}%`} style={{ color: "#e11d48", display: "flex" }}>
                        {RankingIcons.alertTriangle}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 11, color: "#64748b",
                    fontFamily: "'JetBrains Mono', monospace", marginTop: 2,
                  }}>
                    mat. {row.mat} · {row.bu}
                    {row.excecao && <span style={{ color: "#e11d48" }}> · exceção {row.excecao}%</span>}
                  </div>
                </td>

                {/* Valor */}
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#0f172a" }}>
                  {formatBRLCompact(row.valor, "full")}
                </td>

                {/* Qtd */}
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#334155" }}>
                  {row.qtd}
                </td>

                {/* vs Mediana */}
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <VsMedianaBadge value={row.vsMediana} />
                </td>

                {/* Actions */}
                <td style={{ ...tdStyle, textAlign: "right", paddingRight: 20 }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    opacity: isHovered ? 1 : 0.5,
                    transition: "opacity 120ms ease",
                  }}>
                    <ActionBtn icon={RankingIcons.externalLink} title="Abrir ficha" />
                    <ActionBtn icon={RankingIcons.compare} title="Comparar" />
                    <ActionBtn icon={RankingIcons.phone} title="Acionar" />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function VsMedianaBadge({ value }) {
  const pct = Math.round(value * 100);
  const isPositive = pct > 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums",
      background: isPositive ? "#ecfdf5" : (pct < 0 ? "#fff1f2" : "#f1f5f9"),
      color: isPositive ? "#047857" : (pct < 0 ? "#be123c" : "#475569"),
    }}>
      {isPositive && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M7 17l10-10M17 17V7H7"/>
        </svg>
      )}
      {pct}%
    </span>
  );
}

function ActionBtn({ icon, title }) {
  const [h, setH] = React.useState(false);
  return (
    <button
      title={title}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        padding: 6, borderRadius: 4, border: "none", cursor: "pointer",
        background: h ? "#e2e8f0" : "transparent",
        color: h ? "#0f172a" : "#64748b",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 80ms ease",
      }}
    >{icon}</button>
  );
}

Object.assign(window, { ExecutiveRankingTable });
