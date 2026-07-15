/* ============================================================
   AgDash — Análise & Efetividade Page (Part 1)
   Boletos KPIs, Efetividade Diária, Tendência, Ranking
   ============================================================ */

function BoletosKpiStrip() {
  const kpis = MOCK_BOLETOS_KPIS;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
      {kpis.map((k, i) => (
        <div key={i} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>{k.label}</div>
          <div style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: k.color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {typeof k.value === "number" ? formatNumber(k.value) : k.value}
          </div>
          {k.sub && <div style={{ marginTop: 4, fontSize: 10, color: "#94a3b8" }}>{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function EfetividadeDiariaChart() {
  const data = MOCK_EFETIVIDADE_DIARIA;
  const containerRef = React.useRef(null);
  const [W, setW] = React.useState(900);
  const H = 240, PAD = { l: 36, r: 36, t: 12, b: 28 };

  React.useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setW(containerRef.current.offsetWidth - 40); // minus padding
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const maxB = Math.max(...data.map(d => d.boletos)) * 1.1;
  const step = plotW / (data.length - 1);
  const toX = i => PAD.l + i * step;
  const toYB = v => PAD.t + plotH - (v / maxB) * plotH;
  const toYE = v => PAD.t + plotH - (v / 100) * plotH;
  const [hov, setHov] = React.useState(null);

  return (
    <div ref={containerRef} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20, width: "100%" }}>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: 0 }}>Efetividade Diária por Data de Vencimento — 2026-05-01 — 2026-05-20</h4>
      <svg width={W} height={H} style={{ display: "block", marginTop: 12, width: "100%" }}>
        {/* Y grid */}
        {[0, 15, 30, 45, 60].map(v => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={toYB(v)} y2={toYB(v)} stroke="#f1f5f9" strokeWidth="1"/>
            <text x={PAD.l - 4} y={toYB(v) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{v}</text>
          </g>
        ))}
        {/* Right Y (%) */}
        {[0, 25, 50, 75, 100].map(v => (
          <text key={v} x={W - PAD.r + 4} y={toYE(v) + 3} textAnchor="start" fontSize="9" fill="#94a3b8">{v}%</text>
        ))}
        {/* Bars */}
        {data.map((d, i) => {
          const bw = Math.max(step * 0.6, 8);
          const bh = (d.boletos / maxB) * plotH;
          return (
            <rect key={i} x={toX(i) - bw / 2} y={PAD.t + plotH - bh} width={bw} height={bh}
              rx="2" fill={hov === i ? "#93c5fd" : "#bfdbfe"} style={{ cursor: "pointer" }}
              onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}
            />
          );
        })}
        {/* Efetividade line */}
        <polyline
          points={data.map((d, i) => `${toX(i)},${toYE(d.efetividade)}`).join(" ")}
          fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        />
        {data.map((d, i) => (
          <circle key={i} cx={toX(i)} cy={toYE(d.efetividade)} r={hov === i ? 5 : 3} fill="#16a34a"
            style={{ cursor: "pointer" }} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}
          />
        ))}
        {/* X labels */}
        {data.map((d, i) => i % 2 === 0 && (
          <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">{d.dia}</text>
        ))}
        {/* Tooltip */}
        {hov !== null && (
          <g>
            <rect x={toX(hov) - 56} y={PAD.t - 2} width={112} height={30} rx="4" fill="#0f172a" opacity="0.92"/>
            <text x={toX(hov)} y={PAD.t + 12} textAnchor="middle" fontSize="10" fill="#e2e8f0">{data[hov].dia} · {data[hov].boletos} bol.</text>
            <text x={toX(hov)} y={PAD.t + 24} textAnchor="middle" fontSize="10" fill="#6ee7b7">efet: {data[hov].efetividade}%</text>
          </g>
        )}
      </svg>
    </div>
  );
}

function TendenciaMensalChart() {
  const data = MOCK_TENDENCIA_MENSAL;
  const media = Math.round(data.reduce((s, d) => s + d.conversao, 0) / data.length);
  const W = 460, H = 220, PAD = { l: 36, r: 24, t: 12, b: 28 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const barW = plotW / data.length * 0.65;
  const gap = plotW / data.length;

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 }}>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: 0 }}>Tendência Mensal — % Conversão (histórico)</h4>
      <svg width={W} height={H} style={{ display: "block", marginTop: 12 }}>
        {[0, 25, 50, 75, 100].map(v => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + plotH - (v / 100) * plotH} y2={PAD.t + plotH - (v / 100) * plotH} stroke="#f1f5f9" strokeWidth="1"/>
            <text x={PAD.l - 4} y={PAD.t + plotH - (v / 100) * plotH + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{v}%</text>
          </g>
        ))}
        {/* Media line */}
        <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + plotH - (media / 100) * plotH} y2={PAD.t + plotH - (media / 100) * plotH} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3"/>
        <text x={W - PAD.r + 2} y={PAD.t + plotH - (media / 100) * plotH + 3} fontSize="9" fill="#94a3b8">Média {media}%</text>
        {/* Bars */}
        {data.map((d, i) => {
          const x = PAD.l + i * gap + (gap - barW) / 2;
          const h = (d.conversao / 100) * plotH;
          return (
            <g key={i}>
              <rect x={x} y={PAD.t + plotH - h} width={barW} height={h} rx="3" fill={d.color}/>
              <text x={x + barW / 2} y={PAD.t + plotH - h - 6} textAnchor="middle" fontSize="10" fill={d.color} fontWeight="600">{d.conversao}%</text>
              <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="9" fill="#64748b">{d.mes}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RankingAgentesBoletos() {
  const data = MOCK_RANKING_AGENTES_BOLETOS;
  const max = Math.max(...data.map(d => d.pct));
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 }}>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: 0 }}>Ranking de Agentes — 2026-05-01 → 2026-05-20</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 12 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 110, flexShrink: 0, fontSize: 11, color: "#334155", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nome}</span>
            <div style={{ flex: 1, height: 18, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(d.pct / max) * 100}%`, background: i < 3 ? "#22c55e" : "#3b82f6", borderRadius: 3, transition: "width 400ms" }}></div>
            </div>
            <span style={{ width: 36, flexShrink: 0, fontSize: 11, fontWeight: 600, color: "#475569", fontVariantNumeric: "tabular-nums" }}>{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { BoletosKpiStrip, EfetividadeDiariaChart, TendenciaMensalChart, RankingAgentesBoletos });
