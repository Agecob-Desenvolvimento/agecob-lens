// Frontend-only mock data for the Análise & Efetividade page (handoff §3).
// Mirrors the design-handoff data.jsx shapes. Backend wiring is a future step.

export interface BoletoKpi {
  label: string;
  value: number | string;
  color: string;
  sub?: string;
  /** Tipo do valor — controla ordem e tamanho do card (BRL > percent > count). */
  unit?: "BRL" | "percent" | "count";
}

export const MOCK_BOLETOS_KPIS: BoletoKpi[] = [
  { label: "Boletos Gerados", value: 303, color: "hsl(var(--chart-ink))" },
  { label: "Pagos no Prazo", value: 132, color: "hsl(var(--chart-ink))" },
  { label: "% Conversão", value: "43,56%", color: "#f59e0b" },
  { label: "Efetividade", value: "48,90%", color: "#f59e0b" },
  { label: "Valor Boletos Vencendo", value: "R$ 301.628,35", color: "hsl(var(--chart-ink))" },
  { label: "Valor Recebido", value: "R$ 147.501,57", color: "#16a34a" },
  { label: "Melhor Dia", value: "05/05 · 100%", color: "#16a34a" },
  { label: "Pior Dia", value: "01/05 · 0%", color: "#dc2626" },
];

export interface EfetividadeDiaria {
  dia: string;
  boletos: number;
  efetividade: number;
}

export const MOCK_EFETIVIDADE_DIARIA: EfetividadeDiaria[] = [
  { dia: "01/05", boletos: 12, efetividade: 0 },
  { dia: "02/05", boletos: 18, efetividade: 22 },
  { dia: "03/05", boletos: 25, efetividade: 40 },
  { dia: "04/05", boletos: 30, efetividade: 55 },
  { dia: "05/05", boletos: 14, efetividade: 100 },
  { dia: "06/05", boletos: 22, efetividade: 48 },
  { dia: "07/05", boletos: 28, efetividade: 60 },
  { dia: "08/05", boletos: 35, efetividade: 52 },
  { dia: "09/05", boletos: 40, efetividade: 45 },
  { dia: "10/05", boletos: 20, efetividade: 30 },
  { dia: "11/05", boletos: 16, efetividade: 38 },
  { dia: "12/05", boletos: 24, efetividade: 50 },
  { dia: "13/05", boletos: 31, efetividade: 58 },
  { dia: "14/05", boletos: 27, efetividade: 47 },
  { dia: "15/05", boletos: 33, efetividade: 62 },
  { dia: "16/05", boletos: 29, efetividade: 44 },
  { dia: "17/05", boletos: 21, efetividade: 35 },
  { dia: "18/05", boletos: 19, efetividade: 41 },
  { dia: "19/05", boletos: 26, efetividade: 53 },
  { dia: "20/05", boletos: 23, efetividade: 49 },
];

export interface TendenciaMensal {
  mes: string;
  conversao: number;
  color: string;
}

export const MOCK_TENDENCIA_MENSAL: TendenciaMensal[] = [
  { mes: "Jan/26", conversao: 52, color: "#22c55e" },
  { mes: "Fev/26", conversao: 48, color: "#22c55e" },
  { mes: "Mar/26", conversao: 38, color: "#dc2626" },
  { mes: "Abr/26", conversao: 45, color: "#22c55e" },
  { mes: "Mai/26", conversao: 43, color: "#22c55e" },
];

export interface RankingAgenteBoleto {
  nome: string;
  pct: number;
}

export const MOCK_RANKING_AGENTES_BOLETOS: RankingAgenteBoleto[] = [
  { nome: "Larissa Pinto", pct: 72 },
  { nome: "Kleber Souza", pct: 68 },
  { nome: "Juliana Alves", pct: 64 },
  { nome: "Igor Tavares", pct: 55 },
  { nome: "Helena Costa", pct: 51 },
  { nome: "Gustavo Reis", pct: 47 },
  { nome: "Fernanda Silva", pct: 42 },
  { nome: "Diego Martins", pct: 38 },
];

export interface PortfolioValor {
  nome: string;
  valor: number;
}

export const MOCK_PORTFOLIO: PortfolioValor[] = [
  { nome: "Santander Financeira", valor: 285000 },
  { nome: "BV Financeira", valor: 198000 },
  { nome: "Omni", valor: 142000 },
  { nome: "Itaú Consignado", valor: 96000 },
  { nome: "Pan", valor: 54000 },
];

export interface PortfolioQtd {
  nome: string;
  qtd: number;
}

export const MOCK_EXCECOES_PORTFOLIO: PortfolioValor[] = [
  { nome: "Santander Financeira", valor: 48000 },
  { nome: "BV Financeira", valor: 22000 },
  { nome: "Omni", valor: 9000 },
];

export const MOCK_REJEITADOS_PORTFOLIO: PortfolioValor[] = [
  { nome: "Santander Financeira", valor: 91000 },
  { nome: "BV Financeira", valor: 63000 },
  { nome: "Omni", valor: 40000 },
  { nome: "Pan", valor: 18000 },
];

export const MOCK_BOLETOS_QUEBRADOS: PortfolioQtd[] = [
  { nome: "Santander Financeira", qtd: 7 },
  { nome: "BV Financeira", qtd: 5 },
  { nome: "Omni", qtd: 3 },
  { nome: "Itaú Consignado", qtd: 2 },
];

export interface AcordoQuebrado {
  id: string;
  portfolio: string;
  devedor: string;
  agente: string;
  mat: string;
  dataAcordo: string;
  dataQuebra: string;
  valorAcordo: number;
  parcelas: number;
  parcelaPaga: number;
  cpf: string;
  valorDivida: number;
  diasAtraso: number;
  perfilRisco: "alto" | "medio" | "baixo";
  previsaoQuebra: boolean;
  motivo: string;
}

export { type QuebraFaixa } from "./CurvaQuebraAtrasoChart";

export const MOCK_CURVA_QUEBRA_ATRASO: QuebraFaixa[] = [
  { faixa: "0-5 dias", taxaQuebra: 5, total: 1200 },
  { faixa: "6-15 dias", taxaQuebra: 11, total: 980 },
  { faixa: "16-30 dias", taxaQuebra: 23, total: 750 },
  { faixa: "31-60 dias", taxaQuebra: 38, total: 520 },
  { faixa: "60+ dias", taxaQuebra: 57, total: 310 },
];

export const MOCK_BOLETOS_QUEBRADOS_DETALHE: AcordoQuebrado[] = [
  {
    id: "QBR-001",
    portfolio: "Santander Financeira",
    devedor: "Marlene A. S. Bezerra",
    agente: "Wilton da Silva",
    mat: "63012",
    dataAcordo: "02/04/2026",
    dataQuebra: "05/05/2026",
    valorAcordo: 4520.0,
    parcelas: 12,
    parcelaPaga: 1,
    cpf: "076.***.**** -99",
    valorDivida: 14180.0,
    diasAtraso: 420,
    perfilRisco: "alto",
    previsaoQuebra: true,
    motivo: "Histórico de inadimplência recorrente; renda comprometida acima de 60%.",
  },
  {
    id: "QBR-002",
    portfolio: "Santander Financeira",
    devedor: "José Carlos Pereira",
    agente: "Bruna Lemos",
    mat: "63455",
    dataAcordo: "10/04/2026",
    dataQuebra: "12/05/2026",
    valorAcordo: 2890.0,
    parcelas: 6,
    parcelaPaga: 2,
    cpf: "123.***.**** -01",
    valorDivida: 6700.0,
    diasAtraso: 180,
    perfilRisco: "medio",
    previsaoQuebra: false,
    motivo: "Pagou 2 parcelas e cessou; sem sinal prévio no score. Investigar contato.",
  },
  {
    id: "QBR-003",
    portfolio: "BV Financeira",
    devedor: "Ana Paula Rocha",
    agente: "Diego Martins",
    mat: "63678",
    dataAcordo: "15/04/2026",
    dataQuebra: "18/05/2026",
    valorAcordo: 1980.0,
    parcelas: 4,
    parcelaPaga: 0,
    cpf: "456.***.**** -77",
    valorDivida: 5300.0,
    diasAtraso: 310,
    perfilRisco: "alto",
    previsaoQuebra: true,
    motivo: "Quebra na 1ª parcela; perfil de alto risco já sinalizado pelo modelo.",
  },
];
