import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { firstOfMonthStr, todayStr } from "@/lib/dates";
import type { DatabaseOption } from "@/services/api";

export type CategoryOption = "Todas" | "AUTOS" | "CONSUMER";

/**
 * Janela de estabilização do filtro de data.
 *
 * `dateFrom`/`dateTo` alimentam o queryKey de ~10 hooks, então cada edição de campo
 * disparava uma onda de requests completa — editar "De" e depois "Até" media 24
 * requests e ~5,7s, com a onda intermediária (par de datas que o usuário nem chegou a
 * ver) competindo por socket HTTP/1.1 e CPU do SQL Server com a onda final.
 *
 * Não é proteção contra resultado velho sobrescrever novo: o queryKey do TanStack já
 * isola cada par de datas em sua própria entrada de cache. É controle de contenção.
 *
 * 400ms fica na ordem de grandeza do debounce que já existe no useRefreshGuard (300ms).
 */
const DATE_COMMIT_DELAY_MS = 400;

function deriveDatabase(category: CategoryOption): DatabaseOption {
  if (category === "AUTOS") return "COBwebRCBAUTOS";
  if (category === "CONSUMER") return "COBwebRCBCONSUMER";
  return "todos";
}

interface GlobalFilters {
  category: CategoryOption;
  setCategory: (v: CategoryOption) => void;
  selectedDatabase: DatabaseOption;
  /** Data já estabilizada — é o que vai para queryKey/fetch. */
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  /** Valor cru do input, sem debounce. Só a barra de filtros usa. */
  dateFromInput: string;
  dateToInput: string;
  assessoria: string;
  setAssessoria: (v: string) => void;
  minAcionamentos: number;
  setMinAcionamentos: (v: number) => void;
}

const GlobalFiltersCtx = createContext<GlobalFilters | null>(null);

export function GlobalFiltersProvider({ children }: { children: ReactNode }) {
  const [category, setCategory] = useState<CategoryOption>("Todas");
  const [dateFromInput, setDateFromInput] = useState(firstOfMonthStr);
  const [dateToInput, setDateToInput] = useState(todayStr);
  const [committed, setCommitted] = useState(() => ({ from: firstOfMonthStr(), to: todayStr() }));
  const [assessoria, setAssessoria] = useState("Todas");
  const [minAcionamentos, setMinAcionamentos] = useState(10);

  // Um timer só para os dois campos: reeditar qualquer um reinicia a janela, então
  // "De" + "Até" em sequência rápida vira um commit único em vez de dois.
  useEffect(() => {
    // Par incompleto (input de data zera o value enquanto o usuário digita) não vira
    // fetch: omitir só um dos lados faz o backend responder 400 (_parse_period exige
    // os dois juntos) ou cair no default de hoje. Mantém o último par válido.
    if (!dateFromInput || !dateToInput) return;
    if (dateFromInput === committed.from && dateToInput === committed.to) return;
    const timer = window.setTimeout(
      () => setCommitted({ from: dateFromInput, to: dateToInput }),
      DATE_COMMIT_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [dateFromInput, dateToInput, committed.from, committed.to]);

  const selectedDatabase = useMemo(() => deriveDatabase(category), [category]);

  return (
    <GlobalFiltersCtx.Provider
      value={{
        category,
        setCategory,
        selectedDatabase,
        dateFrom: committed.from,
        setDateFrom: setDateFromInput,
        dateTo: committed.to,
        setDateTo: setDateToInput,
        dateFromInput,
        dateToInput,
        assessoria,
        setAssessoria,
        minAcionamentos,
        setMinAcionamentos,
      }}
    >
      {children}
    </GlobalFiltersCtx.Provider>
  );
}

export function useGlobalFilters(): GlobalFilters {
  const ctx = useContext(GlobalFiltersCtx);
  if (!ctx) throw new Error("useGlobalFilters must be used inside GlobalFiltersProvider");
  return ctx;
}
