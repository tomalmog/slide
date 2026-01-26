import { Asset, PriceData } from "../types";

export const MOCK_ASSETS: Asset[] = [
  { id: "1", name: "Bitcoin", symbol: "BTCUSDT", icon: "₿" },
  { id: "2", name: "Ethereum", symbol: "ETHUSDT", icon: "Ξ" },
  { id: "3", name: "Solana", symbol: "SOLUSDT", icon: "◎" },
  { id: "4", name: "Cardano", symbol: "ADAUSDT", icon: "₳" },
  { id: "5", name: "Polkadot", symbol: "DOTUSDT", icon: "●" },
];

export const MOCK_PRICE_DATA: Record<string, PriceData> = {
  BTCUSDT: { price: 42350.25, change_24h: 2.45 },
  ETHUSDT: { price: 2245.8, change_24h: -1.23 },
  SOLUSDT: { price: 98.45, change_24h: 5.67 },
  ADAUSDT: { price: 0.52, change_24h: -0.8 },
  DOTUSDT: { price: 7.2, change_24h: 3.2 },
};
