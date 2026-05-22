import type { ReactNode } from "react";
import { ChartShell } from "@/components/executive/ChartShell";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtByUnit } from "@/lib/metrics";
import type { RankingRow } from "@/types/executive";

interface ExecutiveRankingTableProps {
  title: string;
  rows: RankingRow[];
  primaryColumnLabel: string;
  secondaryColumnLabel?: string;
  maxRows?: number;
  loading?: boolean;
  empty?: boolean;
  /** Render inline actions per row (e.g. open profile / compare buttons). */
  renderActions?: (row: RankingRow) => ReactNode;
  actionsColumnLabel?: string;
  highlightLabel?: string;
  /** Multi-label highlighting; index 0 = amber, index 1 = sky. Overrides highlightLabel when present. */
  highlightLabels?: string[];
}

const HIGHLIGHT_CLASSES = ["bg-warning-soft", "bg-sky-50"];

export function ExecutiveRankingTable({
  title,
  rows,
  primaryColumnLabel,
  secondaryColumnLabel,
  maxRows = 10,
  loading,
  empty,
  renderActions,
  actionsColumnLabel = "Ações",
  highlightLabel,
  highlightLabels,
}: ExecutiveRankingTableProps) {
  return (
    <ChartShell
      title={title}
      empty={!loading && (empty || rows.length === 0)}
      contentClassName="px-4 pb-3"
    >
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-xs">#</TableHead>
              <TableHead className="text-xs">Agente / Portfólio</TableHead>
              <TableHead className="text-xs text-right whitespace-nowrap">{primaryColumnLabel}</TableHead>
              {secondaryColumnLabel ? (
                <TableHead className="text-xs text-right whitespace-nowrap">{secondaryColumnLabel}</TableHead>
              ) : null}
              {renderActions ? (
                <TableHead className="text-xs text-right whitespace-nowrap w-1">{actionsColumnLabel}</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, maxRows).map((row) => {
              const multiIdx = highlightLabels ? highlightLabels.indexOf(row.label) : -1;
              const singleHit = highlightLabel != null && row.label === highlightLabel;
              const rowClass =
                multiIdx >= 0
                  ? HIGHLIGHT_CLASSES[multiIdx % HIGHLIGHT_CLASSES.length]
                  : singleHit
                    ? "bg-warning-soft"
                    : undefined;
              return (
                <TableRow
                  key={`${row.rank}-${row.label}`}
                  className={rowClass}
                >
                  <TableCell className="text-sm font-semibold tabular-nums text-muted-foreground">
                    {row.rank}
                  </TableCell>
                  <TableCell className="text-sm truncate max-w-[220px]" title={row.label}>
                    {row.label}
                  </TableCell>
                  <TableCell className="text-sm text-right tabular-nums font-semibold whitespace-nowrap">
                    {fmtByUnit(row.primaryValue, row.primaryUnit)}
                  </TableCell>
                  {secondaryColumnLabel ? (
                    <TableCell className="text-sm text-right tabular-nums whitespace-nowrap">
                      {row.secondaryValue != null && row.secondaryUnit
                        ? fmtByUnit(row.secondaryValue, row.secondaryUnit)
                        : "—"}
                    </TableCell>
                  ) : null}
                  {renderActions ? (
                    <TableCell className="text-right whitespace-nowrap">
                      {renderActions(row)}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </ChartShell>
  );
}

export default ExecutiveRankingTable;
