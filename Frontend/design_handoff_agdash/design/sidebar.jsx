/* ============================================================
   AgDash — Sidebar + Topbar
   ============================================================ */

// ---------- SVG Icon helpers ----------
const SidebarIcons = {
  layout: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18M9 21V9"/>
    </svg>
  ),
  "bar-chart": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20V10M18 20V4M6 20v-4"/>
    </svg>
  ),
  users: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  user: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  trending: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  search: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
    </svg>
  ),
  file: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  ),
};

function Sidebar({ activeNav, onNavChange, collapsed, onToggle }) {
  const levelLabels = { 1: "SÍNTESE", 2: "ANÁLISE", 3: "DETALHE" };
  let lastLevel = 0;

  return (
    <aside style={{
      width: collapsed ? 56 : 220,
      minHeight: "100vh",
      background: "#fff",
      borderRight: "1px solid #e2e8f0",
      display: "flex",
      flexDirection: "column",
      transition: "width 200ms ease",
      flexShrink: 0,
      overflow: "hidden",
      position: "sticky",
      top: 0,
      alignSelf: "flex-start",
      height: "100vh",
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? "20px 12px" : "20px 20px",
        borderBottom: "1px solid #e2e8f0",
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
      }} onClick={onToggle}>
        <img src={window.__resources && window.__resources.agecobLogo || "design/agecob-logo.jpg"} alt="AgDash" style={{ width: 32, height: 32, borderRadius: 6 }} />
        {!collapsed && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em" }}>AgDash</div>
            <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase" }}>Executivo</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: collapsed ? "12px 6px" : "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map((item, i) => {
          const showLabel = item.level !== lastLevel;
          lastLevel = item.level;
          const isActive = activeNav === item.id;
          return (
            <React.Fragment key={item.id}>
              {showLabel && !collapsed && (
                <div style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: "#94a3b8", padding: "12px 10px 4px", marginTop: i > 0 ? 4 : 0,
                }}>
                  {levelLabels[item.level]}
                </div>
              )}
              <button
                onClick={() => onNavChange(item.id)}
                title={collapsed ? item.label : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: collapsed ? "8px 0" : "7px 10px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  borderRadius: 6, border: "none", cursor: "pointer",
                  background: isActive ? "#f1f5f9" : "transparent",
                  color: isActive ? "#0f172a" : "#64748b",
                  fontSize: 13, fontWeight: isActive ? 600 : 500,
                  width: "100%", textAlign: "left",
                  transition: "all 120ms ease",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#f8fafc"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ opacity: isActive ? 1 : 0.6, flexShrink: 0 }}>{SidebarIcons[item.icon]}</span>
                {!collapsed && <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div style={{ padding: "16px 20px", borderTop: "1px solid #e2e8f0", fontSize: 10, color: "#94a3b8" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>v6dc8896</div>
          <div>Grupo Agecob</div>
        </div>
      )}
    </aside>
  );
}

function Topbar({ title, subtitle }) {
  const [period] = React.useState({ from: "01/05/2026", to: "19/05/2026" });
  const [category, setCategory] = React.useState("Todas");

  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 24px", background: "#fff",
      borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", margin: 0 }}>{title}</h1>
        {subtitle && (
          <span style={{
            fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
            color: "#94a3b8", background: "#f1f5f9",
            padding: "2px 8px", borderRadius: 4,
          }}>{subtitle}</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Date range */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#475569" }}>
          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>De</span>
          <span style={{
            padding: "5px 10px", border: "1px solid #e2e8f0", borderRadius: 6,
            fontSize: 13, color: "#334155", fontVariantNumeric: "tabular-nums",
          }}>{period.from}</span>
          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>Até</span>
          <span style={{
            padding: "5px 10px", border: "1px solid #e2e8f0", borderRadius: 6,
            fontSize: 13, color: "#334155", fontVariantNumeric: "tabular-nums",
          }}>{period.to}</span>
        </div>
        {/* Category filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 6, overflow: "hidden", border: "1px solid #e2e8f0" }}>
          {["Todas", "AUTOS", "CONSUMER"].map(cat => (
            <button key={cat} onClick={() => setCategory(cat)} style={{
              padding: "6px 14px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
              background: category === cat ? "#0f172a" : "#fff",
              color: category === cat ? "#fff" : "#64748b",
              transition: "all 120ms ease",
            }}>{cat}</button>
          ))}
        </div>
      </div>
    </header>
  );
}

Object.assign(window, { Sidebar, Topbar });
