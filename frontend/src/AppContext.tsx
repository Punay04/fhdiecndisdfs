import { createContext, useContext, useState, type ReactNode } from "react";

import type { Meta } from "./api/types";

interface AppContextValue {
  meta: Meta;
  gate: string;
  setGate: (gate: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Pilot metadata plus the gate-closure rule, shared so every page analyses the same decision. */
export function AppProvider({ meta, children }: { meta: Meta; children: ReactNode }) {
  const [gate, setGate] = useState(meta.default_gate);
  return <AppContext.Provider value={{ meta, gate, setGate }}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export function useAppContext(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useAppContext must be used inside <AppProvider>");
  return value;
}
