import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { firstOfMonthStr, todayStr } from "@/lib/dates";
import type { DatabaseOption } from "@/services/api";

export type CategoryOption = "Todas" | "AUTOS" | "CONSUMER";

function deriveDatabase(category: CategoryOption): DatabaseOption {
  if (category === "AUTOS") return "COBwebRCBAUTOS";
  if (category === "CONSUMER") return "COBwebRCBCONSUMER";
  return "todos";
}

interface GlobalFilters {
  category: CategoryOption;
  setCategory: (v: CategoryOption) => void;
  selectedDatabase: DatabaseOption;
  /** Período comprometido — é o que vai para queryKey/fetch. Só muda via applyDateRange(). */
  dateFrom: string;
  dateTo: string;
  /** Valor cru dos inputs "De"/"Até" — o que a barra de filtros exibe enquanto o
   *  usuário edita, ainda não comprometido para as queries. */
  dateFromInput: string;
  setDateFrom: (v: string) => void;
  dateToInput: string;
  setDateTo: (v: string) => void;
  /** true quando o par pendente difere do período comprometido — liga o botão OK. */
  dateRangeDirty: boolean;
  /** true quando o par pendente é um intervalo válido (ambos presentes, De <= Até). */
  dateRangeValid: boolean;
  /** Comprometido o par pendente como novo período, disparando as queries.
   *  No-op (retorna false) se o par não passar em dateRangeValid. */
  applyDateRange: () => boolean;
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

  // Comparação lexicográfica funciona direto em "YYYY-MM-DD" (ISO), sem parsear Date.
  const dateRangeValid = Boolean(dateFromInput) && Boolean(dateToInput) && dateFromInput <= dateToInput;
  const dateRangeDirty = dateFromInput !== committed.from || dateToInput !== committed.to;

  // Fluxo: usuário edita "De"/"Até" -> estado pendente (dateFromInput/dateToInput) ->
  // validação (dateRangeValid) -> usuário confirma (OK / Enter) -> applyDateRange
  // comprometa os dois valores JUNTOS, atomicamente -> queries usam dateFrom/dateTo.
  // Substitui o commit automático por timer: aqui nada muda para as queries até o
  // usuário confirmar explicitamente, então não há ambiguidade sobre qual par de
  // datas está em vigor.
  function applyDateRange(): boolean {
    if (!dateRangeValid) return false;
    setCommitted({ from: dateFromInput, to: dateToInput });
    return true;
  }

  const selectedDatabase = useMemo(() => deriveDatabase(category), [category]);

  return (
    <GlobalFiltersCtx.Provider
      value={{
        category,
        setCategory,
        selectedDatabase,
        dateFrom: committed.from,
        dateTo: committed.to,
        dateFromInput,
        setDateFrom: setDateFromInput,
        dateToInput,
        setDateTo: setDateToInput,
        dateRangeDirty,
        dateRangeValid,
        applyDateRange,
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
