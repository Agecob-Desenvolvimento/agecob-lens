import type { KpiDatum } from "./DetalhamentoKpiStrip";

export const MOCK_AGENTS_LIST: string[] = [
  "Adriana Mattps Mourão Fernandes",
  "Andressa Magalhães dos Santos",
  "Beatriz Almeida dos Santos",
  "Danilo Rodrigues de Oliveira",
  "Edezio Jose da Silva",
  "Flávio Ferreira da Silva",
  "Gabriel Rodrigues da Silva",
  "Gabriella Almeida Rodrigues",
  "Guilherme Eleuterio Faustino",
  "Hachly Anderson Doxaint",
  "Henrique Carrijo de Souza",
  "Ieska Mendes Pereira",
  "Isaque Ferreira da Silva Gomes",
  "Joane Araujo Falcao",
  "Jordana Oliveira da Conceição",
  "Larissa Lima de Oliveira",
  "Luciana Pereira Miranda",
  "Luciano Renato Dos Santos",
  "Sheila Cristina Honorato",
  "Tatiane Silva Xavier",
];

export interface DetalhamentoKpis {
  primary: KpiDatum[];
  secondary: KpiDatum[];
}

export const MOCK_DETALHAMENTO_KPIS: DetalhamentoKpis = {
  primary: [
    { id: "valor_acordos", label: "Valor Acordos", value: 1_675_038.91, unit: "BRL" },
    { id: "primeira_parcela", label: "1ª Parcela", value: 333_560.16, unit: "BRL" },
    { id: "qtd_acordos", label: "Qtd Acordos", value: 372, unit: "count" },
    { id: "ticket_medio", label: "Ticket Médio", value: 4_502.79, unit: "BRL" },
  ],
  secondary: [
    { id: "cpc", label: "CPC %", value: 43.6, unit: "%" },
    { id: "conversao", label: "Conversão %", value: 1.2, unit: "%" },
    { id: "qtd_acionamentos", label: "Qtd Acionamentos", value: 31_967, unit: "count" },
    { id: "qtd_contatos", label: "Qtd Contatos", value: 13_939, unit: "count" },
    { id: "qtd_excecoes", label: "Qtd Exceções", value: 3, unit: "count" },
    { id: "excecoes_valor", label: "Exceções % (Valor)", value: 1.1, unit: "%" },
  ],
};
