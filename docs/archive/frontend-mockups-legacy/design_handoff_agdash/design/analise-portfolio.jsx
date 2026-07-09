/* ============================================================
   AgDash — Análise & Efetividade Page (Part 2)
   Portfólio charts, Boletos Quebrados + Detail Modal
   ============================================================ */

// ---------- Portfolio Section ----------
function PortfolioSection() {
  return (
    <div>
      {/* Warning */}
      <div style={{
        padding: "10px 16px", background: "#fffbeb", border: "1px solid #fde68a",
        borderRadius: 6, fontSize: 12, color: "#92400e", marginBottom: 12, lineHeight: 1.5,
      }}>
        <strong>⚠ 1 exceção sem portfólio (CAMPO010 nulo)</strong> — não contabilizado no gráfico.<br/>
        <span style={{ fontSize: 11, color: "#a16207" }}>
          Cadastrar o portfólio em DIV_AUX.CAMPO010 no sistema-fonte para o registro voltar a aparecer.<br/>
          • NR 73957489 · CPF 076.***.**** -99 · MARLENE A SILVA BEZERRA · R$ 141,17 · agente Wilton da Silva
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {/* Valor Acordos por Portfólio */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", margin: "0 0 12px" }}>Valor de Acordos por Portfólio</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {MOCK_PORTFOLIO.map((d, i) => {
              const max = MOCK_PORTFOLIO[0].valor;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 100, flexShrink: 0, fontSize: 10, color: "#475569", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nome}</span>
                  <div style={{ flex: 1, height: 16, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(d.valor / max) * 100}%`, background: "#22c55e", borderRadius: 2 }}></div>
                  </div>
                  <span style={{ width: 72, flexShrink: 0, fontSize: 10, color: "#64748b", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatBRLCompact(d.valor)}</span>
                </div>
              );
            })}
          </div>
        </div>
        {/* Exceções */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", margin: "0 0 12px" }}>Exceções por Portfólio (Qtd)</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {MOCK_EXCECOES_PORTFOLIO.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 120, flexShrink: 0, fontSize: 10, color: "#475569", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nome}</span>
                <div style={{ flex: 1, height: 16, background: "#fff1f2", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: "100%", background: "#f43f5e", borderRadius: 2 }}></div>
                </div>
                <span style={{ width: 24, flexShrink: 0, fontSize: 11, fontWeight: 600, color: "#be123c", textAlign: "right" }}>{d.qtd}</span>
              </div>
            ))}
            {MOCK_EXCECOES_PORTFOLIO.length === 0 && <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>Sem exceções no período</span>}
          </div>
        </div>
        {/* Rejeitados */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", margin: "0 0 12px" }}>Rejeitados por Portfólio (Qtd)</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {MOCK_REJEITADOS_PORTFOLIO.map((d, i) => {
              const max = MOCK_REJEITADOS_PORTFOLIO[0].qtd;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 100, flexShrink: 0, fontSize: 10, color: "#475569", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nome}</span>
                  <div style={{ flex: 1, height: 14, background: "#fff7ed", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(d.qtd / max) * 100}%`, background: "#f97316", borderRadius: 2 }}></div>
                  </div>
                  <span style={{ width: 22, flexShrink: 0, fontSize: 10, fontWeight: 600, color: "#c2410c", textAlign: "right" }}>{d.qtd}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Boletos Quebrados Chart + Detail Modal ----------
function BoletosQuebradosChart() {
  const data = MOCK_BOLETOS_QUEBRADOS;
  const max = data[0]?.qtd || 1;
  const [selectedPortfolio, setSelectedPortfolio] = React.useState(null);
  const [selectedAcordo, setSelectedAcordo] = React.useState(null);

  const detailsForPortfolio = selectedPortfolio
    ? MOCK_BOLETOS_QUEBRADOS_DETALHE.filter(d => d.portfolio === selectedPortfolio)
    : [];

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20, position: "relative" }}>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: 0 }}>Boletos Quebrados por Portfólio</h4>
      <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Acordos que não foram mantidos. Clique para ver detalhes e análise do perfil do devedor.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
        {data.map((d, i) => (
          <div key={i}
            onClick={() => { setSelectedPortfolio(d.portfolio); setSelectedAcordo(null); }}
            style={{
              display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
              padding: "4px 6px", borderRadius: 4,
              background: selectedPortfolio === d.portfolio ? "#fef2f2" : "transparent",
              transition: "background 80ms",
            }}
            onMouseEnter={e => { if (selectedPortfolio !== d.portfolio) e.currentTarget.style.background = "#f8fafc"; }}
            onMouseLeave={e => { if (selectedPortfolio !== d.portfolio) e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ width: 130, flexShrink: 0, fontSize: 11, color: "#334155", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.portfolio}</span>
            <div style={{ flex: 1, height: 20, background: "#fef2f2", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(d.qtd / max) * 100}%`, background: "#ef4444", borderRadius: 3, transition: "width 300ms" }}></div>
            </div>
            <span style={{ width: 28, flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#dc2626", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.qtd}</span>
          </div>
        ))}
      </div>

      {/* Detail Panel */}
      {selectedPortfolio && (
        <div style={{ marginTop: 16, border: "1px solid #fecaca", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#991b1b" }}>Detalhes — {selectedPortfolio}</span>
              <span style={{ fontSize: 11, color: "#dc2626", marginLeft: 8 }}>{detailsForPortfolio.length} acordo(s) quebrado(s)</span>
            </div>
            <button onClick={() => { setSelectedPortfolio(null); setSelectedAcordo(null); }} style={{
              background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#991b1b", padding: "0 4px",
            }}>✕</button>
          </div>

          {detailsForPortfolio.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>
              Dados detalhados não disponíveis para este portfólio no mock.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {detailsForPortfolio.map((ac, i) => (
                <AcordoQuebradoRow key={ac.id} acordo={ac} isExpanded={selectedAcordo === ac.id}
                  onToggle={() => setSelectedAcordo(selectedAcordo === ac.id ? null : ac.id)}
                  isLast={i === detailsForPortfolio.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AcordoQuebradoRow({ acordo, isExpanded, onToggle, isLast }) {
  const ac = acordo;
  const riskColors = { alto: "#dc2626", medio: "#f59e0b", baixo: "#16a34a" };
  const riskLabels = { alto: "Alto Risco", medio: "Médio Risco", baixo: "Baixo Risco" };

  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid #fee2e2" }}>
      {/* Row header */}
      <button onClick={onToggle} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 12,
        padding: "10px 16px", background: isExpanded ? "#fff5f5" : "#fff",
        border: "none", cursor: "pointer", textAlign: "left",
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"
          style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 150ms", flexShrink: 0 }}>
          <path d="M9 18l6-6-6-6"/>
        </svg>
        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#64748b" }}>{ac.id}</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: "#0f172a" }}>{ac.devedor}</span>
        <span style={{ fontSize: 11, color: "#64748b" }}>agente: {ac.agente}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#dc2626", fontVariantNumeric: "tabular-nums", marginLeft: "auto" }}>{formatBRLCompact(ac.valorAcordo, "full")}</span>
        <span style={{
          padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600,
          background: ac.previsaoQuebra ? "#fef2f2" : "#fff7ed",
          color: ac.previsaoQuebra ? "#991b1b" : "#9a3412",
        }}>{ac.previsaoQuebra ? "Prevista" : "Inesperada"}</span>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{ padding: "0 16px 16px", background: "#fff5f5" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* Acordo details */}
            <div style={{ background: "#fff", border: "1px solid #fecaca", borderRadius: 6, padding: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#991b1b", marginBottom: 8 }}>Detalhes do Acordo</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 12 }}>
                <Detail label="ID" value={ac.id} />
                <Detail label="Agente" value={`${ac.agente} (${ac.mat})`} />
                <Detail label="Data Acordo" value={ac.dataAcordo} />
                <Detail label="Data Quebra" value={ac.dataQuebra} />
                <Detail label="Valor" value={formatBRLCompact(ac.valorAcordo, "full")} highlight />
                <Detail label="Parcelas" value={`${ac.parcelaPaga}/${ac.parcelas} pagas`} />
                <Detail label="Portfólio" value={ac.portfolio} />
              </div>
            </div>

            {/* Debtor profile */}
            <div style={{ background: "#fff", border: "1px solid #fecaca", borderRadius: 6, padding: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#991b1b", marginBottom: 8 }}>Perfil do Devedor</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 12 }}>
                <Detail label="Nome" value={ac.devedor} />
                <Detail label="CPF" value={ac.cpf} />
                <Detail label="Valor Dívida" value={formatBRLCompact(ac.valorDivida, "full")} />
                <Detail label="Dias em Atraso" value={`${ac.diasAtraso} dias`} />
                <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: "#64748b" }}>Risco:</span>
                  <span style={{
                    padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: ac.perfilRisco === "alto" ? "#fef2f2" : ac.perfilRisco === "medio" ? "#fffbeb" : "#f0fdf4",
                    color: riskColors[ac.perfilRisco],
                  }}>{riskLabels[ac.perfilRisco]}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Analysis */}
          <div style={{
            marginTop: 10, padding: "10px 14px", borderRadius: 6,
            background: ac.previsaoQuebra ? "#fef2f2" : "#fffbeb",
            border: `1px solid ${ac.previsaoQuebra ? "#fecaca" : "#fde68a"}`,
            fontSize: 12, lineHeight: 1.5,
            color: ac.previsaoQuebra ? "#991b1b" : "#92400e",
          }}>
            <strong style={{ fontSize: 11 }}>{ac.previsaoQuebra ? "🔴 Quebra prevista pelo modelo" : "🟡 Quebra inesperada — investigar"}</strong>
            <div style={{ marginTop: 4 }}>{ac.motivo}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, highlight }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 12, color: highlight ? "#dc2626" : "#0f172a", fontWeight: highlight ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

Object.assign(window, { PortfolioSection, BoletosQuebradosChart });
