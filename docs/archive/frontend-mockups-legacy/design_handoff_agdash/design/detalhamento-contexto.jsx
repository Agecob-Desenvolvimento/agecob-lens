/* ============================================================
   AgDash — Bloco 2: Contexto Comparativo
   Heatmap de Performance + Scatter Melhorado + Regressão
   ============================================================ */

// ---------- Heatmap de Performance (Agentes × Métricas) ----------
function PerformanceHeatmap() {
  const allAgents = MOCK_AGENTS_ENRICHED.slice(0, 14);
  const metrics = [
    { key: "cpc", label: "CPC %", fmt: v => v.toFixed(1) + "%", norm: "cpcNorm" },
    { key: "conversao", label: "Conv. %", fmt: v => v.toFixed(1) + "%", norm: "convNorm" },
    { key: "valorTotal", label: "Valor Acordos", fmt: v => formatBRLCompact(v), normCustom: "valorTotal" },
    { key: "qtdContatos", label: "Contatos", fmt: v => formatNumber(v), normCustom: "qtdContatos" },
    { key: "excPct", label: "Exc.%", fmt: v => v.toFixed(1) + "%", norm: "excNorm", invert: true },
    { key: "primeiraParcela", label: "1ªParc.", fmt: v => formatBRLCompact(v), normCustom: "primeiraParcela" },
  ];

  const [hovered, setHovered] = React.useState(null);
  const [sortCol, setSortCol] = React.useState(null);
  const [sortDir, setSortDir] = React.useState("desc");

  const toggleSort = (key) => {
    if (sortCol === key) {
      if (sortDir === "desc") {
        setSortDir("asc");
      } else {
        // Third click: reset
        setSortCol(null);
        setSortDir("desc");
      }
    } else {
      setSortCol(key);
      setSortDir("desc");
    }
  };

  const agents = React.useMemo(() => {
    if (!sortCol) return allAgents;
    return [...allAgents].sort((a, b) => {
      const va = a[sortCol] ?? 0;
      const vb = b[sortCol] ?? 0;
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [sortCol, sortDir]);

  const cellColor = (normVal, invert) => {
    const v = invert ? (normVal > 0 ? 2 - normVal : 1) : normVal;
    if (v >= 0.9) return { bg: "#dcfce7", color: "#166534" };
    if (v >= 0.7) return { bg: "#fef9c3", color: "#854d0e" };
    return { bg: "#fee2e2", color: "#991b1b" };
  };

  const getNorm = (agent, metric) => {
    if (metric.normCustom) {
      const key = metric.normCustom;
      const maxVal = Math.max(...agents.map(a => a[key] || 0));
      return maxVal > 0 ? (agent[key] || 0) / maxVal : 0;
    }
    return agent[metric.norm] || 0;
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 }}>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: 0 }}>Heatmap de Performance</h4>
      <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Agentes × Métricas · Cor por desempenho vs meta · Clique no cabeçalho da coluna para ordenar</p>
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <div style={{
          display: "grid", gap: 2,
          gridTemplateColumns: `160px repeat(${metrics.length}, minmax(72px, 1fr))`,
          fontSize: 11,
        }}>
          {/* Header */}
          <div></div>
          {metrics.map(m => (
            <button key={m.key}
              onClick={() => toggleSort(m.key)}
              style={{
                textAlign: "center", fontWeight: 600,
                color: sortCol === m.key ? "#0f172a" : "#64748b",
                fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
                paddingBottom: 4, background: "none", border: "none",
                cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 3, userSelect: "none",
              }}
            >
              {m.label}
              {sortCol === m.key && (
                <span style={{ fontSize: 11 }}>{sortDir === "desc" ? "↓" : "↑"}</span>
              )}
            </button>
          ))}
          {/* Rows */}
          {agents.map((a, ai) => (
            <React.Fragment key={a.agente}>
              <div style={{
                fontSize: 11, fontWeight: 500, color: "#0f172a",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                alignSelf: "center", paddingRight: 6,
                background: hovered === ai ? "#f8fafc" : "transparent",
                borderRadius: 3, padding: "4px 6px",
              }}>{a.agente.split(/\s+/).slice(0, 2).join(" ")}</div>
              {metrics.map(m => {
                const val = m.key === "ticketMedio" ? a.ticketMedio : a[m.key];
                const norm = getNorm(a, m);
                const c = cellColor(norm, m.invert);
                const isActiveCol = sortCol === m.key;
                return (
                  <div key={m.key}
                    onMouseEnter={() => setHovered(ai)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      height: 30, borderRadius: 3,
                      background: c.bg, color: c.color,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 600, fontVariantNumeric: "tabular-nums",
                      cursor: norm < 0.7 ? "pointer" : "default",
                      transition: "transform 80ms ease",
                      transform: hovered === ai ? "scale(1.02)" : "scale(1)",
                      outline: isActiveCol ? "2px solid rgba(15,23,42,0.12)" : "none",
                      outlineOffset: -1,
                    }}
                  >{m.fmt(val)}</div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      {/* Legend */}
      <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 10, color: "#64748b" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#dcfce7" }}></span>≥90% da meta</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#fef9c3" }}></span>70–90%</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#fee2e2" }}></span>&lt;70% (ação)</span>
      </div>
    </div>
  );
}

// ---------- Scatter Plot Melhorado (Eficiência × Resultado × Exceções) ----------
function ImprovedScatterPlot() {
  const data = MOCK_AGENTS_ENRICHED;
  const W = 720, H = 320, PAD = { l: 60, r: 24, t: 16, b: 44 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const maxEff = Math.max(...data.map(d => d.efficiency)) * 1.1;
  const maxY = Math.max(...data.map(d => d.valorTotal)) * 1.1;
  const medEff = data.reduce((s, d) => s + d.efficiency, 0) / data.length;
  const medY = data.reduce((s, d) => s + d.valorTotal, 0) / data.length;

  const toX = v => PAD.l + (v / maxEff) * plotW;
  const toY = v => PAD.t + plotH - (v / maxY) * plotH;
  const [hov, setHov] = React.useState(null);

  const dotColor = (a) => {
    if (a.excPct > 15) return "#ef4444";
    if (a.excPct > 5) return "#f59e0b";
    return "#22c55e";
  };
  const dotR = (a) => Math.max(4, Math.min(12, Math.sqrt(a.acordos) * 1.8));

  const yTicks = [0, maxY * 0.25, maxY * 0.5, maxY * 0.75, maxY];
  const xTicks = [0, maxEff * 0.25, maxEff * 0.5, maxEff * 0.75, maxEff];

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 }}>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: 0 }}>Eficiência × Resultado × Qualidade</h4>
      <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
        X: CPC×Conversão (eficiência) · Y: Valor Acordos · Cor: % exceções · Tamanho: qtd acordos
      </p>
      <div style={{ display: "flex", gap: 14, marginTop: 4, fontSize: 10, color: "#64748b" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }}></span>exc &lt;5%</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }}></span>5–15%</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }}></span>&gt;15%</span>
      </div>
      <svg width={W} height={H} style={{ display: "block", marginTop: 8 }}>
        {/* Grid */}
        {yTicks.map((v, i) => (
          <g key={`y${i}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={toY(v)} y2={toY(v)} stroke="#f1f5f9" strokeWidth="1"/>
            <text x={PAD.l - 6} y={toY(v) + 3} textAnchor="end" fontSize="9" fill="#94a3b8" fontFamily="Inter">
              {v < 1000 ? "R$ 0" : `R$ ${(v / 1000).toFixed(0)}k`}
            </text>
          </g>
        ))}
        {xTicks.map((v, i) => (
          <g key={`x${i}`}>
            <line x1={toX(v)} x2={toX(v)} y1={PAD.t} y2={H - PAD.b} stroke="#f1f5f9" strokeWidth="1"/>
            <text x={toX(v)} y={H - PAD.b + 14} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="Inter">{v.toFixed(1)}</text>
          </g>
        ))}
        {/* Medians */}
        <line x1={toX(medEff)} x2={toX(medEff)} y1={PAD.t} y2={H - PAD.b} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4"/>
        <line x1={PAD.l} x2={W - PAD.r} y1={toY(medY)} y2={toY(medY)} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4"/>
        {/* Axis labels */}
        <text x={W / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="#64748b" fontFamily="Inter">Eficiência (CPC × Conversão)</text>
        <text x={10} y={H / 2} textAnchor="middle" fontSize="10" fill="#64748b" fontFamily="Inter" transform={`rotate(-90, 10, ${H / 2})`}>Valor Acordos</text>
        {/* Points */}
        {data.map((d, i) => (
          <circle key={i} cx={toX(d.efficiency)} cy={toY(d.valorTotal)} r={hov === i ? dotR(d) + 2 : dotR(d)}
            fill={dotColor(d)} opacity={hov === i ? 1 : 0.75}
            stroke={hov === i ? "#0f172a" : "none"} strokeWidth="2"
            style={{ cursor: "pointer", transition: "r 80ms" }}
            onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}
          />
        ))}
        {/* Tooltip */}
        {hov !== null && (() => {
          const d = data[hov];
          const tx = Math.min(toX(d.efficiency) + 12, W - 190);
          const ty = Math.max(toY(d.valorTotal) - 44, PAD.t);
          return (
            <g>
              <rect x={tx} y={ty} width={176} height={40} rx="4" fill="#0f172a" opacity="0.92"/>
              <text x={tx + 8} y={ty + 14} fontSize="11" fill="#e2e8f0" fontFamily="Inter">{d.agente.substring(0, 24)}</text>
              <text x={tx + 8} y={ty + 28} fontSize="10" fill="#94a3b8" fontFamily="'JetBrains Mono', monospace">
                eff: {d.efficiency.toFixed(2)} · {formatBRLCompact(d.valorTotal)} · exc: {d.excPct.toFixed(1)}%
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// ---------- Regressão de Desempenho ----------
function RegressionView() {
  const data = MOCK_AGENTS_ENRICHED;
  const reg = linearRegression(data, "efficiency", "valorTotal");
  const W = 720, H = 280, PAD = { l: 60, r: 24, t: 16, b: 44 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const maxEff = Math.max(...data.map(d => d.efficiency)) * 1.1;
  const maxY = Math.max(...data.map(d => d.valorTotal)) * 1.1;
  const toX = v => PAD.l + (v / maxEff) * plotW;
  const toY = v => PAD.t + plotH - (v / maxY) * plotH;
  const [hov, setHov] = React.useState(null);

  // Regression line points
  const x0 = 0, x1 = maxEff;
  const ry0 = reg.intercept, ry1 = reg.slope * x1 + reg.intercept;
  // Confidence band (~std error)
  const residuals = data.map(d => d.valorTotal - (reg.slope * d.efficiency + reg.intercept));
  const stdErr = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / (data.length - 2));
  const band = stdErr * 1.96;

  const ptColor = (d) => {
    const predicted = reg.slope * d.efficiency + reg.intercept;
    const residual = d.valorTotal - predicted;
    if (residual > band) return "#22c55e"; // overperforming
    if (residual < -band) return "#ef4444"; // underperforming
    return "#94a3b8"; // expected
  };

  const n = data.length;
  const periodDays = 20;

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: 0 }}>Regressão de Desempenho</h4>
          <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
            Desempenho real vs previsto pelo modelo. Pontos fora da banda = super/sub-performing.
          </p>
        </div>
        {/* Model metrics */}
        <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{reg.r2.toFixed(2)}</div>
            <div style={{ color: "#64748b" }}>R²</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{n}</div>
            <div style={{ color: "#64748b" }}>N agentes</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{periodDays}d</div>
            <div style={{ color: "#64748b" }}>Período</div>
          </div>
        </div>
      </div>
      {periodDays < 8 && (
        <div style={{ padding: "6px 10px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 4, fontSize: 11, color: "#92400e", marginBottom: 10 }}>
          ⚠ Período curto — tendência sujeita a ruído
        </div>
      )}
      {/* Legend */}
      <div style={{ display: "flex", gap: 14, fontSize: 10, color: "#64748b", marginBottom: 8 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }}></span>superperforming</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#94a3b8" }}></span>dentro do esperado</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }}></span>subperforming</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 40, height: 10, background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 2 }}></span>IC 95%</span>
      </div>
      <svg width={W} height={H} style={{ display: "block" }}>
        {/* Confidence band */}
        <polygon
          points={`${toX(x0)},${toY(ry0 + band)} ${toX(x1)},${toY(ry1 + band)} ${toX(x1)},${toY(ry1 - band)} ${toX(x0)},${toY(ry0 - band)}`}
          fill="rgba(59,130,246,0.1)" stroke="rgba(59,130,246,0.25)" strokeWidth="1"
        />
        {/* Regression line */}
        <line x1={toX(x0)} y1={toY(ry0)} x2={toX(x1)} y2={toY(ry1)} stroke="#3b82f6" strokeWidth="2" strokeDasharray="6 3"/>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <g key={`g${f}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={toY(maxY * f)} y2={toY(maxY * f)} stroke="#f1f5f9" strokeWidth="1"/>
            <text x={PAD.l - 6} y={toY(maxY * f) + 3} textAnchor="end" fontSize="9" fill="#94a3b8" fontFamily="Inter">
              {maxY * f < 1000 ? "0" : `R$ ${(maxY * f / 1000).toFixed(0)}k`}
            </text>
          </g>
        ))}
        {/* Axis labels */}
        <text x={W / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="#64748b" fontFamily="Inter">Índice de Eficiência (CPC × Conversão)</text>
        <text x={10} y={H / 2} textAnchor="middle" fontSize="10" fill="#64748b" fontFamily="Inter" transform={`rotate(-90, 10, ${H / 2})`}>Valor Acordos</text>
        {/* Points */}
        {data.map((d, i) => (
          <circle key={i} cx={toX(d.efficiency)} cy={toY(d.valorTotal)} r={hov === i ? 7 : 5}
            fill={ptColor(d)} opacity={hov === i ? 1 : 0.8}
            stroke={hov === i ? "#0f172a" : "none"} strokeWidth="2"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}
          />
        ))}
        {hov !== null && (() => {
          const d = data[hov];
          const predicted = reg.slope * d.efficiency + reg.intercept;
          const residual = d.valorTotal - predicted;
          const tx = Math.min(toX(d.efficiency) + 12, W - 200);
          const ty = Math.max(toY(d.valorTotal) - 50, PAD.t);
          return (
            <g>
              <rect x={tx} y={ty} width={188} height={46} rx="4" fill="#0f172a" opacity="0.92"/>
              <text x={tx + 8} y={ty + 14} fontSize="11" fill="#e2e8f0" fontFamily="Inter">{d.agente.substring(0, 26)}</text>
              <text x={tx + 8} y={ty + 28} fontSize="10" fill="#94a3b8" fontFamily="'JetBrains Mono'">
                real: {formatBRLCompact(d.valorTotal)} · prev: {formatBRLCompact(predicted)}
              </text>
              <text x={tx + 8} y={ty + 40} fontSize="10" fill={residual >= 0 ? "#6ee7b7" : "#fca5a5"} fontFamily="'JetBrains Mono'">
                desvio: {residual >= 0 ? "+" : ""}{formatBRLCompact(residual)}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

Object.assign(window, { PerformanceHeatmap, ImprovedScatterPlot, RegressionView });
