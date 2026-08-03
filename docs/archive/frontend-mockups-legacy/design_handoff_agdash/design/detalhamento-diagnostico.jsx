/* ============================================================
   AgDash — Bloco 1: Diagnóstico Individual
   Funil de Conversão + Bullet Charts
   ============================================================ */

// ---------- Funil de Conversão (Waterfall) ----------
function FunilConversao() {
  const f = MOCK_FUNIL;
  const steps = [
    { label: "Acionamentos", value: f.acionamentos, fmt: formatNumber },
    { label: "Contatos", value: f.contatos, fmt: formatNumber, pct: (f.contatos / f.acionamentos * 100), pctLabel: "CPC" },
    { label: "Acordos", value: f.acordos, fmt: formatNumber, pct: (f.acordos / f.contatos * 100), pctLabel: "Conv." },
    { label: "1ª Parcela", value: f.primeiraParcela, fmt: v => formatBRLCompact(v), pct: (f.primeiraParcela / f.valorAcordos * 100), pctLabel: "Efetiv." },
  ];
  const maxVal = steps[0].value;

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 }}>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: 0 }}>Funil de Conversão</h4>
      <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Perda percentual por etapa: Acionamentos → Contatos → Acordos → 1ª Parcela</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        {steps.map((s, i) => {
          // For monetary value, normalize differently
          const barW = i < 3
            ? (s.value / maxVal * 100)
            : (f.acordos / maxVal * 100) * (s.pct / 100);
          const actualW = Math.max(barW, 4);
          const colors = ["#3b82f6", "#60a5fa", "#f59e0b", "#10b981"];
          const isCritical = s.pct != null && s.pct < 5;

          return (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 80, flexShrink: 0, fontSize: 11, fontWeight: 600, color: "#475569", textAlign: "right" }}>{s.label}</span>
              <div style={{ flex: 1, position: "relative" }}>
                <div style={{ height: 28, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 4,
                    width: `${actualW}%`,
                    background: isCritical ? "#f43f5e" : colors[i],
                    transition: "width 500ms ease",
                    display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 8,
                  }}>
                    {actualW > 15 && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
                        {s.fmt(s.value)}
                      </span>
                    )}
                  </div>
                </div>
                {actualW <= 15 && (
                  <span style={{ position: "absolute", left: `${actualW + 1}%`, top: 6, fontSize: 11, fontWeight: 600, color: "#334155", fontVariantNumeric: "tabular-nums" }}>
                    {s.fmt(s.value)}
                  </span>
                )}
              </div>
              {/* Retention % arrow */}
              {s.pct != null && (
                <span style={{
                  width: 72, flexShrink: 0, fontSize: 11, fontWeight: 600,
                  color: isCritical ? "#dc2626" : s.pct < 30 ? "#b45309" : "#047857",
                  textAlign: "right", fontVariantNumeric: "tabular-nums",
                }}>
                  {s.pctLabel}: {s.pct.toFixed(1)}%
                </span>
              )}
              {s.pct == null && <span style={{ width: 72 }}></span>}
            </div>
          );
        })}
      </div>
      {/* Drop annotations */}
      <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 10, color: "#94a3b8" }}>
        <span>Perda Acion→Contatos: {((1 - MOCK_FUNIL.contatos / MOCK_FUNIL.acionamentos) * 100).toFixed(0)}%</span>
        <span>Perda Contatos→Acordos: {((1 - MOCK_FUNIL.acordos / MOCK_FUNIL.contatos) * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

// ---------- Bullet Chart ----------
function BulletChart({ label, value, meta, min, max, unit, betterWhen }) {
  const range = max - min;
  const pctVal = ((value - min) / range) * 100;
  const pctMeta = ((meta - min) / range) * 100;
  const isGood = betterWhen === "up" ? value >= meta : value <= meta;
  const isBad = betterWhen === "up" ? value < meta * 0.8 : value > meta * 1.2;

  // Background bands: poor → ok → good
  const bandPoor = betterWhen === "up" ? 40 : 60;
  const bandOk = betterWhen === "up" ? 70 : 85;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 80, flexShrink: 0, textAlign: "right" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>{label}</div>
        <div style={{ fontSize: 10, color: "#94a3b8" }}>meta: {unit === "BRL" ? formatBRLCompact(meta) : meta + unit}</div>
      </div>
      <div style={{ flex: 1, position: "relative", height: 24 }}>
        {/* Background bands */}
        <div style={{ position: "absolute", inset: 0, borderRadius: 3, overflow: "hidden", display: "flex" }}>
          <div style={{ width: `${bandPoor}%`, background: "#fee2e2" }}></div>
          <div style={{ width: `${bandOk - bandPoor}%`, background: "#fef9c3" }}></div>
          <div style={{ flex: 1, background: "#dcfce7" }}></div>
        </div>
        {/* Value bar */}
        <div style={{
          position: "absolute", top: 5, bottom: 5, left: 0,
          width: `${Math.min(pctVal, 100)}%`,
          background: isBad ? "#ef4444" : isGood ? "#16a34a" : "#eab308",
          borderRadius: 2, transition: "width 400ms ease",
        }}></div>
        {/* Meta marker */}
        <div style={{
          position: "absolute", top: 0, bottom: 0,
          left: `${pctMeta}%`, width: 2,
          background: "#0f172a",
        }}></div>
      </div>
      <span style={{
        width: 56, flexShrink: 0, fontSize: 13, fontWeight: 700,
        color: isBad ? "#dc2626" : isGood ? "#16a34a" : "#ca8a04",
        textAlign: "right", fontVariantNumeric: "tabular-nums",
      }}>
        {unit === "BRL" ? formatBRLCompact(value) : value.toFixed(1).replace(".", ",") + unit}
      </span>
    </div>
  );
}

function BulletChartsPanel() {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 }}>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: 0 }}>Performance vs Meta</h4>
      <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Bullet charts — valor real vs meta da equipe. Linha preta = meta.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
        <BulletChart label="CPC" value={43.6} meta={MOCK_METAS.cpc} min={0} max={80} unit="%" betterWhen="up" />
        <BulletChart label="Conversão" value={1.2} meta={MOCK_METAS.conversao} min={0} max={4} unit="%" betterWhen="up" />
        <BulletChart label="Ticket Médio" value={4502.79} meta={MOCK_METAS.ticketMedio} min={0} max={10000} unit="BRL" betterWhen="up" />
        <BulletChart label="Exceções" value={1.1} meta={MOCK_METAS.excecoes} min={0} max={10} unit="%" betterWhen="down" />
      </div>
      {/* Legend */}
      <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 10, color: "#64748b" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#f87171" }}></span>crítico</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#facc15" }}></span>atenção</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#4ade80" }}></span>bom</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 14, background: "#0f172a" }}></span>meta</span>
      </div>
    </div>
  );
}

Object.assign(window, { FunilConversao, BulletChartsPanel, BulletChart });
