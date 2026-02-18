import { createContext, useContext, useState, type ReactNode } from "react";

type Direction = "up" | "down";
type PositionStatus = "win" | "loss" | "push";
type MarketKey = string;

export interface SettledPosition {
  id: string;
  marketKey: MarketKey;
  roundId: string;
  direction: Direction;
  amount: number;
  createdAt: number;
  roundEndTime: number;
  entryPrice: number;
  entryQuote: number;
  shares: number;
  status: PositionStatus;
  settlePrice: number;
  profit: number;
  payout: number;
  resolvedAt: number;
}

interface SettledPositionsContextValue {
  settledPositions: SettledPosition[];
  setSettledPositions: React.Dispatch<React.SetStateAction<SettledPosition[]>>;
}

const SettledPositionsContext = createContext<SettledPositionsContextValue | null>(null);

export function SettledPositionsProvider({ children }: { children: ReactNode }) {
  const [settledPositions, setSettledPositions] = useState<SettledPosition[]>([]);

  return (
    <SettledPositionsContext.Provider value={{ settledPositions, setSettledPositions }}>
      {children}
    </SettledPositionsContext.Provider>
  );
}

export function useSettledPositions() {
  const context = useContext(SettledPositionsContext);
  if (!context) {
    throw new Error("useSettledPositions must be used within a SettledPositionsProvider");
  }
  return context;
}
