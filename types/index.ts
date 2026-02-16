export interface Asset {
  id: string;
  name: string;
  symbol: string;
  icon: string;
}

export interface PriceData {
  price: number;
  change_24h: number;
}

export interface Bet {
  id: string;
  asset: string;
  symbol: string;
  direction: "up" | "down";
  amount: number;
  entryPrice: number;
  startTime: number;
  duration: number;
}

export type BetAmount = 10 | 25 | 50 | 100;
