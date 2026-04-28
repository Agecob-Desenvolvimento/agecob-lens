import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
}

export function ExecutiveRankingTable({
  title,
  rows,
  primaryColumnLabel,
  secondaryColumnLabel,
  maxRows = 10,
  loading,
  empty,
}: ExecutiveRankingTableProps) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-base font-semibold leading-snug">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : empty || rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados para o período.</p>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, maxRows).map((row) => (
                <TableRow key={`${row.rank}-${row.label}`}>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default ExecutiveRankingTable;
