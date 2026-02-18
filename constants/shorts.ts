export const TOKEN_TO_USDC_RATE = 100;
export const SHORTS_PAYOUT_RATE = 0.9;
export const ROUND_LOCK_WINDOW_MS = 3000;
export const ROUND_TICK_MS = 200;
export const PRICE_UI_TICK_MS = 250;

export const BET_AMOUNTS = [10, 25, 50, 100] as const;
export type BetAmount = (typeof BET_AMOUNTS)[number];

export const SHORTS_MARKETS = [
  {
    key: "BTC-30s",
    asset: "BTC",
    symbol: "BTCUSDT",
    durationSec: 30,
    label: "BTC 30s",
  },
  {
    key: "ETH-30s",
    asset: "ETH",
    symbol: "ETHUSDT",
    durationSec: 30,
    label: "ETH 30s",
  },
  {
    key: "SOL-30s",
    asset: "SOL",
    symbol: "SOLUSDT",
    durationSec: 30,
    label: "SOL 30s",
  },
  {
    key: "XRP-30s",
    asset: "XRP",
    symbol: "XRPUSDT",
    durationSec: 30,
    label: "XRP 30s",
  },
  {
    key: "BNB-30s",
    asset: "BNB",
    symbol: "BNBUSDT",
    durationSec: 30,
    label: "BNB 30s",
  },
  {
    key: "DOGE-30s",
    asset: "DOGE",
    symbol: "DOGEUSDT",
    durationSec: 30,
    label: "DOGE 30s",
  },
  {
    key: "ADA-30s",
    asset: "ADA",
    symbol: "ADAUSDT",
    durationSec: 30,
    label: "ADA 30s",
  },
  {
    key: "TRX-30s",
    asset: "TRX",
    symbol: "TRXUSDT",
    durationSec: 30,
    label: "TRX 30s",
  },
  {
    key: "LINK-30s",
    asset: "LINK",
    symbol: "LINKUSDT",
    durationSec: 30,
    label: "LINK 30s",
  },
  {
    key: "AVAX-30s",
    asset: "AVAX",
    symbol: "AVAXUSDT",
    durationSec: 30,
    label: "AVAX 30s",
  },
  {
    key: "BCH-30s",
    asset: "BCH",
    symbol: "BCHUSDT",
    durationSec: 30,
    label: "BCH 30s",
  },
  {
    key: "LTC-30s",
    asset: "LTC",
    symbol: "LTCUSDT",
    durationSec: 30,
    label: "LTC 30s",
  },
  {
    key: "DOT-30s",
    asset: "DOT",
    symbol: "DOTUSDT",
    durationSec: 30,
    label: "DOT 30s",
  },
  {
    key: "NEAR-30s",
    asset: "NEAR",
    symbol: "NEARUSDT",
    durationSec: 30,
    label: "NEAR 30s",
  },
  {
    key: "APT-30s",
    asset: "APT",
    symbol: "APTUSDT",
    durationSec: 30,
    label: "APT 30s",
  },
  {
    key: "SUI-30s",
    asset: "SUI",
    symbol: "SUIUSDT",
    durationSec: 30,
    label: "SUI 30s",
  },
  {
    key: "UNI-30s",
    asset: "UNI",
    symbol: "UNIUSDT",
    durationSec: 30,
    label: "UNI 30s",
  },
  {
    key: "PEPE-30s",
    asset: "PEPE",
    symbol: "PEPEUSDT",
    durationSec: 30,
    label: "PEPE 30s",
  },
  {
    key: "SHIB-30s",
    asset: "SHIB",
    symbol: "SHIBUSDT",
    durationSec: 30,
    label: "SHIB 30s",
  },
  {
    key: "XLM-30s",
    asset: "XLM",
    symbol: "XLMUSDT",
    durationSec: 30,
    label: "XLM 30s",
  },
] as const;

export type MarketDefinition = (typeof SHORTS_MARKETS)[number];
export type MarketKey = MarketDefinition["key"];
export type AssetCode = MarketDefinition["asset"];
export type MarketSymbol = MarketDefinition["symbol"];
export type MarketDurationSec = MarketDefinition["durationSec"];

export const MARKET_BY_KEY: Record<MarketKey, MarketDefinition> =
  SHORTS_MARKETS.reduce(
    (map, market) => {
      map[market.key] = market;
      return map;
    },
    {} as Record<MarketKey, MarketDefinition>,
  );

export const MARKET_BY_ASSET: Record<AssetCode, MarketDefinition> =
  SHORTS_MARKETS.reduce(
    (map, market) => {
      map[market.asset] = market;
      return map;
    },
    {} as Record<AssetCode, MarketDefinition>,
  );

export const ASSET_CODES: AssetCode[] = SHORTS_MARKETS.map(
  (market) => market.asset,
);

const UNIQUE_MARKET_SYMBOLS: MarketSymbol[] = [];
for (const market of SHORTS_MARKETS) {
  if (!UNIQUE_MARKET_SYMBOLS.includes(market.symbol)) {
    UNIQUE_MARKET_SYMBOLS.push(market.symbol);
  }
}

export const MARKET_SYMBOLS: MarketSymbol[] = UNIQUE_MARKET_SYMBOLS;

export const MARKET_SYMBOL_SET: ReadonlySet<MarketSymbol> = new Set(
  MARKET_SYMBOLS,
);
