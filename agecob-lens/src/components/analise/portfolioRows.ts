export interface BarRow {
  label: string;
  ratio: number;
  valueText: string;
  barColor: string;
  trackClass: string;
  valueClass: string;
}

export function excecoesToRows(data: Array<{ nome: string; qtd: number }>): BarRow[] {
  return data.map((d) => ({
    label: d.nome,
    ratio: 1,
    valueText: String(d.qtd),
    barColor: "#f43f5e",
    trackClass: "bg-rose-50",
    valueClass: "text-rose-600 font-semibold",
  }));
}

export function rejeitadosToRows(data: Array<{ nome: string; qtd: number }>): BarRow[] {
  return data.map((d) => ({
    label: d.nome,
    ratio: 1,
    valueText: String(d.qtd),
    barColor: "#f97316",
    trackClass: "bg-orange-50",
    valueClass: "text-orange-600 font-semibold",
  }));
}

export function quebradosToRows(data: Array<{ nome: string; qtd: number }>): BarRow[] {
  return data.map((d) => ({
    label: d.nome,
    ratio: 1,
    valueText: String(d.qtd),
    barColor: "#fb7185",
    trackClass: "bg-rose-50",
    valueClass: "text-rose-600 font-semibold",
  }));
}
