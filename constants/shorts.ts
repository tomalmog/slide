export const TOKEN_TO_USDC_RATE = 100;
export const SHORTS_PAYOUT_RATE = 0.9;
export const ROUND_LOCK_WINDOW_MS = 3000;
export const ROUND_TICK_MS = 200;
export const PRICE_UI_TICK_MS = 250;

export const BET_AMOUNTS = [10, 25, 50, 100] as const;
export type BetAmount = (typeof BET_AMOUNTS)[number];

export type MarketSymbol = "BTCUSDT" | "ETHUSDT";
export type AssetCode = "BTC" | "ETH";
export type MarketDurationSec = 30 | 60;
export type MarketKey = "BTC-30s" | "BTC-1m" | "ETH-30s" | "ETH-1m";

export interface MarketDefinition {
  key: MarketKey;
  asset: AssetCode;
  symbol: MarketSymbol;
  durationSec: MarketDurationSec;
  label: string;
}

export const SHORTS_MARKETS: MarketDefinition[] = [
  {
    key: "BTC-30s",
    asset: "BTC",
    symbol: "BTCUSDT",
    durationSec: 30,
    label: "BTC 30s",
  },
  {
    key: "BTC-1m",
    asset: "BTC",
    symbol: "BTCUSDT",
    durationSec: 60,
    label: "BTC 1m",
  },
  {
    key: "ETH-30s",
    asset: "ETH",
    symbol: "ETHUSDT",
    durationSec: 30,
    label: "ETH 30s",
  },
  {
    key: "ETH-1m",
    asset: "ETH",
    symbol: "ETHUSDT",
    durationSec: 60,
    label: "ETH 1m",
  },
];

export const MARKET_BY_KEY: Record<MarketKey, MarketDefinition> = {
  "BTC-30s": SHORTS_MARKETS[0],
  "BTC-1m": SHORTS_MARKETS[1],
  "ETH-30s": SHORTS_MARKETS[2],
  "ETH-1m": SHORTS_MARKETS[3],
};
