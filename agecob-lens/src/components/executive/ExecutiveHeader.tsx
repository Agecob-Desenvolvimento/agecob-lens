import { Check, RefreshCw } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Input } from "@/components/ui/input";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { cn } from "@/lib/utils";

interface ExecutiveHeaderProps {
  title: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshHint?: string;
}

const CATEGORIAS = ["Todas", "AUTOS", "CONSUMER"] as const;

export function ExecutiveHeader({
  title,
  onRefresh,
  refreshing,
  refreshHint,
}: ExecutiveHeaderProps) {
  // dateFromInput/dateToInput = estado pendente (o que os campos exibem enquanto o
  // usuário edita). dateFrom/dateTo (não usados aqui) só mudam quando applyDateRange
  // confirma o par — é isso que as queries do dashboard consomem.
  const {
    category,
    setCategory,
    dateFromInput,
    setDateFrom,
    dateToInput,
    setDateTo,
    dateRangeDirty,
    dateRangeValid,
    applyDateRange,
  } = useGlobalFilters();

  const handleApply = () => {
    if (dateRangeDirty) applyDateRange();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleApply();
  };

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card px-4 py-3 flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2 shrink-0">
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

      <h1 className="text-base font-semibold text-foreground tracking-tight truncate flex-1 min-w-0 flex items-center gap-2">
        <span className="truncate">{title}</span>
        <span
          className="text-[11px] font-mono font-normal text-muted-foreground bg-muted px-2 py-[2px] rounded shrink-0"
          title="Versão do dashboard (git short SHA)"
        >
          v{__COMMIT_SHA__}
        </span>
      </h1>

      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <label htmlFor="hdr-date-from" className="text-[11px] font-medium text-muted-foreground">De</label>
          <Input
            id="hdr-date-from"
            type="date"
            value={dateFromInput}
            onChange={(e) => setDateFrom(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-invalid={!dateRangeValid}
            className={cn("h-7 w-[140px] text-xs", !dateRangeValid && "border-rose-400 focus-visible:ring-rose-400")}
          />
          <label htmlFor="hdr-date-to" className="text-[11px] font-medium text-muted-foreground">Até</label>
          <Input
            id="hdr-date-to"
            type="date"
            value={dateToInput}
            onChange={(e) => setDateTo(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-invalid={!dateRangeValid}
            className={cn("h-7 w-[140px] text-xs", !dateRangeValid && "border-rose-400 focus-visible:ring-rose-400")}
          />
          <button
            type="button"
            onClick={handleApply}
            disabled={!dateRangeDirty || !dateRangeValid}
            title={!dateRangeValid ? "\"De\" precisa ser anterior ou igual a \"Até\"" : "Aplicar período"}
            className={cn(
              "h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-xs font-medium transition-colors border",
              dateRangeDirty && dateRangeValid
                ? "bg-foreground text-background border-foreground hover:opacity-90"
                : "bg-card text-muted-foreground border-border cursor-not-allowed opacity-60",
            )}
          >
            <Check className="h-3.5 w-3.5" />
            OK
          </button>
          {!dateRangeValid ? (
            <span className="text-[11px] text-rose-500 font-medium" role="alert">
              "De" deve ser ≤ "Até"
            </span>
          ) : null}
        </div>

        <div className="inline-flex rounded-md border border-border overflow-hidden">
          {CATEGORIAS.map((opt) => {
            const active = category === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setCategory(opt)}
                className={cn(
                  "h-7 px-3 text-xs font-medium transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "bg-card text-muted-foreground hover:bg-muted",
                )}
                aria-pressed={active}
              >
                {opt}
              </button>
            );
          })}
        </div>

        <ThemeToggle />
      </div>
    </header>
  );
}

export default ExecutiveHeader;
