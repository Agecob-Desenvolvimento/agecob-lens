/* ============================================================
   AgDash — Bloco 3: Ação
   Ranking de Prioridade + Pareto 80/20
   ============================================================ */

// ---------- Mini Sparkline ----------
function Sparkline({ data, width = 56, height = 20, color = "#64748b" }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 2) - 1}`).join(" ");
  const trend = data[data.length - 1] > data[0] ? "#16a34a" : data[data.length - 1] < data[0] ? "#ef4444" : "#64748b";

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke={trend} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={(data.length - 1) * step} cy={height - ((data[data.length - 1] - min) / range) * (height - 2) - 1} r="2" fill={trend}/>
    </svg>
  );
}

// ---------- Ranking de Prioridade de Intervenção ----------
function RankingPrioridade() {
  const sorted = [...MOCK_AGENTS_ENRICHED].sort((a, b) => b.riskScore - a.riskScore).slice(0, 10);

  const riskColor = (score) => {
    if (score >= 50) return { bg: "#fee2e2", color: "#991b1b", dot: "#ef4444", label: "Alto" };
    if (score >= 35) return { bg: "#fff7ed", color: "#9a3412", dot: "#f97316", label: "Médio" };
    return { bg: "#f0fdf4", color: "#166534", dot: "#22c55e", label: "Baixo" };
  };

  // CTA suggestion based on worst metric
  const ctaSuggestion = (a) => {
    if (a.cpcNorm < 0.7) return "Focar em CPC";
    if (a.convNorm < 0.6) return "Revisar conversão";
    if (a.reprovados > 8) return "Avaliar reprovações";
    return "Acompanhar";
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: 0 }}>Prioridade de Intervenção</h4>
          <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
            Score de risco: CPC baixo + Conversão baixa + Reprovações altas. Quem atender primeiro.
          </p>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {sorted.map((a, i) => {
          const risk = riskColor(a.riskScore);
          return (
            <RankingPrioridadeRow key={i} rank={i + 1} agent={a} risk={risk} cta={ctaSuggestion(a)} />
          );
        })}
      </div>
    </div>
  );
}

function RankingPrioridadeRow({ rank, agent, risk, cta }) {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 10px", borderRadius: 6,
        background: hov ? "#f8fafc" : "transparent",
        transition: "background 80ms ease",
      }}
    >
      {/* Rank */}
      <span style={{
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 700, fontVariantNumeric: "tabular-nums",
        background: risk.bg, color: risk.color,
      }}>{rank}</span>

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {agent.agente}
        </div>
        <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>
          mat. {agent.mat} · {agent.cpc.toFixed(0)}% CPC · {agent.conversao.toFixed(1)}% conv
        </div>
      </div>

      {/* Sparkline */}
      <Sparkline data={agent.sparkline} />

      {/* Risk badge */}
      <span style={{
        padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600,
        background: risk.bg, color: risk.color, flexShrink: 0,
      }}>
        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: risk.dot, marginRight: 4, verticalAlign: "middle" }}></span>
        {risk.label}
      </span>

      {/* Score */}
      <span style={{
        width: 32, textAlign: "right", flexShrink: 0,
        fontSize: 12, fontWeight: 700, color: risk.color,
        fontVariantNumeric: "tabular-nums",
      }}>{agent.riskScore}</span>

      {/* CTA buttons */}
      <div style={{ display: "flex", gap: 4, flexShrink: 0, opacity: hov ? 1 : 0.4, transition: "opacity 120ms" }}>
        <button style={{
          padding: "4px 8px", borderRadius: 4, border: "1px solid #e2e8f0",
          background: "#fff", fontSize: 10, fontWeight: 600, color: "#475569",
          cursor: "pointer", whiteSpace: "nowrap",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "#f1f5f9"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
        >Abrir Ficha</button>
        <button style={{
          padding: "4px 8px", borderRadius: 4, border: "none",
          background: risk.bg, fontSize: 10, fontWeight: 600, color: risk.color,
          cursor: "pointer", whiteSpace: "nowrap",
        }}>{cta}</button>
      </div>
    </div>
  );
}

// ---------- Pareto 80/20 ----------
function ParetoChart() {
  const sorted = [...MOCK_AGENTS_ENRICHED].sort((a, b) => b.valorTotal - a.valorTotal);
  const total = sorted.reduce((s, a) => s + a.valorTotal, 0);
  const max = sorted[0]?.valorTotal || 1;

  // Cumulative %
  let cum = 0;
  const withCum = sorted.map(a => {
    cum += a.valorTotal;
    return { ...a, cumPct: (cum / total) * 100 };
  });

  const barW = 44;
  const chartW = Math.max(withCum.length * (barW + 6) + 60, 600);
  const chartH = 200;
  const PAD = { l: 50, r: 40, t: 8, b: 36 };
  const plotH = chartH - PAD.t - PAD.b;
  const plotW = chartW - PAD.l - PAD.r;
  const stepW = plotW / withCum.length;

  const toBarH = v => (v / max) * plotH;
  const toCumY = pct => PAD.t + plotH - (pct / 100) * plotH;
  const [hov, setHov] = React.useState(null);

  // Find 80% line
  const idx80 = withCum.findIndex(a => a.cumPct >= 80);

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 }}>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: 0 }}>Pareto de Resultado (80/20)</h4>
      <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
        Barras: valor acordado por agente · Linha: acumulado % · Concentração revela risco de dependência.
      </p>
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <svg width={chartW} height={chartH} style={{ display: "block" }}>
          {/* Y axis (value) */}
          {[0, 0.5, 1].map(f => (
            <g key={f}>
              <line x1={PAD.l} x2={chartW - PAD.r} y1={PAD.t + plotH - f * plotH} y2={PAD.t + plotH - f * plotH} stroke="#f1f5f9" strokeWidth="1"/>
              <text x={PAD.l - 6} y={PAD.t + plotH - f * plotH + 3} textAnchor="end" fontSize="9" fill="#94a3b8" fontFamily="Inter">
                {formatBRLCompact(max * f)}
              </text>
            </g>
          ))}
          {/* Right Y axis (%) */}
          {[0, 25, 50, 75, 100].map(p => (
            <text key={p} x={chartW - PAD.r + 6} y={toCumY(p) + 3} textAnchor="start" fontSize="9" fill="#94a3b8" fontFamily="Inter">{p}%</text>
          ))}
          {/* 80% line */}
          <line x1={PAD.l} x2={chartW - PAD.r} y1={toCumY(80)} y2={toCumY(80)} stroke="#f43f5e" strokeWidth="1" strokeDasharray="4 3" opacity="0.6"/>
          <text x={PAD.l + 2} y={toCumY(80) - 3} fontSize="9" fill="#f43f5e" fontFamily="Inter">80%</text>
          {/* Bars */}
          {withCum.map((a, i) => {
            const x = PAD.l + i * stepW + 4;
            const h = toBarH(a.valorTotal);
            const isBelow80 = i <= idx80;
            return (
              <g key={i}
                onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}
              >
                <rect x={x} y={PAD.t + plotH - h} width={stepW - 8} height={h}
                  rx="2" fill={isBelow80 ? "#3b82f6" : "#cbd5e1"}
                  opacity={hov === i ? 1 : 0.8}
                  style={{ cursor: "pointer" }}
                />
                {/* Agent label */}
                <text x={x + (stepW - 8) / 2} y={chartH - PAD.b + 12} textAnchor="middle"
                  fontSize="9" fill="#64748b" fontFamily="Inter"
                  transform={`rotate(-25, ${x + (stepW - 8) / 2}, ${chartH - PAD.b + 12})`}
                >{a.agente.substring(0, 12)}</text>
              </g>
            );
          })}
          {/* Cumulative line */}
          <polyline
            points={withCum.map((a, i) => `${PAD.l + i * stepW + stepW / 2},${toCumY(a.cumPct)}`).join(" ")}
            fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round"
          />
          {withCum.map((a, i) => (
            <circle key={i} cx={PAD.l + i * stepW + stepW / 2} cy={toCumY(a.cumPct)} r="3" fill="#f97316"/>
          ))}
          {/* Tooltip */}
          {hov !== null && (() => {
            const a = withCum[hov];
            const tx = PAD.l + hov * stepW + stepW / 2;
            return (
              <g>
                <rect x={tx - 80} y={PAD.t} width={160} height={32} rx="4" fill="#0f172a" opacity="0.92"/>
                <text x={tx - 72} y={PAD.t + 13} fontSize="10" fill="#e2e8f0" fontFamily="Inter">{a.agente.substring(0, 24)}</text>
                <text x={tx - 72} y={PAD.t + 25} fontSize="9" fill="#94a3b8" fontFamily="'JetBrains Mono'">
                  {formatBRLCompact(a.valorTotal)} · acum: {a.cumPct.toFixed(0)}%
                </text>
              </g>
            );
          })()}
        </svg>
      </div>
      {/* Summary */}
      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11 }}>
        <span style={{ color: "#3b82f6", fontWeight: 600 }}>{idx80 + 1} agentes geram 80% do valor</span>
        <span style={{ color: "#64748b" }}>
          Concentração Top 3: {(withCum[2]?.cumPct || 0).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { RankingPrioridade, ParetoChart, Sparkline });
