import { useEffect, useRef, useState } from "react";
import { AssetCode, PRICE_UI_TICK_MS } from "../constants/shorts";

type FeedStatus = "connecting" | "live" | "offline";

export interface PricePoint {
  price: number;
  updatedAt: number;
}

type OraclePriceMap = Record<AssetCode, PricePoint | null>;

interface PolymarketPriceTick {
  symbol?: string;
  value?: number;
  full_accuracy_value?: string;
  timestamp?: number;
  data?: Array<{
    timestamp: number;
    value: number;
  }>;
}

interface PolymarketMessage {
  topic?: string;
  payload?: PolymarketPriceTick;
}

const POLYMARKET_RTDS_URL = "wss://ws-live-data.polymarket.com";
const RECONNECT_DELAY_MS = 2000;

const INITIAL_PRICES: OraclePriceMap = {
  BTC: null,
  ETH: null,
};

function normalizeSymbol(symbol?: string): AssetCode | null {
  if (!symbol) {
    return null;
  }

  const normalized = symbol.toLowerCase();
  if (normalized === "btc/usd") {
    return "BTC";
  }
  if (normalized === "eth/usd") {
    return "ETH";
  }
  return null;
}

function parseChainlinkPrice(rawData: string): {
  asset: AssetCode;
  price: number;
  updatedAt: number;
} | null {
  if (!rawData || rawData.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawData) as PolymarketMessage;
    const payload = parsed.payload;
    if (!payload) {
      return null;
    }

    const asset = normalizeSymbol(payload.symbol);
    if (!asset) {
      return null;
    }

    if (Array.isArray(payload.data) && payload.data.length > 0) {
      const lastPoint = payload.data[payload.data.length - 1];
      if (typeof lastPoint?.value === "number" && Number.isFinite(lastPoint.value)) {
        return {
          asset,
          price: lastPoint.value,
          updatedAt:
            typeof lastPoint.timestamp === "number"
              ? lastPoint.timestamp
              : Date.now(),
        };
      }
    }

    const directValue =
      typeof payload.value === "number"
        ? payload.value
        : typeof payload.full_accuracy_value === "string"
          ? Number(payload.full_accuracy_value)
          : NaN;

    if (!Number.isFinite(directValue)) {
      return null;
    }

    const rawTimestamp = payload.timestamp;
    const updatedAt =
      typeof rawTimestamp === "number"
        ? rawTimestamp > 1_000_000_000_000
          ? rawTimestamp
          : rawTimestamp * 1000
        : Date.now();

    return {
      asset,
      price: directValue,
      updatedAt,
    };
  } catch {
    return null;
  }
}

export function usePolymarketChainlinkPrices() {
  const [prices, setPrices] = useState<OraclePriceMap>(INITIAL_PRICES);
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const [error, setError] = useState<string | null>(null);

  const bufferedPricesRef = useRef<OraclePriceMap>(INITIAL_PRICES);
  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const hasReceivedTickRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    const flushInterval = setInterval(() => {
      if (!mountedRef.current) {
        return;
      }
      setPrices({ ...bufferedPricesRef.current });
    }, PRICE_UI_TICK_MS);

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const updateBufferedPrice = (asset: AssetCode, price: number, updatedAt: number) => {
      bufferedPricesRef.current = {
        ...bufferedPricesRef.current,
        [asset]: { price, updatedAt },
      };
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
      hasReceivedTickRef.current = false;
      setStatus("connecting");
      setError(null);

      const socket = new WebSocket(POLYMARKET_RTDS_URL);
      websocketRef.current = socket;

      socket.onopen = () => {
        if (!mountedRef.current) {
          return;
        }

        socket.send(
          JSON.stringify({
            action: "subscribe",
            subscriptions: [
              {
                topic: "crypto_prices_chainlink",
                type: "update",
                filters: JSON.stringify({ symbol: "btc/usd" }),
              },
              {
                topic: "crypto_prices_chainlink",
                type: "update",
                filters: JSON.stringify({ symbol: "eth/usd" }),
              },
            ],
          }),
        );
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== "string") {
          return;
        }

        const parsed = parseChainlinkPrice(event.data);
        if (!parsed) {
          return;
        }

        if (!hasReceivedTickRef.current) {
          hasReceivedTickRef.current = true;
          setStatus("live");
          setError(null);
        }

        updateBufferedPrice(parsed.asset, parsed.price, parsed.updatedAt);
      };

      socket.onerror = () => {
        if (!mountedRef.current) {
          return;
        }
        setStatus("offline");
        setError("Polymarket chainlink websocket error.");
      };

      socket.onclose = () => {
        if (!mountedRef.current) {
          return;
        }
        setStatus("offline");
        setError("Polymarket chainlink websocket disconnected.");
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      mountedRef.current = false;
      clearInterval(flushInterval);
      clearReconnectTimer();

      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }
    };
  }, []);

  return { prices, status, error };
}
