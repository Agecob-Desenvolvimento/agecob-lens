import type { AgentRow } from "./PerformanceHeatmap";

// Derived from MOCK_PERFORMANCE_TABLE in design handoff (data.jsx).
// contatos = round(acionamentos * cpc/100); excecoesPct simulated for realism.
export const MOCK_AGENTS_ENRICHED: AgentRow[] = [
  { id: "63928", nome: "Isaque Ferreira da Silva", mat: "63928", cpc: 52.5, conversao: 0.5, valorAcordos: 9656.17, contatos: 1307, excecoesPct: 0.0, primeiraParcela: 8439.32 },
  { id: "63123", nome: "Jordana Oliveira da Conceicao", mat: "63123", cpc: 41.9, conversao: 1.4, valorAcordos: 176093.49, contatos: 853, excecoesPct: 1.2, primeiraParcela: 16672.86 },
  { id: "65789", nome: "Larissa Lima de Oliveira", mat: "65789", cpc: 51.4, conversao: 0.3, valorAcordos: 34382.00, contatos: 930, excecoesPct: 0.0, primeiraParcela: 10362.00 },
  { id: "63003", nome: "Andressa Magalhaes dos Santos", mat: "63003", cpc: 54.1, conversao: 1.2, valorAcordos: 184234.58, contatos: 973, excecoesPct: 4.5, primeiraParcela: 11998.18 },
  { id: "63125", nome: "Sheila Cristina Honorato", mat: "63125", cpc: 43.8, conversao: 0.3, valorAcordos: 16934.36, contatos: 784, excecoesPct: 0.0, primeiraParcela: 4698.36 },
  { id: "63120", nome: "Adriana Mattos Mourao Fernandes", mat: "63120", cpc: 70.7, conversao: 1.3, valorAcordos: 76645.43, contatos: 1241, excecoesPct: 2.1, primeiraParcela: 27786.85 },
  { id: "66345", nome: "Edezio Jose da Silva", mat: "66345", cpc: 29.9, conversao: 0.5, valorAcordos: 31109.17, contatos: 499, excecoesPct: 12.5, primeiraParcela: 6441.17 },
  { id: "69789", nome: "Gabriella Almeida Rodrigues", mat: "69789", cpc: 45.7, conversao: 1.2, valorAcordos: 14360.32, contatos: 719, excecoesPct: 0.0, primeiraParcela: 3802.29 },
  { id: "61600", nome: "Gabriel Rodrigues da Costa", mat: "61600", cpc: 31.3, conversao: 0.3, valorAcordos: 1418.19, contatos: 462, excecoesPct: 20.0, primeiraParcela: 285.29 },
  { id: "69791", nome: "Beatriz Almeida dos Santos", mat: "69791", cpc: 67.8, conversao: 2.4, valorAcordos: 19218.78, contatos: 972, excecoesPct: 0.0, primeiraParcela: 18238.28 },
  { id: "63005", nome: "Danilo Rodrigues de Oliveira", mat: "63005", cpc: 42.8, conversao: 1.0, valorAcordos: 94991.60, contatos: 609, excecoesPct: 7.1, primeiraParcela: 4616.50 },
  { id: "61596", nome: "Vania Aparecida dos Santos", mat: "61596", cpc: 34.1, conversao: 0.5, valorAcordos: 10399.16, contatos: 421, excecoesPct: 16.7, primeiraParcela: 517.49 },
  { id: "63016", nome: "Tatiane Silva Xavier", mat: "63016", cpc: 57.5, conversao: 2.2, valorAcordos: 200654.50, contatos: 704, excecoesPct: 3.7, primeiraParcela: 31116.00 },
  { id: "63010", nome: "Ieska Mendes Pereira", mat: "63010", cpc: 47.6, conversao: 0.9, valorAcordos: 42642.35, contatos: 558, excecoesPct: 9.1, primeiraParcela: 15165.36 },
  { id: "70112", nome: "Carlos Henrique Souza", mat: "70112", cpc: 38.2, conversao: 0.8, valorAcordos: 22510.45, contatos: 510, excecoesPct: 5.0, primeiraParcela: 5320.10 },
  { id: "70220", nome: "Patricia Nunes Alves", mat: "70220", cpc: 62.4, conversao: 1.8, valorAcordos: 130200.00, contatos: 880, excecoesPct: 1.5, primeiraParcela: 22000.00 },
];
