import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

interface FilterChip {
  label: string;
  value: string;
}

interface ExecutiveHeaderProps {
  title: string;
  period?: string;
  filters?: FilterChip[];
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshHint?: string;
  periodControl?: ReactNode;
}

export function ExecutiveHeader({
  title,
  period,
  filters,
  onRefresh,
  refreshing,
  refreshHint,
  periodControl,
}: ExecutiveHeaderProps) {
  return (
    <header className="border-b border-border bg-card px-4 py-3 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center"
            title={refreshHint ?? "Atualizar"}
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""} text-muted-foreground hover:text-foreground`}
            />
          </button>
        ) : null}
      </div>
      <h1 className="text-base font-semibold text-foreground tracking-tight truncate flex-1 min-w-0">
        {title}
      </h1>
      <div className="flex flex-wrap items-center gap-2">
        {periodControl ?? (period ? (
          <Badge variant="outline" className="text-xs capitalize">
            {period}
          </Badge>
        ) : null)}
        {filters?.map((chip) => (
          <Badge key={`${chip.label}-${chip.value}`} variant="secondary" className="text-xs">
            <span className="text-muted-foreground mr-1">{chip.label}:</span>
            <span className="font-semibold">{chip.value}</span>
          </Badge>
        ))}
      </div>
    </header>
  );
}

export default ExecutiveHeader;
