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

function escapeCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildReportCsv(meta: Record<string, string>, sections: ReportSection[]): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(meta)) lines.push(`${escapeCell(k)},${escapeCell(v)}`);
  lines.push("");
  for (const s of sections) {
    const { columns, rows } = s.build();
    lines.push(escapeCell(`## ${s.label}`));
    lines.push(columns.map(escapeCell).join(","));
    for (const r of rows) lines.push(r.map(escapeCell).join(","));
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
