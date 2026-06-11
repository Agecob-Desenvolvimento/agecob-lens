import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AgentChatTurn } from "@/hooks/useAgentChat";

const STORAGE_KEY = "agent_chat_session_v1";

interface AgentChatContextValue {
  turns: AgentChatTurn[];
  setTurns: React.Dispatch<React.SetStateAction<AgentChatTurn[]>>;
  clearTurns: () => void;
}

const AgentChatContext = createContext<AgentChatContextValue | undefined>(undefined);

function restoreTurns(): AgentChatTurn[] {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as AgentChatTurn[]) : [];
  } catch {
    return [];
  }
}

/**
 * Historico do chat do agente vive aqui (acima das rotas) para sobreviver
 * a navegacao e fechamento do painel. sessionStorage = sobrevive nada alem
 * da aba: F5 limpa o estado React mas restaura do storage; fechar aba limpa.
 */
export function AgentChatProvider({ children }: { children: ReactNode }) {
  const [turns, setTurns] = useState<AgentChatTurn[]>(restoreTurns);

  useEffect(() => {
    try {
      if (turns.length > 0) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns));
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // storage cheio/indisponivel: chat segue funcionando sem persistencia
    }
  }, [turns]);

  const clearTurns = useCallback(() => {
    setTurns([]);
  }, []);

  return (
    <AgentChatContext.Provider value={{ turns, setTurns, clearTurns }}>
      {children}
    </AgentChatContext.Provider>
  );
}

export function useAgentChatContext(): AgentChatContextValue {
  const context = useContext(AgentChatContext);
  if (!context) {
    throw new Error("useAgentChatContext must be used within AgentChatProvider");
  }
  return context;
}
