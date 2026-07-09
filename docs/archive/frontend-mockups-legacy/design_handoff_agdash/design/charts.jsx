/* ============================================================
   AgDash — Chart Sections (Financeiro + Eficiência)
   ============================================================ */

function HorizontalBarChart({ data, labelKey, valueKey, formatFn, color, onBarClick }) {
  const max = Math.max(...data.map(d => d[valueKey]));
  const [hovIdx, setHovIdx] = React.useState(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, cursor: onBarClick ? "pointer" : "default" }}
          onClick={() => onBarClick && onBarClick(d, i)}
          onMouseEnter={() => setHovIdx(i)} onMouseLeave={() => setHovIdx(null)}
        >
          <span style={{
            width: 130, flexShrink: 0, fontSize: 12, color: "#334155",
            textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{d[labelKey]}</span>
          <div style={{ flex: 1, height: 22, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 3,
              width: `${(d[valueKey] / max) * 100}%`,
              background: color || "#10b981",
              transition: "width 400ms ease",
              opacity: hovIdx === i ? 1 : 0.85,
            }}></div>
          </div>
          <span style={{
            width: 90, flexShrink: 0, fontSize: 12, color: "#64748b",
            fontVariantNumeric: "tabular-nums", textAlign: "right",
          }}>{formatFn(d[valueKey])}</span>
          {onBarClick && hovIdx === i && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ flexShrink: 0 }}>
              <path d="M9 18l6-6-6-6"/>
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

function GroupedBarChart({ data }) {
  const max = Math.max(...data.flatMap(d => [d.valorAcordos, d.primeiraParcela]));
  const barH = 36;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 40, justifyContent: "center", padding: "8px 0" }}>
        {data.map(d => {
          const h1 = (d.valorAcordos / max) * 160;
          const h2 = (d.primeiraParcela / max) * 160;
          return (
            <div key={d.bu} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 170 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#334155", fontWeight: 600, fontVariantNumeric: "tabular-nums", marginBottom: 4 }}>
                    {formatBRLCompact(d.valorAcordos)}
                  </span>
                  <div style={{ width: barH, height: h1, background: "#10b981", borderRadius: "4px 4px 0 0" }}></div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#334155", fontWeight: 600, fontVariantNumeric: "tabular-nums", marginBottom: 4 }}>
                    {formatBRLCompact(d.primeiraParcela)}
                  </span>
                  <div style={{ width: barH, height: h2, background: "#34d399", borderRadius: "4px 4px 0 0" }}></div>
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginTop: 4 }}>{d.bu}</span>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 12, fontSize: 12, color: "#64748b" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: "#10b981" }}></span>
          Valor Acordos
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: "#34d399" }}></span>
          1ª Parcela
        </span>
      </div>
    </div>
  );
}

function BUEfficiencyChart({ data }) {
  // Simulated CPC and Conversão data per BU
  const buData = [
    { bu: "AUTOS", cpc: 44.0, conversao: 1.3 },
    { bu: "CONSUMER", cpc: 42.3, conversao: 0.9 },
  ];
  const maxPct = 50;
  const barH = 32;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 40, justifyContent: "center", padding: "8px 0" }}>
        {buData.map(d => {
          const h1 = (d.cpc / maxPct) * 160;
          const h2 = (d.conversao / maxPct) * 160;
          return (
            <div key={d.bu} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 170 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#334155", fontWeight: 600, marginBottom: 4 }}>{d.cpc}%</span>
                  <div style={{ width: barH, height: h1, background: "#f59e0b", borderRadius: "4px 4px 0 0" }}></div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#334155", fontWeight: 600, marginBottom: 4 }}>{d.conversao}%</span>
                  <div style={{ width: barH, height: Math.max(h2, 4), background: "#a3a300", borderRadius: "4px 4px 0 0" }}></div>
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginTop: 4 }}>{d.bu}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 12, fontSize: 11, color: "#64748b", marginTop: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 500 }}>Média CPC: 43,5%</span>
        <span style={{ color: "#cbd5e1" }}>·</span>
        <span style={{ fontSize: 11, fontWeight: 500 }}>Média Conv.: 1,2%</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 8, fontSize: 12, color: "#64748b" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: "#f59e0b" }}></span>
          CPC %
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: "#a3a300" }}></span>
          Conversão %
        </span>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
      padding: 20, flex: 1, minWidth: 0,
    }}>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: 0 }}>{title}</h4>
      {subtitle && <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{subtitle}</p>}
      <div style={{ marginTop: 16 }}>{children}</div>
    </div>
  );
}

// ---------- Risco Detail Panel ----------
function RiscoDetalhePanel({ type, portfolio, onClose }) {
  const titles = { excecoes: "Exceções", rejeitados: "Rejeitados", quebrados: "Boletos Quebrados" };
  const colors = { excecoes: { bg: "#fff1f2", border: "#fecdd3", head: "#991b1b" }, rejeitados: { bg: "#fff7ed", border: "#fed7aa", head: "#9a3412" }, quebrados: { bg: "#fef2f2", border: "#fecaca", head: "#991b1b" } };
  const c = colors[type];

  let acordos = [];
  if (type === "excecoes") acordos = MOCK_ACORDOS_EXCECOES.filter(a => a.portfolio === portfolio);
  else if (type === "rejeitados") acordos = MOCK_ACORDOS_REJEITADOS.filter(a => a.portfolio === portfolio);
  else acordos = MOCK_BOLETOS_QUEBRADOS_DETALHE.filter(a => a.portfolio === portfolio);

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 8, overflow: "hidden", marginTop: 12 }}>
      <div style={{ padding: "10px 16px", background: c.bg, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: c.head }}>{titles[type]} — {portfolio}</span>
          <span style={{ fontSize: 11, color: c.head, marginLeft: 8 }}>{acordos.length} acordo(s)</span>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: c.head, padding: "0 4px" }}>✕</button>
      </div>
      {acordos.length === 0 ? (
        <div style={{ padding: 16, fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>
          Dados detalhados não disponíveis para este portfólio.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={rthStyle}>ID</th>
                <th style={rthStyle}>Agente</th>
                <th style={rthStyle}>Devedor</th>
                <th style={rthStyle}>CPF</th>
                <th style={{ ...rthStyle, textAlign: "right" }}>Valor</th>
                <th style={rthStyle}>Data</th>
                <th style={rthStyle}>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {acordos.map((ac, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={rtdStyle}><span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#64748b" }}>{ac.id}</span></td>
                  <td style={rtdStyle}><span style={{ fontWeight: 500 }}>{ac.agente}</span><br/><span style={{ fontSize: 10, color: "#94a3b8" }}>mat. {ac.mat}</span></td>
                  <td style={rtdStyle}>{ac.devedor}</td>
                  <td style={rtdStyle}><span style={{ fontSize: 11, color: "#64748b" }}>{ac.cpf}</span></td>
                  <td style={{ ...rtdStyle, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{typeof ac.valor === "number" ? formatBRLCompact(ac.valor || ac.valorAcordo, "full") : formatBRLCompact(ac.valorAcordo, "full")}</td>
                  <td style={rtdStyle}><span style={{ fontVariantNumeric: "tabular-nums" }}>{ac.data || ac.dataAcordo}</span></td>
                  <td style={{ ...rtdStyle, maxWidth: 240, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>{ac.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const rthStyle = { textAlign: "left", padding: "8px 10px", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#64748b", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" };
const rtdStyle = { padding: "8px 10px", verticalAlign: "top", whiteSpace: "nowrap" };

function ChartsSection() {
  const [riscoDetalhe, setRiscoDetalhe] = React.useState(null); // { type, portfolio }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Financeiro */}
      <div>
        <SectionHeader
          title="Financeiro"
          unit="BRL"
          description="Resultados em valor de acordos e entrada de caixa (1ª parcela)."
        />
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <ChartCard title="Valor por Unidade de Negócio">
            <GroupedBarChart data={MOCK_BU_FINANCEIRO} />
          </ChartCard>
          <ChartCard title="Top 10 Agentes por 1ª Parcela">
            <HorizontalBarChart
              data={MOCK_TOP_AGENTS_1P}
              labelKey="nome"
              valueKey="valor"
              formatFn={v => formatBRLCompact(v)}
              color="#10b981"
            />
          </ChartCard>
        </div>
      </div>

      {/* Eficiência */}
      <div>
        <SectionHeader
          title="Eficiência"
          unit="%"
          description="Volume de esforço (acionamentos/contatos) e taxas (CPC/Conversão) por unidade de negócio."
          actions={["Expandir detalhes"]}
        />
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <ChartCard title="CPC % e Conversão % por Unidade de Negócio" subtitle="Eixo Y: % de acionamentos (0–100%)">
            <BUEfficiencyChart />
          </ChartCard>
          <ChartCard title="Valor 1ª Parcela de Acordos por Portfólio">
            <HorizontalBarChart
              data={MOCK_PRIMEIRA_PARCELA_PORTFOLIO}
              labelKey="nome"
              valueKey="valor"
              formatFn={v => formatBRLCompact(v)}
              color="#3b82f6"
            />
          </ChartCard>
        </div>
      </div>

      {/* Risco / Qualidade — Portfólio */}
      <div>
        <SectionHeader
          title="Risco / Qualidade"
          description="Exceções, rejeitados e boletos quebrados por portfólio."
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16 }}>
          <ChartCard title="Exceções por Portfólio (Qtd)">
            <HorizontalBarChart
              data={MOCK_EXCECOES_PORTFOLIO}
              labelKey="nome"
              valueKey="qtd"
              formatFn={v => String(v)}
              color="#f43f5e"
              onBarClick={(d) => setRiscoDetalhe({ type: "excecoes", portfolio: d.nome })}
            />
          </ChartCard>
          <ChartCard title="Rejeitados por Portfólio (Qtd)">
            <HorizontalBarChart
              data={MOCK_REJEITADOS_PORTFOLIO}
              labelKey="nome"
              valueKey="qtd"
              formatFn={v => String(v)}
              color="#f97316"
              onBarClick={(d) => setRiscoDetalhe({ type: "rejeitados", portfolio: d.nome })}
            />
          </ChartCard>
          <ChartCard title="Boletos Quebrados por Portfólio">
            <HorizontalBarChart
              data={MOCK_BOLETOS_QUEBRADOS}
              labelKey="portfolio"
              valueKey="qtd"
              formatFn={v => String(v)}
              color="#ef4444"
              onBarClick={(d) => setRiscoDetalhe({ type: "quebrados", portfolio: d.portfolio })}
            />
          </ChartCard>
        </div>
        {/* Detail Panel */}
        {riscoDetalhe && (
          <RiscoDetalhePanel
            type={riscoDetalhe.type}
            portfolio={riscoDetalhe.portfolio}
            onClose={() => setRiscoDetalhe(null)}
          />
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ChartsSection, ChartCard, HorizontalBarChart, GroupedBarChart, RiscoDetalhePanel });
