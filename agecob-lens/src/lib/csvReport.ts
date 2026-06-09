/**
 * Client-side CSV report builder. Serializes already-fetched dashboard data
 * (respects the active filter — it's the same data on screen). One file, várias
 * seções (bloco de metadados + cada seção com título, header e linhas).
 */

export interface ReportSection {
  id: string;
  label: string;
  /** false quando não há dados no filtro atual — fica desabilitado no seletor */
  available: boolean;
  build: () => { columns: string[]; rows: (string | number)[][] };
}

// Delimitador ';' + decimal vírgula → Excel pt-BR separa colunas e lê valores como
// número (manipulável: PROCV, SOMA). Inteiros sem casas; floats arredondados 2 casas.
const DELIM = ";";

function fmtCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",");
  }
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildReportCsv(meta: Record<string, string>, sections: ReportSection[]): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(meta)) lines.push(`${fmtCell(k)}${DELIM}${fmtCell(v)}`);
  lines.push("");
  for (const s of sections) {
    const { columns, rows } = s.build();
    lines.push(fmtCell(`## ${s.label}`));
    lines.push(columns.map(fmtCell).join(DELIM));
    for (const r of rows) lines.push(r.map(fmtCell).join(DELIM));
    lines.push("");
  }
  return "﻿" + lines.join("\r\n");
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
