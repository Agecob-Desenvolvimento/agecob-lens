import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AgentFilterBarProps {
  agents: string[];
  selected: string | null;
  onSelect: (agent: string | null) => void;
}

export function AgentFilterBar({ agents, selected, onSelect }: AgentFilterBarProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = agents.filter((a) => a.toLowerCase().includes(search.toLowerCase()));
  const displayName = selected ?? "Todos os agentes";

  const handleSelect = (agent: string | null) => {
    onSelect(agent);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={ref} className="relative w-full max-w-[360px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground",
          selected ? "font-semibold" : "font-normal",
        )}
      >
        <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="flex-1 truncate text-left">{displayName}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 flex max-h-80 flex-col rounded-lg border border-border bg-card shadow-lg">
          <div className="border-b border-border p-2">
            <input
              type="text"
              placeholder="Buscar agente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className={cn(
                "block w-full rounded px-2.5 py-1.5 text-left text-xs",
                selected === null
                  ? "bg-sky-50 font-semibold text-sky-700"
                  : "font-medium text-foreground hover:bg-muted",
              )}
            >
              Todos
            </button>
            {filtered.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => handleSelect(a)}
                className={cn(
                  "block w-full truncate rounded px-2.5 py-1 text-left text-xs",
                  selected === a
                    ? "bg-sky-50 font-semibold text-sky-700"
                    : "text-foreground hover:bg-muted",
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentFilterBar;
