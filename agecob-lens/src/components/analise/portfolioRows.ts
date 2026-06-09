import { formatBRLCompact } from "@/lib/metrics";

export interface BarRow {
  label: string;
  ratio: number;
  valueText: string;
  barColor: string;
  trackClass: string;
  valueClass: string;
}

type Tone = Pick<BarRow, "barColor" | "trackClass" | "valueClass">;

const TONES: Record<"excecoes" | "rejeitados" | "quebrados", Tone> = {
  excecoes: { barColor: "#f43f5e", trackClass: "bg-rose-50", valueClass: "text-rose-600 font-semibold" },
  rejeitados: { barColor: "#f97316", trackClass: "bg-orange-50", valueClass: "text-orange-600 font-semibold" },
  quebrados: { barColor: "#fb7185", trackClass: "bg-rose-50", valueClass: "text-rose-600 font-semibold" },
};

function valorToRows(data: Array<{ nome: string; valor: number }>, tone: Tone): BarRow[] {
  const max = Math.max(...data.map((d) => d.valor), 1);
  return data.map((d) => ({
    label: d.nome,
    ratio: d.valor / max,
    valueText: formatBRLCompact(d.valor),
    ...tone,
  }));
}

export const excecoesValorToRows = (data: Array<{ nome: string; valor: number }>) => valorToRows(data, TONES.excecoes);
export const rejeitadosValorToRows = (data: Array<{ nome: string; valor: number }>) => valorToRows(data, TONES.rejeitados);
export const quebradosValorToRows = (data: Array<{ nome: string; valor: number }>) => valorToRows(data, TONES.quebrados);
