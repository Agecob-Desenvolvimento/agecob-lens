import { createContext, useContext, useState, type ReactNode } from "react";

interface GlobalFilters {
  category: string;
  assessoria: string;
  setCategory: (v: string) => void;
  setAssessoria: (v: string) => void;
}

const GlobalFiltersCtx = createContext<GlobalFilters | null>(null);

export function GlobalFiltersProvider({ children }: { children: ReactNode }) {
  const [category, setCategory] = useState("Todas");
  const [assessoria, setAssessoria] = useState("todos");
  return (
    <GlobalFiltersCtx.Provider value={{ category, assessoria, setCategory, setAssessoria }}>
      {children}
    </GlobalFiltersCtx.Provider>
  );
}

export function useGlobalFilters(): GlobalFilters {
  const ctx = useContext(GlobalFiltersCtx);
  if (!ctx) throw new Error("useGlobalFilters must be used inside GlobalFiltersProvider");
  return ctx;
}
