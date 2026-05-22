import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BlockHeaderProps {
  number: number | string;
  title: string;
  description?: ReactNode;
  className?: string;
}

export function BlockHeader({ number, title, description, className }: BlockHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 pb-2.5 border-b-2 border-border mb-4",
        className,
      )}
    >
      <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold bg-foreground text-background shrink-0">
        {number}
      </span>
      <div>
        <h3 className="m-0 text-[13px] font-bold uppercase tracking-[0.06em] text-foreground leading-tight">
          {title}
        </h3>
        {description ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

export default BlockHeader;
