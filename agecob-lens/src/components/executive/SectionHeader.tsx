import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  description?: string;
  unit?: string;
  className?: string;
}

export function SectionHeader({ title, description, unit, className }: SectionHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-1 mt-2 mb-1", className)}>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {unit ? (
          <Badge variant="outline" className="font-mono text-[10px] uppercase">
            {unit}
          </Badge>
        ) : null}
      </div>
      {description ? (
        <p className="text-xs text-muted-foreground leading-snug">{description}</p>
      ) : null}
    </header>
  );
}

export default SectionHeader;
