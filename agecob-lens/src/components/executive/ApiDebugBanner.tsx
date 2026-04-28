import { AlertTriangle, Bug, ChevronDown, ChevronUp, RefreshCw, WifiOff } from "lucide-react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ApiDebugBannerProps {
  /** Erro principal (quando TODAS as fontes falharam) */
  error?: string | null;
  /** Avisos parciais (falhas de fontes individuais) */
  warnings?: string[];
  /** Callback de retry */
  onRetry?: () => void;
}

function classifyError(msg: string): { icon: typeof WifiOff; color: string; label: string } {
  const m = msg.toLowerCase();
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("err_connection_refused"))
    return { icon: WifiOff, color: "text-rose-600", label: "Sem conexão com a API (servidor não responde)" };
  if (m.includes("http 5"))
    return { icon: Bug, color: "text-orange-600", label: "Erro interno do servidor (5xx)" };
  if (m.includes("http 4"))
    return { icon: AlertTriangle, color: "text-amber-600", label: "Requisição inválida (4xx)" };
  if (m.includes("non-json") || m.includes("content-type"))
    return { icon: Bug, color: "text-purple-600", label: "Resposta inesperada da API (não-JSON)" };
  return { icon: AlertTriangle, color: "text-rose-600", label: "Falha de conexão com a API" };
}

function parseSource(msg: string): { source: string; detail: string; type: string } {
  // Format: "COBwebRCBAUTOS: productivity failed (Failed to fetch)"
  //         "COBwebRCBAUTOS: health check failed (Failed to fetch)"
  const match = msg.match(/^([\w]+):\s*([\w\s]+?)\s+failed\s*\((.+)\)$/i);
  if (match) {
    const source = match[1].replace("COBwebRCB", "");
    const type = match[2].trim();      // "productivity" | "health check"
    const detail = match[3].trim();    // "Failed to fetch"
    return { source, detail, type };
  }
  const colonIdx = msg.indexOf(":");
  if (colonIdx > 0) {
    return {
      source: msg.slice(0, colonIdx).replace("COBwebRCB", ""),
      detail: msg.slice(colonIdx + 1).trim(),
      type: "",
    };
  }
  return { source: "API", detail: msg, type: "" };
}

/** Agrupa mensagens por fonte, juntando tipo de falha. Elimina duplicatas de detail. */
function deduplicateMessages(messages: string[]): Array<{ source: string; details: string[] }> {
  const map = new Map<string, Set<string>>();
  for (const msg of messages) {
    const { source, detail } = parseSource(msg);
    const set = map.get(source) ?? new Set<string>();
    set.add(detail);
    map.set(source, set);
  }
  return Array.from(map.entries()).map(([source, details]) => ({
    source,
    details: Array.from(details),
  }));
}

export function ApiDebugBanner({ error, warnings = [], onRetry }: ApiDebugBannerProps) {
  const [expanded, setExpanded] = useState(false);

  const hasIssue = Boolean(error) || warnings.length > 0;
  if (!hasIssue) return null;

  const isCritical = Boolean(error);

  // Merge error + warnings, dedup by source
  const allRaw = error
    ? [error, ...warnings.filter((w) => w !== error)]
    : warnings;
  const grouped = deduplicateMessages(allRaw);

  const primaryMsg = allRaw[0] ?? "";
  const { icon: Icon, color, label } = classifyError(primaryMsg);
  const ts = new Date().toLocaleTimeString("pt-BR");

  return (
    <Card
      className={cn(
        "border",
        isCritical
          ? "border-rose-400/60 bg-rose-50 dark:bg-rose-950/20"
          : "border-amber-400/60 bg-amber-50 dark:bg-amber-950/20",
      )}
    >
      <CardContent className="py-3 px-4 space-y-2">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", color)} />
          <div className="flex-1 min-w-0">
            <p className={cn("text-sm font-semibold leading-snug", color)}>{label}</p>

            {/* Always show first source; rest only when expanded */}
            {(expanded ? grouped : grouped.slice(0, 1)).map(({ source, details }) => (
              <p key={source} className="text-xs text-muted-foreground font-mono mt-0.5 break-all">
                <span className="font-semibold text-foreground">[{source}]</span>{" "}
                {details.join(" · ")}
              </p>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground tabular-nums">{ts}</span>

            {onRetry && (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onRetry}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            )}

            {grouped.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {expanded ? "menos" : `+${grouped.length - 1} fonte(s)`}
              </Button>
            )}
          </div>
        </div>

        {/* Expandable debug tips */}
        {isCritical && expanded && (
          <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-xs space-y-1 font-mono">
            <p className="font-semibold text-foreground">Diagnóstico:</p>
            <p className="text-muted-foreground">
              • Backend FastAPI rodando?{" "}
              <span className="text-foreground">
                curl http://127.0.0.1:8000/health/db/COBwebRCBAUTOS
              </span>
            </p>
            <p className="text-muted-foreground">
              • VITE_API_BASE_URL:{" "}
              <span className="text-foreground">
                {import.meta.env.VITE_API_BASE_URL || "não definido → tenta 127.0.0.1:8000 → localhost:8000"}
              </span>
            </p>
            <p className="text-muted-foreground">
              • SQL Server acessível a partir do backend?
            </p>
            <p className="text-muted-foreground">
              • DevTools → Network → filtre por <span className="text-foreground">8000</span> para ver a request exata
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ApiDebugBanner;
