/* ============================================================
   AgDash — Mock Data + Formatters
   ============================================================ */

// ---------- BRL Formatter (anti-truncamento) ----------
function formatBRLCompact(value, mode = "auto") {
  if (value == null || Number.isNaN(value)) return "—";
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const brlCompact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 2 });
  if (mode === "full") return brl.format(value);
  if (mode === "compact") return brlCompact.format(value);
  return Math.abs(value) >= 100000 ? brlCompact.format(value) : brl.format(value);
}

function formatNumber(value) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatPercent(value) {
  if (value == null) return "—";
  return value.toFixed(1).replace(".", ",") + "%";
}

// ---------- KPI Data ----------
const MOCK_KPIS = {
  primary: [
    { id: "valor_acordos", label: "Valor de Acordos", value: 1611575.51, unit: "BRL", delta: { value: 0.12, direction: "up", baseline: "meta", baselineValue: 1440000 }, betterWhen: "up" },
    { id: "primeira_parcela", label: "1ª Parcela", value: 320347.39, unit: "BRL", delta: { value: 0.04, direction: "down", baseline: "period" }, betterWhen: "up" },
  ],
  secondary: [
    { id: "cpc", label: "CPC %", value: 43.5, unit: "%", delta: { value: 0.05, direction: "up", baseline: "movavg" }, betterWhen: "up" },
    { id: "conversao", label: "Conversão %", value: 1.2, unit: "%", delta: { value: 0.48, direction: "down", baseline: "meta" }, betterWhen: "up" },
    { id: "ticket_medio", label: "Ticket Médio", value: 4526.90, unit: "BRL", delta: { value: 0.02, direction: "up", baseline: "movavg" }, betterWhen: "up" },
    { id: "excecoes", label: "Exceções %", value: 1.3, unit: "%", delta: { value: 0.08, direction: "up", baseline: "meta" }, betterWhen: "down", extra: "3 acordos" },
    { id: "qtd_acordos", label: "Qtd Acordos", value: 356, unit: "count", delta: null, extra: "19 dias úteis" },
    { id: "gap_performance", label: "Gap de Performance", value: 89000, unit: "BRL", delta: null, extra: "Top agente vs piso da equipe" },
    { id: "qtd_acionamentos", label: "Qtd Acionamentos", value: 30166, unit: "count", delta: { value: 0.03, direction: "flat", baseline: "movavg" }, betterWhen: "up" },
  ],
};

// ---------- Ranking Data ----------
const MOCK_RANKING = [
  { rank: 1, name: "Wilton da Silva", mat: "63928", bu: "AUTOS", valor: 193152.72, qtd: 40, vsMediana: 2.84, excecao: null },
  { rank: 2, name: "Andressa Magalhães", mat: "63003", bu: "AUTOS", valor: 186401.10, qtd: 28, vsMediana: 2.71, excecao: null },
  { rank: 3, name: "Ronie Von Alves", mat: "—", bu: "CONSUMER", valor: 176419.00, qtd: 9, vsMediana: 2.51, excecao: null },
  { rank: 4, name: "Jordana Oliveira", mat: "63123", bu: "AUTOS", valor: 166883.24, qtd: 34, vsMediana: 2.32, excecao: null },
  { rank: 5, name: "Tatiane Silva Xavier", mat: "63016", bu: "AUTOS", valor: 158051.90, qtd: 28, vsMediana: 2.15, excecao: null },
  { rank: 6, name: "Luciana Pereira", mat: "63789", bu: "AUTOS", valor: 109539.95, qtd: 13, vsMediana: 1.18, excecao: null },
  { rank: 7, name: "Danilo Rodrigues", mat: "63005", bu: "AUTOS", valor: 94991.60, qtd: 21, vsMediana: 0.89, excecao: null },
  { rank: 8, name: "Adriana M. Mourão", mat: "63120", bu: "AUTOS", valor: 86166.55, qtd: 25, vsMediana: 0.71, excecao: 4.0 },
  { rank: 9, name: "Joane Araujo Falcao", mat: "63456", bu: "CONSUMER", valor: 78581.97, qtd: 8, vsMediana: 0.56, excecao: null },
  { rank: 10, name: "Raul Weber Neto", mat: "63021", bu: "AUTOS", valor: 71869.44, qtd: 17, vsMediana: 0.43, excecao: null },
];

// ---------- Heatmap Data ----------
const MOCK_HEATMAP = {
  currentHour: 13,
  metrics: ["Acionamentos", "Contatos", "Conversão"],
  hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  data: {
    "Acionamentos": [
      { expected: 2, actual: 1, delta: -50 },
      { expected: 2, actual: 1, delta: -50 },
      { expected: 2, actual: 2, delta: 0 },
      { expected: 2, actual: 3, delta: 50 },
      { expected: 2, actual: 2, delta: 0 },
      { expected: 2, actual: null, delta: null },
      null, null, null, null, null, null,
    ],
    "Contatos": [
      { expected: 1, actual: 1, delta: 8 },
      { expected: 1, actual: 1, delta: -3 },
      { expected: 1, actual: 1, delta: 12 },
      { expected: 1, actual: 2, delta: 22 },
      { expected: 1, actual: 0, delta: -18 },
      { expected: 1, actual: null, delta: null },
      null, null, null, null, null, null,
    ],
    "Conversão": [
      { expected: 2, actual: 1, delta: -42 },
      { expected: 2, actual: 1, delta: -38 },
      { expected: 2, actual: 1, delta: -51 },
      { expected: 2, actual: 2, delta: -9 },
      { expected: 2, actual: 1, delta: -31 },
      { expected: 2, actual: null, delta: null },
      null, null, null, null, null, null,
    ],
  },
  accumulated: 6,
  projectedTotal: 25,
};

// ---------- Chart Data ----------
const MOCK_BU_FINANCEIRO = [
  { bu: "AUTOS", valorAcordos: 1560000, primeiraParcela: 288900 },
  { bu: "CONSUMER", valorAcordos: 50100, primeiraParcela: 31500 },
];

const MOCK_PORTFOLIO = [
  { nome: "Santander Financeira", valor: 61149.76 },
  { nome: "Panamericano XI", valor: 43876.58 },
  { nome: "Yamaha II", valor: 40616.23 },
  { nome: "Panamericano XV", valor: 36246.80 },
  { nome: "Santander Financeira X...", valor: 25797.56 },
  { nome: "Santander XXIV", valor: 17318.78 },
  { nome: "BVFinanceira IV", valor: 11354.00 },
];

const MOCK_TOP_AGENTS_1P = [
  { nome: "Luciana M.", valor: 70249.55 },
  { nome: "Raul N.", valor: 40148.04 },
  { nome: "Adriana F.", valor: 27835.58 },
  { nome: "Wilton S.", valor: 26398.06 },
  { nome: "Tatiane X.", valor: 24984.00 },
  { nome: "Beatriz S.", valor: 18726.92 },
  { nome: "Henrique S.", valor: 16326.90 },
];

const MOCK_PRIMEIRA_PARCELA_PORTFOLIO = [
  { nome: "Santander Financeira X...", valor: 18432.50 },
  { nome: "Yamaha II", valor: 14280.00 },
  { nome: "Panamericano XI", valor: 12156.30 },
  { nome: "Panamericano XV", valor: 9840.22 },
  { nome: "Santander XXIV", valor: 7215.60 },
  { nome: "BVFinanceira IV", valor: 5890.00 },
  { nome: "BVFinanceira VII", valor: 4320.15 },
  { nome: "Santander Financeira X...", valor: 3180.40 },
];

// Nav items
const NAV_ITEMS = [
  { id: "home", label: "Dashboard Executivo", icon: "layout", level: 1, active: true },
  { id: "detalhamento", label: "Detalhamento Agentes", icon: "users", level: 2 },
  { id: "analise-prod", label: "Análise & Efetividade", icon: "trending", level: 3 },
];

// ---------- Detalhamento Agentes Data ----------
const MOCK_AGENTS_LIST = [
  "Adriana Mattps Mourão Fern...", "Andressa Magalhães dos Santos", "Beatriz Almeida dos Santos",
  "Danilo Rodrigues de Oliveira", "Edezio Jose da Silva", "Flávio Ferreira da Silva",
  "ft5system", "GABRIEL RODRIGUES DA SILVA", "Gabriella Almeida Rodrigues",
  "Guilherme Eleuterio Faustino", "Hachly Anderson Doxaint", "Henrique Carrijo de Souza",
  "Ieska Mendes Pereira", "ISAQUE FERREIRA DA SILVA GO...", "Joane Araujo Falcao",
  "Jordana Oliveira da Conceição", "Larissa Lima de Oliveira", "Luciana Pereira Miranda",
  "Luciano Renato Dos Santos",
];

const MOCK_DETALHAMENTO_KPIS = {
  primary: [
    { id: "valor_acordos", label: "Valor Acordos", value: 1675038.91, unit: "BRL" },
    { id: "primeira_parcela", label: "1ª Parcela", value: 333560.16, unit: "BRL" },
    { id: "qtd_acordos", label: "Qtd Acordos", value: 372, unit: "count" },
    { id: "ticket_medio", label: "Ticket Médio", value: 4502.79, unit: "BRL" },
  ],
  secondary: [
    { id: "cpc", label: "CPC %", value: 43.6, unit: "%" },
    { id: "conversao", label: "Conversão %", value: 1.2, unit: "%" },
    { id: "qtd_acionamentos", label: "Qtd Acionamentos", value: 31967, unit: "count" },
    { id: "qtd_contatos", label: "Qtd Contatos", value: 13939, unit: "count" },
    { id: "qtd_excecoes", label: "Qtd Exceções", value: 3, unit: "count" },
    { id: "excecoes_valor", label: "Exceções % (Valor)", value: 1.1, unit: "%" },
  ],
};

const MOCK_PERFORMANCE_TABLE = [
  { agente: "ISAQUE FERREIRA DA SILVA G...", mat: "63928", acionamentos: 2490, cpc: 52.5, acordos: 13, conversao: 0.5, valorTotal: 9656.17, primeiraParcela: 8439.32, reprovados: 1, excecoes: 0, valorExcecoes: 0 },
  { agente: "Jordana Oliveira da Conceição", mat: "63123", acionamentos: 2035, cpc: 41.9, acordos: 28, conversao: 1.4, valorTotal: 176093.49, primeiraParcela: 16672.86, reprovados: 8, excecoes: 0, valorExcecoes: 0 },
  { agente: "Larissa Lima de Oliveira", mat: "65789", acionamentos: 1810, cpc: 51.4, acordos: 6, conversao: 0.3, valorTotal: 34382.00, primeiraParcela: 10362.00, reprovados: 10, excecoes: 0, valorExcecoes: 0 },
  { agente: "Andressa Magalhães dos Sant...", mat: "63003", acionamentos: 1798, cpc: 54.1, acordos: 22, conversao: 1.2, valorTotal: 184234.58, primeiraParcela: 11998.18, reprovados: 6, excecoes: 0, valorExcecoes: 0 },
  { agente: "Sheila Cristina Honorato", mat: "63125", acionamentos: 1789, cpc: 43.8, acordos: 5, conversao: 0.3, valorTotal: 16934.36, primeiraParcela: 4698.36, reprovados: 1, excecoes: 0, valorExcecoes: 0 },
  { agente: "Adriana Mattps Mourão Fern...", mat: "63120", acionamentos: 1755, cpc: 70.7, acordos: 22, conversao: 1.3, valorTotal: 76645.43, primeiraParcela: 27786.85, reprovados: 7, excecoes: 0, valorExcecoes: 0 },
  { agente: "Edezio Jose da Silva", mat: "66345", acionamentos: 1670, cpc: 29.9, acordos: 8, conversao: 0.5, valorTotal: 31109.17, primeiraParcela: 6441.17, reprovados: 6, excecoes: 0, valorExcecoes: 0 },
  { agente: "Gabriella Almeida Rodrigues", mat: "69789", acionamentos: 1573, cpc: 45.7, acordos: 19, conversao: 1.2, valorTotal: 14360.32, primeiraParcela: 3802.29, reprovados: 0, excecoes: 0, valorExcecoes: 0 },
  { agente: "GABRIEL RODRIGUES DA ...", mat: "61600", acionamentos: 1477, cpc: 31.3, acordos: 5, conversao: 0.3, valorTotal: 1418.19, primeiraParcela: 285.29, reprovados: 1, excecoes: 0, valorExcecoes: 0 },
  { agente: "Beatriz Almeida dos Santos", mat: "69791", acionamentos: 1433, cpc: 67.8, acordos: 34, conversao: 2.4, valorTotal: 19218.78, primeiraParcela: 18238.28, reprovados: 7, excecoes: 0, valorExcecoes: 0 },
  { agente: "Danilo Rodrigues de Oliveira", mat: "63005", acionamentos: 1422, cpc: 42.8, acordos: 14, conversao: 1.0, valorTotal: 94991.60, primeiraParcela: 4616.50, reprovados: 17, excecoes: 0, valorExcecoes: 0 },
  { agente: "VANIA APARECIDA DOS SANT...", mat: "61596", acionamentos: 1236, cpc: 34.1, acordos: 6, conversao: 0.5, valorTotal: 10399.16, primeiraParcela: 517.49, reprovados: 0, excecoes: 0, valorExcecoes: 0 },
  { agente: "Tatiane Silva Xavier", mat: "63016", acionamentos: 1224, cpc: 57.5, acordos: 27, conversao: 2.2, valorTotal: 200654.50, primeiraParcela: 31116.00, reprovados: 6, excecoes: 0, valorExcecoes: 0 },
  { agente: "Ieska Mendes Pereira", mat: "63010", acionamentos: 1172, cpc: 47.6, acordos: 11, conversao: 0.9, valorTotal: 42642.35, primeiraParcela: 15165.36, reprovados: 1, excecoes: 0, valorExcecoes: 0 },
];

// Scatter plot data — acionamentos vs valor acordos
const MOCK_SCATTER_DATA = MOCK_PERFORMANCE_TABLE.map(a => ({
  name: a.agente,
  x: a.acionamentos,
  y: a.valorTotal,
  color: a.valorTotal > 50000 ? "#22c55e" : "#3b82f6",
}));

// ---------- Funil de Conversão (aggregate) ----------
const MOCK_FUNIL = {
  acionamentos: 31967,
  contatos: 13939,
  acordos: 372,
  primeiraParcela: 333560.16,
  valorAcordos: 1675038.91,
};

// ---------- Metas da equipe ----------
const MOCK_METAS = {
  cpc: 50, conversao: 2.0, ticketMedio: 5000, excecoes: 3.0,
};

// ---------- Agent enriched data for heatmap + regression ----------
const MOCK_AGENTS_ENRICHED = MOCK_PERFORMANCE_TABLE.map(a => ({
  ...a,
  cpcNorm: a.cpc / MOCK_METAS.cpc, // 1.0 = on target
  convNorm: a.conversao / MOCK_METAS.conversao,
  ticketNorm: (a.valorTotal / Math.max(a.acordos, 1)) / MOCK_METAS.ticketMedio,
  excNorm: a.excecoes <= 0 ? 0 : (a.excecoes / Math.max(a.acordos, 1) * 100) / MOCK_METAS.excecoes,
  ticketMedio: a.valorTotal / Math.max(a.acordos, 1),
  excPct: a.acordos > 0 ? (a.excecoes / a.acordos * 100) : 0,
  qtdContatos: Math.round(a.acionamentos * (a.cpc / 100)),
  // Efficiency composite: CPC * Conversão normalized
  efficiency: (a.cpc / 100) * (a.conversao / 100) * 1000,
  // Risk score (higher = needs more attention): low CPC + low Conv + high exceptions
  riskScore: Math.round(
    (1 - a.cpc / 100) * 35 +
    (1 - Math.min(a.conversao / 3, 1)) * 35 +
    (a.reprovados / Math.max(a.acordos, 1)) * 30
  ),
  // Sparkline data (simulated 7-day trend)
  sparkline: Array.from({ length: 7 }, (_, i) => {
    const base = a.valorTotal / 20;
    return Math.max(0, base + (Math.sin(i * 1.2 + a.acionamentos * 0.001) * base * 0.4));
  }),
}));

// ---------- Regression helpers ----------
function linearRegression(data, xKey, yKey) {
  const n = data.length;
  if (n < 3) return { slope: 0, intercept: 0, r2: 0 };
  const xs = data.map(d => d[xKey]);
  const ys = data.map(d => d[yKey]);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let ssxx = 0, ssxy = 0, ssyy = 0;
  for (let i = 0; i < n; i++) {
    ssxx += (xs[i] - mx) ** 2;
    ssxy += (xs[i] - mx) * (ys[i] - my);
    ssyy += (ys[i] - my) ** 2;
  }
  const slope = ssxy / (ssxx || 1);
  const intercept = my - slope * mx;
  const r2 = ssyy > 0 ? (ssxy ** 2) / (ssxx * ssyy) : 0;
  return { slope, intercept, r2 };
}

// ---------- Boletos / Efetividade Data ----------
const MOCK_BOLETOS_KPIS = [
  { label: "Boletos Gerados", value: 303, color: "#0f172a" },
  { label: "Pagos no Prazo", value: 132, color: "#0f172a" },
  { label: "% Conversão", value: "43.56%", color: "#f59e0b" },
  { label: "Efetividade", value: "48.90%", sub: "Recebido / Emitido", color: "#f59e0b" },
  { label: "Valor de Boletos Vencendo", value: "R$ 301.628,35", color: "#0f172a" },
  { label: "Valor Recebido", value: "R$ 147.501,57", color: "#16a34a" },
  { label: "Melhor Dia", value: "05/05 – 100.00%", color: "#16a34a" },
  { label: "Pior Dia", value: "01/05 – 0.00%", color: "#dc2626" },
];

const MOCK_EFETIVIDADE_DIARIA = [
  { dia: "01/05", boletos: 1, efetividade: 0 },
  { dia: "02/05", boletos: 5, efetividade: 20 },
  { dia: "03/05", boletos: 8, efetividade: 25 },
  { dia: "04/05", boletos: 11, efetividade: 36 },
  { dia: "05/05", boletos: 55, efetividade: 100 },
  { dia: "06/05", boletos: 48, efetividade: 88 },
  { dia: "07/05", boletos: 42, efetividade: 82 },
  { dia: "08/05", boletos: 12, efetividade: 33 },
  { dia: "09/05", boletos: 10, efetividade: 40 },
  { dia: "10/05", boletos: 8, efetividade: 25 },
  { dia: "11/05", boletos: 38, efetividade: 68 },
  { dia: "12/05", boletos: 5, efetividade: 20 },
  { dia: "13/05", boletos: 3, efetividade: 10 },
  { dia: "14/05", boletos: 28, efetividade: 57 },
  { dia: "15/05", boletos: 32, efetividade: 63 },
  { dia: "16/05", boletos: 25, efetividade: 52 },
  { dia: "17/05", boletos: 45, efetividade: 78 },
  { dia: "18/05", boletos: 48, efetividade: 80 },
  { dia: "19/05", boletos: 38, efetividade: 66 },
  { dia: "20/05", boletos: 25, efetividade: 48 },
];

const MOCK_TENDENCIA_MENSAL = [
  { mes: "Jan/26", conversao: 95, color: "#22c55e" },
  { mes: "Fev/26", conversao: 76, color: "#22c55e" },
  { mes: "Mar/26", conversao: 80, color: "#22c55e" },
  { mes: "Abr/26", conversao: 72, color: "#22c55e" },
  { mes: "Mai/26", conversao: 32, color: "#dc2626" },
];

const MOCK_RANKING_AGENTES_BOLETOS = [
  { nome: "Danilo.Rodrigues", pct: 57 },
  { nome: "Ieska.Mendes", pct: 45 },
  { nome: "Beatriz.Almeida", pct: 44 },
  { nome: "Raul.Weber", pct: 44 },
  { nome: "Gabriella.Rodrigues", pct: 42 },
  { nome: "Adriana.Mattos", pct: 39 },
  { nome: "Isaque.Ferreira", pct: 38 },
  { nome: "Luciana.Pereira", pct: 33 },
  { nome: "Jordana.Oliveira", pct: 32 },
  { nome: "Wilton.Silva", pct: 29 },
  { nome: "Andressa.Magalhães", pct: 23 },
  { nome: "Tatiane.Silva", pct: 22 },
];

const MOCK_EXCECOES_PORTFOLIO = [
  { nome: "Santander Financeira X...", qtd: 1 },
  { nome: "Santander Financeira X...", qtd: 1 },
];

const MOCK_REJEITADOS_PORTFOLIO = [
  { nome: "Santander Financeira X...", qtd: 22 },
  { nome: "Panamericano XV", qtd: 17 },
  { nome: "Yamaha II", qtd: 17 },
  { nome: "BVFinanceira VII", qtd: 8 },
  { nome: "Panamericano XII", qtd: 6 },
  { nome: "Santander Financeira X...", qtd: 6 },
  { nome: "BVFinanceira III", qtd: 5 },
  { nome: "Panamericano IX", qtd: 4 },
  { nome: "Santander Financeira X...", qtd: 4 },
  { nome: "Santander Financeira X...", qtd: 3 },
  { nome: "Panamericano XI", qtd: 3 },
];

// ---------- Acordos detalhados por portfólio (exceções, rejeitados, quebrados) ----------
const MOCK_ACORDOS_EXCECOES = [
  { id: "EXC-001", portfolio: "Santander Financeira X...", agente: "Wilton da Silva", mat: "63928", data: "2026-05-08", valor: 141.17, devedor: "MARLENE A SILVA BEZERRA", cpf: "076.***.***.99", motivo: "Portfólio CAMPO010 nulo — exceção não categorizada" },
  { id: "EXC-002", portfolio: "Santander Financeira X...", agente: "Adriana M. Mourão", mat: "63120", data: "2026-05-12", valor: 3200.00, devedor: "PEDRO H SANTOS", cpf: "234.***.***.11", motivo: "Valor abaixo do mínimo de negociação para a faixa" },
];

const MOCK_ACORDOS_REJEITADOS = [
  { id: "REJ-001", portfolio: "Santander Financeira X...", agente: "Jordana Oliveira", mat: "63123", data: "2026-05-03", valor: 8450.00, devedor: "CARLOS R MENDONÇA", cpf: "345.***.***.22", motivo: "Prazo excede política do portfólio (máx. 12x)" },
  { id: "REJ-002", portfolio: "Santander Financeira X...", agente: "Danilo Rodrigues", mat: "63005", data: "2026-05-04", valor: 2100.00, devedor: "ANA L FERREIRA", cpf: "456.***.***.33", motivo: "Entrada abaixo de 10% do valor total" },
  { id: "REJ-003", portfolio: "Panamericano XV", agente: "Beatriz Almeida", mat: "69791", data: "2026-05-05", valor: 5600.00, devedor: "JOSE M OLIVEIRA", cpf: "567.***.***.44", motivo: "Devedor com restrição ativa no portfólio" },
  { id: "REJ-004", portfolio: "Panamericano XV", agente: "Wilton da Silva", mat: "63928", data: "2026-05-06", valor: 3200.00, devedor: "MARIA S COSTA", cpf: "678.***.***.55", motivo: "Acordo duplicado — já existe negociação ativa" },
  { id: "REJ-005", portfolio: "Yamaha II", agente: "Tatiane Silva Xavier", mat: "63016", data: "2026-05-07", valor: 12800.00, devedor: "ROBERTO F LIMA", cpf: "789.***.***.66", motivo: "Desconto acima do teto autorizado (máx. 40%)" },
  { id: "REJ-006", portfolio: "Yamaha II", agente: "Larissa Lima", mat: "65789", data: "2026-05-09", valor: 4500.00, devedor: "FERNANDA A SOUZA", cpf: "890.***.***.77", motivo: "Prazo excede política do portfólio" },
  { id: "REJ-007", portfolio: "BVFinanceira VII", agente: "Gabriella Almeida", mat: "69789", data: "2026-05-10", valor: 1800.00, devedor: "LUCAS P SANTOS", cpf: "901.***.***.88", motivo: "Valor mínimo não atingido" },
  { id: "REJ-008", portfolio: "BVFinanceira VII", agente: "Ieska Mendes", mat: "63010", data: "2026-05-11", valor: 6200.00, devedor: "PATRICIA M SILVA", cpf: "012.***.***.99", motivo: "Documentação pendente do devedor" },
];
const MOCK_BOLETOS_QUEBRADOS = [
  { portfolio: "Santander Financeira XV", qtd: 8 },
  { portfolio: "Panamericano XV", qtd: 5 },
  { portfolio: "Yamaha II", qtd: 4 },
  { portfolio: "BVFinanceira VII", qtd: 3 },
  { portfolio: "Santander XXIV", qtd: 2 },
  { portfolio: "Panamericano XI", qtd: 2 },
  { portfolio: "BVFinanceira III", qtd: 1 },
];

const MOCK_BOLETOS_QUEBRADOS_DETALHE = [
  { id: "ACR-20260512-001", portfolio: "Santander Financeira XV", agente: "Wilton da Silva", mat: "63928", dataAcordo: "2026-05-02", dataQuebra: "2026-05-14", valorAcordo: 12450.00, parcelas: 6, parcelaPaga: 0, devedor: "CARLOS A. MENDES", cpf: "123.***.***.89", valorDivida: 28900.00, diasAtraso: 342, perfilRisco: "alto", previsaoQuebra: true, motivo: "Perfil de inadimplência crônica — dívida de 342 dias com 3 renegociações anteriores. Quebra prevista pelo modelo." },
  { id: "ACR-20260510-014", portfolio: "Santander Financeira XV", agente: "Jordana Oliveira", mat: "63123", dataAcordo: "2026-05-03", dataQuebra: "2026-05-12", valorAcordo: 8200.00, parcelas: 4, parcelaPaga: 1, devedor: "MARIA R. SOUZA", cpf: "456.***.***.12", valorDivida: 15600.00, diasAtraso: 180, perfilRisco: "medio", previsaoQuebra: false, motivo: "Perfil recuperável — devedor pagou 1ª parcela mas abandonou. Possível falha na argumentação do agente." },
  { id: "ACR-20260508-007", portfolio: "Panamericano XV", agente: "Adriana M. Mourão", mat: "63120", dataAcordo: "2026-05-01", dataQuebra: "2026-05-10", valorAcordo: 5300.00, parcelas: 3, parcelaPaga: 0, devedor: "JOSÉ F. OLIVEIRA", cpf: "789.***.***.34", valorDivida: 9200.00, diasAtraso: 520, perfilRisco: "alto", previsaoQuebra: true, motivo: "Dívida de 520 dias, sem histórico de pagamento anterior. Quebra prevista — devedor sem capacidade demonstrada." },
  { id: "ACR-20260506-022", portfolio: "Yamaha II", agente: "Danilo Rodrigues", mat: "63005", dataAcordo: "2026-05-04", dataQuebra: "2026-05-11", valorAcordo: 3150.00, parcelas: 2, parcelaPaga: 0, devedor: "ANA P. FERREIRA", cpf: "321.***.***.56", valorDivida: 6800.00, diasAtraso: 95, perfilRisco: "baixo", previsaoQuebra: false, motivo: "Perfil de baixo risco — dívida recente, 95 dias. Quebra inesperada. Investigar qualidade do acordo e condições oferecidas." },
  { id: "ACR-20260505-031", portfolio: "Santander Financeira XV", agente: "Beatriz Almeida", mat: "69791", dataAcordo: "2026-05-02", dataQuebra: "2026-05-09", valorAcordo: 18900.00, parcelas: 8, parcelaPaga: 2, devedor: "ROBERTO C. LIMA", cpf: "654.***.***.78", valorDivida: 42000.00, diasAtraso: 280, perfilRisco: "medio", previsaoQuebra: false, motivo: "Devedor pagou 2 parcelas antes de abandonar. Sugere problema de fluxo de caixa temporário, não incapacidade. Verificar se houve follow-up do agente." },
];

// Expose all
Object.assign(window, {
  formatBRLCompact, formatNumber, formatPercent,
  MOCK_KPIS, MOCK_RANKING, MOCK_HEATMAP, MOCK_BU_FINANCEIRO,
  MOCK_PORTFOLIO, MOCK_TOP_AGENTS_1P, MOCK_PRIMEIRA_PARCELA_PORTFOLIO, NAV_ITEMS,
  MOCK_AGENTS_LIST, MOCK_DETALHAMENTO_KPIS, MOCK_PERFORMANCE_TABLE, MOCK_SCATTER_DATA,
  MOCK_FUNIL, MOCK_METAS, MOCK_AGENTS_ENRICHED, linearRegression,
  MOCK_BOLETOS_KPIS, MOCK_EFETIVIDADE_DIARIA, MOCK_TENDENCIA_MENSAL,
  MOCK_RANKING_AGENTES_BOLETOS, MOCK_EXCECOES_PORTFOLIO, MOCK_REJEITADOS_PORTFOLIO,
  MOCK_BOLETOS_QUEBRADOS, MOCK_BOLETOS_QUEBRADOS_DETALHE,
  MOCK_ACORDOS_EXCECOES, MOCK_ACORDOS_REJEITADOS,
});
