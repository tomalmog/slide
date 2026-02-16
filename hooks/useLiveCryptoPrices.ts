import { useEffect, useRef, useState } from "react";
import { MarketSymbol, PRICE_UI_TICK_MS } from "../constants/shorts";

type FeedStatus = "connecting" | "live" | "offline";

export interface PricePoint {
  price: number;
  updatedAt: number;
}

type PriceMap = Record<MarketSymbol, PricePoint | null>;

const BINANCE_STREAM_URL =
  "wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade";
const RECONNECT_DELAY_MS = 2000;

const INITIAL_PRICES: PriceMap = {
  BTCUSDT: null,
  ETHUSDT: null,
};

function parseTradeMessage(rawData: string): {
  symbol: MarketSymbol;
  price: number;
} | null {
  try {
    const payload = JSON.parse(rawData);
    const data = payload?.data;
    const symbol = data?.s;
    const rawPrice = data?.p;

    if (
      (symbol === "BTCUSDT" || symbol === "ETHUSDT") &&
      typeof rawPrice === "string"
    ) {
      const nextPrice = Number(rawPrice);
      if (Number.isFinite(nextPrice)) {
        return { symbol, price: nextPrice };
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function useLiveCryptoPrices() {
  const [prices, setPrices] = useState<PriceMap>(INITIAL_PRICES);
  const [status, setStatus] = useState<FeedStatus>("connecting");

  const bufferedPricesRef = useRef<PriceMap>(INITIAL_PRICES);
  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

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
      setStatus("connecting");

      const socket = new WebSocket(BINANCE_STREAM_URL);
      websocketRef.current = socket;

      socket.onopen = () => {
        if (!mountedRef.current) {
          return;
        }
        setStatus("live");
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== "string") {
          return;
        }

        const parsed = parseTradeMessage(event.data);
        if (!parsed) {
          return;
        }

        bufferedPricesRef.current = {
          ...bufferedPricesRef.current,
          [parsed.symbol]: {
            price: parsed.price,
            updatedAt: Date.now(),
          },
        };
      };

      socket.onerror = () => {
        if (!mountedRef.current) {
          return;
        }
        setStatus("offline");
      };

      socket.onclose = () => {
        if (!mountedRef.current) {
          return;
        }
        setStatus("offline");
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

  return { prices, status };
}
