/* ============================================================
   AgDash — Análise & Efetividade Page Assembly
   ============================================================ */

function AnaliseEfetividadePage() {
  const [tipoFilter, setTipoFilter] = React.useState("Primeira Parcela");

  return (
    <div style={{ flex: 1, minWidth: 0, padding: "24px 24px 48px", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Tipo filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#64748b" }}>Tipo</span>
        <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid #e2e8f0" }}>
          {["Primeira Parcela", "Colchão"].map(t => (
            <button key={t} onClick={() => setTipoFilter(t)} style={{
              padding: "6px 16px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
              background: tipoFilter === t ? "#0ea5e9" : "#fff",
              color: tipoFilter === t ? "#fff" : "#64748b",
              transition: "all 120ms",
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Section 1: Efetividade de Boletos */}
      <div>
        <SectionHeader
          title="Efetividade de Boletos"
          description="KPIs de boletos gerados, pagos, conversão e efetividade no período."
        />
        <div style={{ marginTop: 12 }}>
          <BoletosKpiStrip />
        </div>
      </div>

      {/* Section 2: Efetividade Diária */}
      <EfetividadeDiariaChart />

      {/* Section 3: Tendência + Ranking */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <TendenciaMensalChart />
        <RankingAgentesBoletos />
      </div>

      {/* Section 4: Portfólio */}
      <div>
        <SectionHeader
          title="Portfólio"
          description="Acordos, exceções e rejeitados agrupados por portfólio (CAMPO010)."
        />
        <div style={{ marginTop: 12 }}>
          <PortfolioSection />
        </div>
      </div>

      {/* Section 5: Boletos Quebrados (nova) */}
      <div>
        <SectionHeader
          title="Boletos Quebrados"
          description="Acordos que não foram mantidos — análise por portfólio com perfil do devedor."
        />
        <div style={{ marginTop: 12 }}>
          <BoletosQuebradosChart />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AnaliseEfetividadePage });
