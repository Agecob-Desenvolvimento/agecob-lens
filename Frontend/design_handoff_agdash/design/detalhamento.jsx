/* ============================================================
   AgDash — Detalhamento Agentes Page (reorganized)
   Bloco 1: Diagnóstico Individual
   Bloco 2: Contexto Comparativo
   Bloco 3: Ação
   ============================================================ */

// ---------- Agent Filter Bar (replaces sidebar) ----------
function AgentFilterBar({ agents, selected, onSelect }) {
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const filtered = agents.filter(a => a.toLowerCase().includes(search.toLowerCase()));

  React.useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayName = selected || "Todos os agentes";

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", maxWidth: 360 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6,
        background: "#fff", cursor: "pointer", fontSize: 13, color: "#0f172a",
        fontWeight: selected ? 600 : 400,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 150ms" }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)", maxHeight: 320, display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>
            <input type="text" placeholder="Buscar agente..." value={search} onChange={e => setSearch(e.target.value)}
              autoFocus
              style={{
                width: "100%", border: "1px solid #e2e8f0", borderRadius: 4,
                padding: "6px 8px", fontSize: 12, outline: "none", color: "#0f172a",
              }}
            />
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "4px" }}>
            <button onClick={() => { onSelect(null); setOpen(false); setSearch(""); }} style={{
              display: "block", width: "100%", textAlign: "left", padding: "6px 10px",
              border: "none", cursor: "pointer", borderRadius: 4,
              background: selected === null ? "#eff6ff" : "transparent",
              color: selected === null ? "#2563eb" : "#f59e0b",
              fontSize: 12, fontWeight: selected === null ? 600 : 500,
            }}>Todos</button>
            {filtered.map(a => (
              <button key={a} onClick={() => { onSelect(a); setOpen(false); setSearch(""); }} style={{
                display: "block", width: "100%", textAlign: "left", padding: "5px 10px",
                border: "none", cursor: "pointer", borderRadius: 4,
                background: selected === a ? "#eff6ff" : "transparent",
                color: selected === a ? "#2563eb" : "#334155",
                fontSize: 12, fontWeight: selected === a ? 600 : 400,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
              onMouseEnter={e => { if (selected !== a) e.currentTarget.style.background = "#f8fafc"; }}
              onMouseLeave={e => { if (selected !== a) e.currentTarget.style.background = "transparent"; }}
              >{a}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Detalhamento KPI Strip ----------
function DetalhamentoKpiStrip() {
  const { primary, secondary } = MOCK_DETALHAMENTO_KPIS;
  const fmt = (kpi) => {
    if (kpi.unit === "BRL") return formatBRLCompact(kpi.value, "full");
    if (kpi.unit === "%") return formatPercent(kpi.value);
    if (kpi.unit === "count") return formatNumber(kpi.value);
    return String(kpi.value);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {primary.map(kpi => (
          <div key={kpi.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>{kpi.label}</div>
            <div style={{ marginTop: 6, fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#0f172a", lineHeight: 1 }}>{fmt(kpi)}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
        {secondary.map(kpi => (
          <div key={kpi.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>{kpi.label}</div>
            <div style={{ marginTop: 4, fontSize: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "#0f172a", lineHeight: 1 }}>{fmt(kpi)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Block Headers ----------
function BlockHeader({ number, title, description }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10, borderBottom: "2px solid #e2e8f0", marginBottom: 16 }}>
      <span style={{
        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700, background: "#0f172a", color: "#fff",
      }}>{number}</span>
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#0f172a", margin: 0 }}>{title}</h3>
        {description && <p style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{description}</p>}
      </div>
    </div>
  );
}

// ---------- Expandable Performance Table ----------
function ExpandablePerformanceTable() {
  const [expanded, setExpanded] = React.useState(false);
  const [sortCol, setSortCol] = React.useState("acionamentos");
  const [sortDir, setSortDir] = React.useState("desc");

  const sorted = [...MOCK_PERFORMANCE_TABLE].sort((a, b) => {
    const va = a[sortCol], vb = b[sortCol];
    if (typeof va === "string") return sortDir === "desc" ? vb.localeCompare(va) : va.localeCompare(vb);
    return sortDir === "desc" ? vb - va : va - vb;
  });

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const cols = [
    { key: "agente", label: "Agente", align: "left", fmt: v => v, w: 180 },
    { key: "mat", label: "Matrícula", align: "left", fmt: v => v, w: 70 },
    { key: "acionamentos", label: "Acion.", align: "right", fmt: formatNumber },
    { key: "cpc", label: "CPC %", align: "right", fmt: v => v.toFixed(1).replace(".", ",") + "%" },
    { key: "acordos", label: "Acordos", align: "right", fmt: formatNumber },
    { key: "conversao", label: "Conv. %", align: "right", fmt: v => v.toFixed(1).replace(".", ",") + "%" },
    { key: "valorTotal", label: "Valor Total", align: "right", fmt: v => formatBRLCompact(v, "full") },
    { key: "primeiraParcela", label: "1ª Parcela", align: "right", fmt: v => formatBRLCompact(v, "full") },
    { key: "reprovados", label: "Reprov.", align: "right", fmt: formatNumber },
    { key: "excecoes", label: "Exc.", align: "right", fmt: formatNumber },
    { key: "valorExcecoes", label: "Valor Exc.", align: "right", fmt: v => formatBRLCompact(v, "full") },
  ];

  const [hovRow, setHovRow] = React.useState(null);

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
      <button onClick={() => setExpanded(e => !e)} style={{
        width: "100%", padding: "12px 20px", border: "none", cursor: "pointer",
        background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: expanded ? "1px solid #e2e8f0" : "none",
      }}>
        <div style={{ textAlign: "left" }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: 0 }}>Performance por Agente — 2026-05-01 a 2026-05-20</h4>
          <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{expanded ? "Clique para recolher" : "Clique para expandir · Dados brutos da operação"}</p>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms ease" }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      {expanded && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1060, fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {cols.map(c => (
                  <th key={c.key} onClick={() => typeof sorted[0]?.[c.key] === "number" && toggleSort(c.key)} style={{
                    textAlign: c.align, padding: "8px 8px", fontSize: 10, fontWeight: 600,
                    letterSpacing: "0.1em", textTransform: "uppercase", color: "#64748b",
                    background: "#f8fafc", borderBottom: "1px solid #e2e8f0",
                    cursor: typeof sorted[0]?.[c.key] === "number" ? "pointer" : "default",
                    whiteSpace: "nowrap", width: c.w || "auto", userSelect: "none",
                  }}>
                    {c.label}{sortCol === c.key && <span style={{ marginLeft: 3 }}>{sortDir === "desc" ? "↓" : "↑"}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr key={i} onMouseEnter={() => setHovRow(i)} onMouseLeave={() => setHovRow(null)}
                  style={{ background: hovRow === i ? "#f8fafc" : "transparent" }}>
                  {cols.map(c => (
                    <td key={c.key} style={{
                      padding: "8px 8px", borderBottom: "1px solid #f1f5f9",
                      textAlign: c.align, fontVariantNumeric: "tabular-nums",
                      color: c.key === "agente" ? "#0f172a" : "#334155",
                      fontWeight: c.key === "agente" ? 500 : 400, whiteSpace: "nowrap",
                      overflow: "hidden", textOverflow: "ellipsis", maxWidth: c.key === "agente" ? 180 : "none",
                    }}>
                      {c.key === "reprovados" && row[c.key] > 5
                        ? <span style={{ color: "#dc2626", fontWeight: 600 }}>{c.fmt(row[c.key])}</span>
                        : c.fmt(row[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Page Assembly ----------
function DetalhamentoAgentesPage() {
  const [selectedAgent, setSelectedAgent] = React.useState(null);

  return (
    <div style={{ flex: 1, minWidth: 0, padding: "24px 24px 48px", display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Agent filter bar */}
      <AgentFilterBar agents={MOCK_AGENTS_LIST} selected={selectedAgent} onSelect={setSelectedAgent} />
        {/* KPIs */}
        <DetalhamentoKpiStrip />

        {/* Bloco 1 — Diagnóstico Individual */}
        <div>
          <BlockHeader number="1" title="Diagnóstico Individual" description="Entender o porquê do desempenho — funil de conversão e performance vs meta" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FunilConversao />
            <BulletChartsPanel />
          </div>
        </div>

        {/* Bloco 2 — Contexto Comparativo */}
        <div>
          <BlockHeader number="2" title="Contexto Comparativo" description="Onde cada agente está no time — padrões visuais e validação estatística" />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <PerformanceHeatmap />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <ImprovedScatterPlot />
              <RegressionView />
            </div>
          </div>
        </div>

        {/* Bloco 3 — Ação */}
        <div>
          <BlockHeader number="3" title="Ação" description="Quem atender primeiro — fila de prioridade e concentração de resultado" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <RankingPrioridade />
            <ParetoChart />
          </div>
        </div>

        {/* Tabela colapsável removida — dados brutos acessíveis via heatmap */}
      </div>
  );
}

Object.assign(window, { DetalhamentoAgentesPage });
