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
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  assessoria: string;
  setAssessoria: (v: string) => void;
  minAcionamentos: number;
  setMinAcionamentos: (v: number) => void;
}

const GlobalFiltersCtx = createContext<GlobalFilters | null>(null);

export function GlobalFiltersProvider({ children }: { children: ReactNode }) {
  const [category, setCategory] = useState<CategoryOption>("Todas");
  const [dateFrom, setDateFrom] = useState(firstOfMonthStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [assessoria, setAssessoria] = useState("Todas");
  const [minAcionamentos, setMinAcionamentos] = useState(10);

  const selectedDatabase = useMemo(() => deriveDatabase(category), [category]);

  return (
    <GlobalFiltersCtx.Provider
      value={{
        category,
        setCategory,
        selectedDatabase,
        dateFrom,
        setDateFrom,
        dateTo,
        setDateTo,
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
