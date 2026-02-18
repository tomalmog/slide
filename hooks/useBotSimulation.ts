/**
 * Bot simulation engine for Polymarket Shorts.
 *
 * Each bot uses the same formula as the quote engine:
 *   upChance = 50 + (pctChange * SENSITIVITY) * urgency + noise
 *
 * The noise gives each bot a slightly different view of the market,
 * so not every bot bets the same side — but the majority follow price.
 */

import { useEffect, useRef } from "react";
import {
  type AssetCode,
  type MarketKey,
  type MarketSymbol,
  SHORTS_MARKETS,
} from "../constants/shorts";
import { getUpProbability } from "../utils/quoteProbability";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Direction = "up" | "down";

interface MarketRound {
  id: string;
  marketKey: MarketKey;
  startTime: number;
  endTime: number;
  openPrice: number | null;
}

interface MarketBook {
  roundId: string;
  upStake: number;
  downStake: number;
  upPositions: number;
  downPositions: number;
  activity: MarketActivity[];
}

interface MarketActivity {
  id: string;
  side: Direction;
  amount: number;
  quote: number;
  createdAt: number;
  trader: string;
  isUser: boolean;
}

interface ContractQuotes {
  up: number;
  down: number;
}

interface BotDependencies {
  roundsRef: React.RefObject<Record<MarketKey, MarketRound>>;
  marketBooksRef: React.RefObject<Record<MarketKey, MarketBook>>;
  latestPricesRef: React.RefObject<Record<MarketSymbol, number | null>>;
  getContractQuotes: (
    openPrice: number | null,
    latestPrice: number | null,
    upStake: number,
    downStake: number,
    asset?: AssetCode,
    roundProgress?: number,
    roundDurationMs?: number,
  ) => ContractQuotes;
  setMarketBooks: React.Dispatch<
    React.SetStateAction<Record<MarketKey, MarketBook>>
  >;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BOT_TICK_MS = 700;
const MAX_ACTIVITY_ITEMS = 10;
const BET_SIZES = [10, 15, 25, 35, 50, 75, 100] as const;
const BET_SIZE_WEIGHTS = [0.25, 0.2, 0.2, 0.15, 0.1, 0.06, 0.04] as const;

/** Max noise added to each bot's probability (±). */
const BOT_NOISE_RANGE = 0.18;

/** Min bots per tick, max bots per tick. */
const MIN_BOTS_PER_TICK = 1;
const MAX_BOTS_PER_TICK = 6;

const BOT_ADDRESSES = [
  "0xA1c3",
  "0xB4e7",
  "0xC9f2",
  "0xD17b",
  "0xE6a0",
  "0xF2d4",
  "0x91af",
  "0x73ce",
  "0x4b82",
  "0x22eF",
  "0x8d1A",
  "0x5cB9",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function weightedRandomIndex(weights: readonly number[]): number {
  const roll = Math.random();
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (roll < cumulative) return i;
  }
  return weights.length - 1;
}

function getRoundProgress(round: MarketRound, now: number): number {
  const duration = round.endTime - round.startTime;
  if (duration <= 0) return 1;
  return clamp((now - round.startTime) / duration, 0, 1);
}

/**
 * Same formula as getUpProbability in index.tsx, but with per-bot noise.
 */
function botUpProbability(
  openPrice: number,
  latestPrice: number,
  roundProgress: number,
  roundDurationMs: number,
  noise: number,
): number {
  return getUpProbability({
    openPrice,
    latestPrice,
    roundProgress,
    roundDurationMs,
    noise,
  });
}

/**
 * How many bots bet this tick. More active as round progresses.
 */
function botsThisTick(roundProgress: number): number {
  const base =
    MIN_BOTS_PER_TICK + roundProgress * (MAX_BOTS_PER_TICK - MIN_BOTS_PER_TICK);
  const jitter = (Math.random() - 0.5) * 2;
  return Math.max(0, Math.round(base + jitter));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBotSimulation({
  roundsRef,
  marketBooksRef,
  latestPricesRef,
  getContractQuotes,
  setMarketBooks,
  enabled,
}: BotDependencies): void {
  const depsRef = useRef({
    roundsRef,
    marketBooksRef,
    latestPricesRef,
    getContractQuotes,
    setMarketBooks,
  });
  depsRef.current = {
    roundsRef,
    marketBooksRef,
    latestPricesRef,
    getContractQuotes,
    setMarketBooks,
  };

  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      const {
        roundsRef: rounds,
        marketBooksRef: books,
        latestPricesRef: latestPrices,
        getContractQuotes: getQuotes,
        setMarketBooks: setBooks,
      } = depsRef.current;

      const currentTime = Date.now();
      const currentRounds = rounds.current;
      const currentBooks = books.current;
      const nextBooks = { ...currentBooks };
      let didChange = false;

      for (const market of SHORTS_MARKETS) {
        const round = currentRounds[market.key];
        if (!round || currentTime >= round.endTime) continue;
        if (typeof round.openPrice !== "number") continue;

        const roundProgress = getRoundProgress(round, currentTime);
        const roundDuration = round.endTime - round.startTime;
        const latestPrice =
          latestPrices.current[market.symbol] ?? round.openPrice;
        if (typeof latestPrice !== "number") continue;

        const count = botsThisTick(roundProgress);
        if (count === 0) continue;

        const existing = nextBooks[market.key];
        let book =
          existing && existing.roundId === round.id
            ? existing
            : {
                roundId: round.id,
                upStake: 0,
                downStake: 0,
                upPositions: 0,
                downPositions: 0,
                activity: [],
              };

        for (let i = 0; i < count; i++) {
          // Each bot gets its own noise — some slightly bullish, some bearish
          const noise = (Math.random() - 0.5) * 2 * BOT_NOISE_RANGE;
          const upProb = botUpProbability(
            round.openPrice,
            latestPrice,
            roundProgress,
            roundDuration,
            noise,
          );
          const side: Direction = Math.random() < upProb ? "up" : "down";

          // Get the current quote for display in activity feed
          const quotes = getQuotes(
            round.openPrice,
            latestPrice,
            book.upStake,
            book.downStake,
            market.asset,
            roundProgress,
            roundDuration,
          );
          const quote = side === "up" ? quotes.up : quotes.down;

          // Bet size: weighted toward smaller bets, slightly bigger late round
          const baseSize = BET_SIZES[weightedRandomIndex(BET_SIZE_WEIGHTS)];
          const lateBoost =
            roundProgress > 0.7 ? 1 + (roundProgress - 0.7) * 1.5 : 1;
          const amount = Math.max(
            5,
            Math.round((baseSize * lateBoost) / 5) * 5,
          );

          const trader =
            BOT_ADDRESSES[Math.floor(Math.random() * BOT_ADDRESSES.length)];

          book = {
            ...book,
            upStake: book.upStake + (side === "up" ? amount : 0),
            downStake: book.downStake + (side === "down" ? amount : 0),
            upPositions: book.upPositions + (side === "up" ? 1 : 0),
            downPositions: book.downPositions + (side === "down" ? 1 : 0),
            activity: [
              {
                id: `bot-${market.key}-${currentTime}-${i}`,
                side,
                amount,
                quote,
                createdAt: currentTime,
                trader,
                isUser: false,
              },
              ...book.activity,
            ].slice(0, MAX_ACTIVITY_ITEMS),
          };
        }

        nextBooks[market.key] = book;
        didChange = true;
      }

      if (didChange) {
        const { marketBooksRef: booksRef, setMarketBooks: setBooksState } =
          depsRef.current;
        booksRef.current = nextBooks;
        setBooksState(nextBooks);
      }
    }, BOT_TICK_MS);

    return () => clearInterval(interval);
  }, [enabled]);
}
