import { useEffect, useRef, useState } from "react";
import {
  MARKET_SYMBOLS,
  type MarketSymbol,
  PRICE_UI_TICK_MS,
} from "../constants/shorts";

type FeedStatus = "connecting" | "live" | "offline";

export interface PricePoint {
  price: number;
  updatedAt: number;
}

type PriceMap = Record<MarketSymbol, PricePoint | null>;
type PriceHistoryMap = Record<MarketSymbol, PricePoint[]>;

interface BinancePriceData {
  s?: string;
  p?: string;
  E?: number;
}

interface BinanceCombinedPriceMessage {
  stream?: string;
  data?: BinancePriceData;
}

const BINANCE_REST_URL = "https://data-api.binance.vision/api/v3/klines";
const BINANCE_WS_BASE_URL = "wss://data-stream.binance.vision/stream?streams=";
const RECONNECT_DELAY_MS = 2000;
const POLL_RESEED_INTERVAL_MS = 15000;
const STALE_TIMEOUT_MS = 12000;
const HISTORY_SAMPLE_MS = PRICE_UI_TICK_MS;
const HISTORY_RETENTION_MS = 120000;
const MAX_HISTORY_POINTS = 720;
const INITIAL_HISTORY_LIMIT = 120;
const KLINE_INTERVALS = ["1s", "1m"] as const;

const INITIAL_PRICES: PriceMap = MARKET_SYMBOLS.reduce((map, symbol) => {
  map[symbol] = null;
  return map;
}, {} as PriceMap);

const INITIAL_HISTORY: PriceHistoryMap = MARKET_SYMBOLS.reduce(
  (map, symbol) => {
    map[symbol] = [];
    return map;
  },
  {} as PriceHistoryMap,
);

const MARKET_SYMBOL_LOOKUP: Record<string, MarketSymbol> =
  MARKET_SYMBOLS.reduce(
    (map, symbol) => {
      map[symbol] = symbol;
      return map;
    },
    {} as Record<string, MarketSymbol>,
  );

function normalizeSymbol(symbol?: string): MarketSymbol | null {
  if (!symbol) {
    return null;
  }
  return MARKET_SYMBOL_LOOKUP[symbol.toUpperCase()] ?? null;
}

function parseFiniteNumber(value: string | undefined): number | null {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  return numericValue;
}

function parsePriceMessage(rawData: string): {
  symbol: MarketSymbol;
  price: number;
  updatedAt: number;
} | null {
  if (!rawData || rawData.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawData) as BinanceCombinedPriceMessage;
    const payload = parsed.data;
    if (!payload) {
      return null;
    }

    const symbol = normalizeSymbol(payload.s);
    if (!symbol) {
      return null;
    }

    const price = parseFiniteNumber(payload.p);
    if (typeof price !== "number" || !Number.isFinite(price)) {
      return null;
    }

    return {
      symbol,
      price,
      updatedAt: typeof payload.E === "number" ? payload.E : Date.now(),
    };
  } catch {
    return null;
  }
}

function buildCombinedStreamUrl(): string {
  const streams = MARKET_SYMBOLS.map(
    (symbol) => `${symbol.toLowerCase()}@trade`,
  );
  return `${BINANCE_WS_BASE_URL}${streams.join("/")}`;
}

function parseKlineHistory(raw: unknown): PricePoint[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const parsed: PricePoint[] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 5) {
      continue;
    }

    const openTime = Number(entry[0]);
    const closePrice = Number(entry[4]);
    if (!Number.isFinite(openTime) || !Number.isFinite(closePrice)) {
      continue;
    }

    parsed.push({
      price: closePrice,
      updatedAt: openTime,
    });
  }

  return parsed.slice(-MAX_HISTORY_POINTS);
}

async function fetchSymbolHistory(symbol: MarketSymbol): Promise<PricePoint[]> {
  for (const interval of KLINE_INTERVALS) {
    const params = new URLSearchParams({
      symbol,
      interval,
      limit: String(INITIAL_HISTORY_LIMIT),
    });

    try {
      const response = await fetch(`${BINANCE_REST_URL}?${params.toString()}`);
      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as unknown;
      const parsedHistory = parseKlineHistory(payload);
      if (parsedHistory.length > 0) {
        return parsedHistory;
      }
    } catch {
      // Try the next interval fallback.
    }
  }

  return [];
}

export function useLiveCryptoPrices() {
  const [prices, setPrices] = useState<PriceMap>(INITIAL_PRICES);
  const [history, setHistory] = useState<PriceHistoryMap>(INITIAL_HISTORY);
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const [error, setError] = useState<string | null>(null);

  const bufferedPricesRef = useRef<PriceMap>(INITIAL_PRICES);
  const bufferedHistoryRef = useRef<PriceHistoryMap>(INITIAL_HISTORY);
  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const hasReceivedTickerRef = useRef(false);
  const lastTickAtRef = useRef<number>(0);

  useEffect(() => {
    mountedRef.current = true;

    const flushInterval = setInterval(() => {
      if (!mountedRef.current) {
        return;
      }
      setPrices({ ...bufferedPricesRef.current });
      setHistory({ ...bufferedHistoryRef.current });
    }, PRICE_UI_TICK_MS);

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const updateBufferedPrice = (
      symbol: MarketSymbol,
      price: number,
      updatedAt: number,
    ) => {
      const previousPoint = bufferedPricesRef.current[symbol];
      if (previousPoint && updatedAt < previousPoint.updatedAt) {
        return;
      }
      if (
        previousPoint &&
        updatedAt === previousPoint.updatedAt &&
        price === previousPoint.price
      ) {
        return;
      }

      bufferedPricesRef.current = {
        ...bufferedPricesRef.current,
        [symbol]: {
          price,
          updatedAt,
        },
      };
    };

    const appendBufferedHistoryPoint = (
      symbol: MarketSymbol,
      point: PricePoint,
    ) => {
      const previousSeries = bufferedHistoryRef.current[symbol];
      const lastPoint = previousSeries[previousSeries.length - 1];

      if (!lastPoint) {
        bufferedHistoryRef.current = {
          ...bufferedHistoryRef.current,
          [symbol]: [point],
        };
        return;
      }

      if (point.updatedAt < lastPoint.updatedAt) {
        return;
      }

      if (point.updatedAt === lastPoint.updatedAt) {
        if (point.price === lastPoint.price) {
          return;
        }

        bufferedHistoryRef.current = {
          ...bufferedHistoryRef.current,
          [symbol]: [...previousSeries.slice(0, -1), point],
        };
        return;
      }

      if (point.updatedAt - lastPoint.updatedAt < HISTORY_SAMPLE_MS) {
        bufferedHistoryRef.current = {
          ...bufferedHistoryRef.current,
          [symbol]: [...previousSeries.slice(0, -1), point],
        };
        return;
      }

      const minTimestamp = point.updatedAt - HISTORY_RETENTION_MS;
      bufferedHistoryRef.current = {
        ...bufferedHistoryRef.current,
        [symbol]: [...previousSeries, point]
          .filter((historyPoint) => historyPoint.updatedAt >= minTimestamp)
          .slice(-MAX_HISTORY_POINTS),
      };
    };

    const loadInitialHistory = async () => {
      const nextHistory = { ...bufferedHistoryRef.current };
      const nextPrices = { ...bufferedPricesRef.current };
      let hasAnyHistory = false;

      await Promise.all(
        MARKET_SYMBOLS.map(async (symbol) => {
          try {
            const series = await fetchSymbolHistory(symbol);
            if (series.length === 0) {
              return;
            }

            const lastPoint = series[series.length - 1];
            const existingSeries = nextHistory[symbol];
            const existingLastPoint = existingSeries[existingSeries.length - 1];

            if (
              !existingLastPoint ||
              lastPoint.updatedAt > existingLastPoint.updatedAt
            ) {
              nextHistory[symbol] = series;
            }

            const existingPricePoint = nextPrices[symbol];
            if (
              !existingPricePoint ||
              lastPoint.updatedAt > existingPricePoint.updatedAt
            ) {
              nextPrices[symbol] = {
                price: lastPoint.price,
                updatedAt: lastPoint.updatedAt,
              };
            }

            hasAnyHistory = true;
          } catch {
            // Keep going even if one symbol fails.
          }
        }),
      );

      if (!mountedRef.current) {
        return;
      }

      bufferedHistoryRef.current = nextHistory;
      bufferedPricesRef.current = nextPrices;

      if (hasAnyHistory) {
        hasReceivedTickerRef.current = true;
        lastTickAtRef.current = Date.now();
        setStatus("live");
        setError(null);
      }
    };

    const scheduleReconnect = () => {
      if (!mountedRef.current || reconnectTimerRef.current) {
        return;
      }

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, RECONNECT_DELAY_MS);
    };

    const connect = () => {
      clearReconnectTimer();
      setStatus(hasReceivedTickerRef.current ? "live" : "connecting");
      setError(null);

      const socket = new WebSocket(buildCombinedStreamUrl());
      websocketRef.current = socket;

      socket.onmessage = (event) => {
        if (typeof event.data !== "string") {
          return;
        }

        const parsed = parsePriceMessage(event.data);
        if (!parsed) {
          return;
        }

        if (!hasReceivedTickerRef.current) {
          hasReceivedTickerRef.current = true;
          setStatus("live");
          setError(null);
        }

        lastTickAtRef.current = Date.now();
        updateBufferedPrice(parsed.symbol, parsed.price, parsed.updatedAt);
        appendBufferedHistoryPoint(parsed.symbol, {
          price: parsed.price,
          updatedAt: parsed.updatedAt,
        });
      };

      socket.onerror = () => {
        if (!mountedRef.current) {
          return;
        }
        setStatus("offline");
        setError("Binance market-data websocket error.");
      };

      socket.onclose = () => {
        if (!mountedRef.current) {
          return;
        }
        setStatus("offline");
        setError("Binance market-data websocket disconnected.");
        scheduleReconnect();
      };
    };

    const staleInterval = setInterval(() => {
      if (!mountedRef.current) {
        return;
      }
      if (!hasReceivedTickerRef.current) {
        return;
      }
      if (Date.now() - lastTickAtRef.current > STALE_TIMEOUT_MS) {
        setStatus("offline");
        setError("Binance market-data feed is stale.");
      }
    }, PRICE_UI_TICK_MS);

    const reseedInterval = setInterval(() => {
      void loadInitialHistory();
    }, POLL_RESEED_INTERVAL_MS);

    void loadInitialHistory();
    connect();

    return () => {
      mountedRef.current = false;
      clearInterval(flushInterval);
      clearInterval(staleInterval);
      clearInterval(reseedInterval);
      clearReconnectTimer();

      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }
    };
  }, []);

  return { prices, history, status, error };
}
