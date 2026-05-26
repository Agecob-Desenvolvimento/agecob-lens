import type { RankingEntry } from "./RankingPrioridade";

export const MOCK_RANKING_ENTRIES: RankingEntry[] = [
  { id: "1", nome: "Carlos Andrade", mat: "10234", cpc: 18, conversao: 0.4, reprov: 12, acordos: 22, trend7d: [40, 38, 36, 34, 30, 28, 25] },
  { id: "2", nome: "Bruna Lemos", mat: "10455", cpc: 22, conversao: 0.6, reprov: 10, acordos: 28, trend7d: [50, 47, 45, 42, 40, 38, 36] },
  { id: "3", nome: "Diego Martins", mat: "10678", cpc: 25, conversao: 0.8, reprov: 9, acordos: 30, trend7d: [55, 52, 50, 49, 47, 46, 44] },
  { id: "4", nome: "Fernanda Silva", mat: "10812", cpc: 28, conversao: 0.9, reprov: 8, acordos: 35, trend7d: [60, 58, 56, 57, 55, 53, 51] },
  { id: "5", nome: "Gustavo Reis", mat: "10934", cpc: 32, conversao: 1.1, reprov: 6, acordos: 40, trend7d: [62, 64, 65, 66, 67, 68, 70] },
  { id: "6", nome: "Helena Costa", mat: "11045", cpc: 35, conversao: 1.3, reprov: 5, acordos: 45, trend7d: [70, 71, 73, 74, 75, 76, 78] },
  { id: "7", nome: "Igor Tavares", mat: "11156", cpc: 38, conversao: 1.5, reprov: 4, acordos: 50, trend7d: [72, 74, 75, 76, 78, 79, 81] },
  { id: "8", nome: "Juliana Alves", mat: "11278", cpc: 41, conversao: 1.8, reprov: 3, acordos: 55, trend7d: [78, 79, 80, 82, 83, 85, 87] },
  { id: "9", nome: "Kleber Souza", mat: "11389", cpc: 44, conversao: 2.0, reprov: 3, acordos: 60, trend7d: [80, 82, 84, 85, 87, 89, 90] },
  { id: "10", nome: "Larissa Pinto", mat: "11490", cpc: 46, conversao: 2.3, reprov: 2, acordos: 65, trend7d: [82, 84, 86, 88, 90, 92, 94] },
  { id: "11", nome: "Marcos Vinicius", mat: "11512", cpc: 20, conversao: 0.5, reprov: 11, acordos: 25, trend7d: [45, 44, 42, 40, 38, 36, 34] },
  { id: "12", nome: "Natalia Rocha", mat: "11623", cpc: 30, conversao: 1.0, reprov: 7, acordos: 38, trend7d: [60, 59, 58, 58, 57, 56, 55] },
];

export const MOCK_PARETO_POINTS: { nome: string; valor: number }[] = [
  { nome: "Larissa Pinto", valor: 285000 },
  { nome: "Kleber Souza", valor: 210000 },
  { nome: "Juliana Alves", valor: 165000 },
  { nome: "Igor Tavares", valor: 128000 },
  { nome: "Helena Costa", valor: 96000 },
  { nome: "Gustavo Reis", valor: 72000 },
  { nome: "Fernanda Silva", valor: 54000 },
  { nome: "Natalia Rocha", valor: 41000 },
  { nome: "Diego Martins", valor: 30000 },
  { nome: "Bruna Lemos", valor: 22000 },
  { nome: "Marcos Vinicius", valor: 15000 },
  { nome: "Carlos Andrade", valor: 10000 },
];
