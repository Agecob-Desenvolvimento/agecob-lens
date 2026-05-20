import { createContext, useContext, useState, type ReactNode } from "react";
import { firstOfMonthStr, todayStr } from "@/lib/dates";

interface GlobalFilters {
  category: string;
  setCategory: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
}

const GlobalFiltersCtx = createContext<GlobalFilters | null>(null);

export function GlobalFiltersProvider({ children }: { children: ReactNode }) {
  const [category, setCategory] = useState("Todas");
  const [dateFrom, setDateFrom] = useState(firstOfMonthStr);
  const [dateTo, setDateTo] = useState(todayStr);
  return (
    <GlobalFiltersCtx.Provider value={{ category, setCategory, dateFrom, setDateFrom, dateTo, setDateTo }}>
      {children}
    </GlobalFiltersCtx.Provider>
  );
}

export function useGlobalFilters(): GlobalFilters {
  const ctx = useContext(GlobalFiltersCtx);
  if (!ctx) throw new Error("useGlobalFilters must be used inside GlobalFiltersProvider");
  return ctx;
}
