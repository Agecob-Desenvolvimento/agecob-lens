import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  description?: ReactNode;
  unit?: string;
  actions?: ReactNode;
  className?: string;
}

export function SectionHeader({ title, description, unit, actions, className }: SectionHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-baseline justify-between gap-6 pb-3 border-b border-border",
        className,
      )}
    >
      <div>
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-[11px] font-bold uppercase tracking-[0.14em] text-foreground">
            {title}
          </h3>
          {unit ? (
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {unit}
            </Badge>
          ) : null}
        </div>
        {description ? (
          <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed max-w-xl">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </header>
  );
}

export default SectionHeader;
