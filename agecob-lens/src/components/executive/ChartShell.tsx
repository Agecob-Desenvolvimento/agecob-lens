import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface ChartShellProps {
  title?: string;
  description?: string;
  loading?: boolean;
  empty?: boolean;
  error?: string | null;
  emptyMessage?: string;
  toolbar?: ReactNode;
  height?: number;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}

const DEFAULT_EMPTY = "Sem dados para o período.";
const DEFAULT_HEIGHT = 288;

export function ChartShell({
  title,
  description,
  loading,
  empty,
  error,
  emptyMessage = DEFAULT_EMPTY,
  toolbar,
  height = DEFAULT_HEIGHT,
  className,
  contentClassName,
  children,
}: ChartShellProps) {
  const hasHeader = Boolean(title || toolbar || description);

  let body: ReactNode;
  if (error) {
    body = (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
      >
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
        <span>{error}</span>
      </div>
    );
  } else if (loading) {
    body = <Skeleton className="w-full" style={{ height }} />;
  } else if (empty) {
    body = <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  } else {
    body = children;
  }

  return (
    <Card className={cn("rounded-lg border-slate-200 dark:border-border", className)}>
      {hasHeader ? (
        <CardHeader className="pb-2 pt-3 px-4 flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="min-w-0 space-y-1">
            {title ? (
              <CardTitle className="text-base font-semibold leading-snug">{title}</CardTitle>
            ) : null}
            {description ? (
              <p className="text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {toolbar ? <div className="shrink-0">{toolbar}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn("px-4 pb-4", hasHeader ? undefined : "pt-4", contentClassName)}>
        {body}
      </CardContent>
    </Card>
  );
}

export default ChartShell;
