import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import {
  type AgentChatMessage,
  type AgentResponse,
  postAgentChat,
} from "@/services/api";

export type AgentChatTurn =
  | { role: "user"; content: string }
  | { role: "assistant"; response: AgentResponse };

/**
 * Estado local da conversa + mutation de envio. O historico enviado ao
 * backend e derivado dos turnos (assistant vira apenas o texto da resposta);
 * banco e periodo vem dos filtros globais.
 */
export function useAgentChat() {
  const { selectedDatabase, dateFrom, dateTo } = useGlobalFilters();
  const [turns, setTurns] = useState<AgentChatTurn[]>([]);

  const mutation = useMutation({
    mutationFn: (messages: AgentChatMessage[]) =>
      postAgentChat(messages, selectedDatabase, dateFrom, dateTo),
    onSuccess: (response) => {
      setTurns((prev) => [...prev, { role: "assistant", response }]);
    },
  });

  const { mutate, reset: resetMutation } = mutation;

  const sendMessage = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      setTurns((prev) => {
        const next: AgentChatTurn[] = [...prev, { role: "user", content: trimmed }];
        const history: AgentChatMessage[] = next.map((turn) =>
          turn.role === "user"
            ? { role: "user", content: turn.content }
            : { role: "assistant", content: turn.response.text },
        );
        mutate(history);
        return next;
      });
    },
    [mutate],
  );

  const reset = useCallback(() => {
    setTurns([]);
    resetMutation();
  }, [resetMutation]);

  return {
    turns,
    sendMessage,
    reset,
    pending: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : mutation.error ? String(mutation.error) : null,
  };
}
