import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Loader2, RotateCcw, Send, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAgentChat } from "@/hooks/useAgentChat";
import type { AgentResponse } from "@/services/api";

const HIGHLIGHT_STYLES: Record<AgentResponse["highlights"][number]["type"], string> = {
  anomaly: "border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300",
  metric: "border-sky-200 dark:border-sky-800/70 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300",
  portfolio: "border-slate-200 dark:border-border bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200",
};

const CONFIDENCE_STYLES: Record<AgentResponse["confidence"], { dot: string; label: string }> = {
  high: { dot: "bg-emerald-500", label: "confiança alta" },
  medium: { dot: "bg-amber-500", label: "confiança média" },
  low: { dot: "bg-rose-500", label: "confiança baixa" },
};

const STARTER_QUESTIONS = [
  "Quais carteiras estão com risco alto no período?",
  "Onde está concentrado o valor de 1ª parcela?",
];

function AssistantTurn({ response, onAction, disabled }: {
  response: AgentResponse;
  onAction: (prompt: string) => void;
  disabled: boolean;
}) {
  const confidence = CONFIDENCE_STYLES[response.confidence] ?? CONFIDENCE_STYLES.low;
  return (
    <div className="max-w-[90%] space-y-2">
      <div className="rounded-lg bg-muted px-3 py-2 text-sm leading-snug prose prose-sm prose-slate max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-2 prose-headings:text-sm prose-table:my-2 prose-strong:text-foreground text-foreground">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{response.text}</ReactMarkdown>
      </div>
      {response.highlights.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {response.highlights.map((h, idx) => (
            <Badge
              key={`${h.label}-${idx}`}
              variant="outline"
              className={cn("font-normal", HIGHLIGHT_STYLES[h.type] ?? HIGHLIGHT_STYLES.metric)}
            >
              {h.label}
              {h.value ? `: ${h.value}` : ""}
            </Badge>
          ))}
        </div>
      )}
      {response.suggested_actions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {response.suggested_actions.map((action, idx) => (
            <Button
              key={`${action.label}-${idx}`}
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={disabled || !action.prompt}
              onClick={() => action.prompt && onAction(action.prompt)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className={cn("h-1.5 w-1.5 rounded-full", confidence.dot)} />
          {confidence.label}
        </span>
        {response.data_sources.length > 0 && <span>· {response.data_sources.join(", ")}</span>}
        {response.data_referencia && <span>· ref. {response.data_referencia}</span>}
      </div>
    </div>
  );
}

export function AgentChatPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { turns, sendMessage, reset, pending, error } = useAgentChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, pending]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || !input.trim()) return;
    sendMessage(input);
    setInput("");
  };

  if (!open) {
    return (
      <Button
        size="icon"
        className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
        aria-label="Abrir analista de carteiras"
      >
        <Bot className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 z-50 flex h-[560px] max-h-[calc(100vh-3rem)] w-[380px] max-w-[calc(100vw-3rem)] flex-col shadow-2xl">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Bot className="h-4 w-4 text-primary" />
          Analista de Carteiras
          <Badge variant="secondary" className="text-[10px]">IA</Badge>
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={reset}
            disabled={pending || turns.length === 0}
            aria-label="Limpar conversa"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setOpen(false)}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {turns.length === 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-sm text-muted-foreground">
              Pergunte sobre risco, valor e desempenho das carteiras do período selecionado.
            </p>
            <div className="flex flex-col gap-1.5">
              {STARTER_QUESTIONS.map((question) => (
                <Button
                  key={question}
                  size="sm"
                  variant="outline"
                  className="h-auto justify-start whitespace-normal py-1.5 text-left text-xs"
                  disabled={pending}
                  onClick={() => sendMessage(question)}
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, idx) =>
          turn.role === "user" ? (
            <div key={idx} className="flex justify-end">
              <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap leading-snug">
                {turn.content}
              </div>
            </div>
          ) : (
            <AssistantTurn key={idx} response={turn.response} onAction={sendMessage} disabled={pending} />
          ),
        )}

        {pending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analisando carteiras...
          </div>
        )}

        {error && !pending && (
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        )}
      </CardContent>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t p-3">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ex.: compare BANCO A e BANCO B"
          disabled={pending}
          aria-label="Pergunta para o analista"
        />
        <Button type="submit" size="icon" disabled={pending || !input.trim()} aria-label="Enviar">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </Card>
  );
}

export default AgentChatPanel;
