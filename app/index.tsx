import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { TokenIcon } from "../components/ui/TokenIcon";
import {
  AssetCode,
  BET_AMOUNTS,
  BetAmount,
  MARKET_BY_KEY,
  MarketKey,
  MarketSymbol,
  ROUND_TICK_MS,
  SHORTS_MARKETS,
  TOKEN_TO_USDC_RATE,
} from "../constants/shorts";
import { useLiveCryptoPrices } from "../hooks/useLiveCryptoPrices";
import { usePolymarketChainlinkPrices } from "../hooks/usePolymarketChainlinkPrices";
import { playSound } from "../utils/sounds";

type Direction = "up" | "down";
type PositionStatus = "win" | "loss" | "push";
type FeedStatus = "connecting" | "live" | "offline";

interface MarketRound {
  id: string;
  marketKey: MarketKey;
  startTime: number;
  endTime: number;
  openPrice: number | null;
}

interface OpenPosition {
  id: string;
  marketKey: MarketKey;
  roundId: string;
  direction: Direction;
  amount: number; // Cost in tokens.
  createdAt: number;
  roundEndTime: number;
  entryPrice: number; // Underlying open price.
  entryQuote: number; // Contract fill price in dollars (0.01 - 0.99).
  shares: number;
}

interface SettledPosition extends OpenPosition {
  status: PositionStatus;
  settlePrice: number;
  profit: number;
  payout: number;
  resolvedAt: number;
}

interface SettlementEvent {
  roundId: string;
  settlePrice: number;
}

interface PendingSettlement {
  roundId: string;
  asset: AssetCode;
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

interface MarketBook {
  roundId: string;
  upStake: number;
  downStake: number;
  upPositions: number;
  downPositions: number;
  activity: MarketActivity[];
}

interface MarketQuoteSnapshot {
  up: number;
  down: number;
  upStake: number;
  downStake: number;
  upPositions: number;
  downPositions: number;
  activity: MarketActivity[];
}

const STARTING_BALANCE = 10000;
const VIRTUAL_LIQUIDITY = 700;
const MIN_CONTRACT_CENTS = 5;
const MAX_ACTIVITY_ITEMS = 10;
const FAKE_BET_TICK_MS = 700;
const BOT_WINNER_BIAS = 0.72;
const BOT_MARKET_ACTIVE_PROBABILITY = 0.88;
const BOT_BETS_PER_TICK_MIN = 3;
const BOT_BETS_PER_TICK_MAX = 8;
const FAKE_BET_SIZES = [10, 25, 50, 100, 150, 250] as const;
const FAKE_TRADER_IDS = [
  "0xA1c3",
  "0xB4e7",
  "0xC9f2",
  "0xD17b",
  "0xE6a0",
  "0xF2d4",
  "0x91af",
  "0x73ce",
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getRoundStart(timestamp: number, durationMs: number) {
  return Math.floor(timestamp / durationMs) * durationMs;
}

function createRound(
  marketKey: MarketKey,
  durationMs: number,
  timestamp: number,
  openPrice: number | null,
): MarketRound {
  const startTime = getRoundStart(timestamp, durationMs);
  const endTime = startTime + durationMs;

  return {
    id: `${marketKey}-${startTime}`,
    marketKey,
    startTime,
    endTime,
    openPrice,
  };
}

function formatPrice(price: number | null) {
  if (price === null) {
    return "--";
  }

  if (price >= 1000) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return price.toFixed(4);
}

function formatCountdown(ms: number) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

function roundToFour(value: number) {
  return Math.round(value * 10000) / 10000;
}

function formatContractPrice(price: number) {
  return `$${price.toFixed(2)}`;
}

function getLeadingDirection(
  openPrice: number | null,
  latestPrice: number | null,
): Direction | null {
  if (
    typeof openPrice !== "number" ||
    typeof latestPrice !== "number" ||
    openPrice === latestPrice
  ) {
    return null;
  }

  return latestPrice > openPrice ? "up" : "down";
}

function getInitialState(timestamp: number) {
  const nextRounds = {} as Record<MarketKey, MarketRound>;
  const nextBooks = {} as Record<MarketKey, MarketBook>;

  for (const market of SHORTS_MARKETS) {
    const round = createRound(
      market.key,
      market.durationSec * 1000,
      timestamp,
      null,
    );
    nextRounds[market.key] = round;
    nextBooks[market.key] = {
      roundId: round.id,
      upStake: 0,
      downStake: 0,
      upPositions: 0,
      downPositions: 0,
      activity: [],
    };
  }

  return {
    rounds: nextRounds,
    books: nextBooks,
  };
}

function getContractQuotes(
  openPrice: number | null,
  latestPrice: number | null,
  upStake: number,
  downStake: number,
) {
  const trendSignal =
    typeof openPrice === "number" &&
    typeof latestPrice === "number" &&
    openPrice > 0
      ? clamp(((latestPrice - openPrice) / openPrice) * 25, -0.28, 0.28)
      : 0;

  const trendProbability = clamp(0.5 + trendSignal, 0.2, 0.8);
  const virtualUp = VIRTUAL_LIQUIDITY * trendProbability;
  const virtualDown = VIRTUAL_LIQUIDITY * (1 - trendProbability);
  const rawUp =
    (virtualUp + upStake) / (virtualUp + virtualDown + upStake + downStake);

  const upCents = clamp(
    Math.round(rawUp * 100),
    MIN_CONTRACT_CENTS,
    100 - MIN_CONTRACT_CENTS,
  );
  const downCents = 100 - upCents;

  return {
    up: upCents / 100,
    down: downCents / 100,
  };
}

function getMarketTone(asset: "BTC" | "ETH") {
  return asset === "BTC"
    ? {
        border: "border-warning/40",
        accent: "bg-warning/15",
        text: "text-warning",
      }
    : {
        border: "border-primary/40",
        accent: "bg-primary/15",
        text: "text-primary",
      };
}

function getStatusColor(status: FeedStatus) {
  if (status === "live") return "bg-success";
  if (status === "connecting") return "bg-warning";
  return "bg-danger";
}

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const useTwoColumns = width >= 1024;

  const {
    prices,
    status: priceFeedStatus,
    error: priceFeedError,
  } = useLiveCryptoPrices();
  const {
    prices: chainlinkOraclePrices,
    status: oracleStatus,
    error: oracleError,
  } = usePolymarketChainlinkPrices();
  const [balance, setBalance] = useState(STARTING_BALANCE);
  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [settledPositions, setSettledPositions] = useState<SettledPosition[]>(
    [],
  );
  const [now, setNow] = useState(Date.now());

  const initialSelectedAmounts = useMemo(() => {
    const defaults = {} as Record<MarketKey, BetAmount>;
    for (const market of SHORTS_MARKETS) {
      defaults[market.key] = 25;
    }
    return defaults;
  }, []);
  const [selectedAmounts, setSelectedAmounts] = useState<
    Record<MarketKey, BetAmount>
  >(initialSelectedAmounts);

  const balanceRef = useRef(balance);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  const latestPricesRef = useRef<Record<MarketSymbol, number | null>>({
    BTCUSDT: null,
    ETHUSDT: null,
  });

  useEffect(() => {
    const btcPrice = prices.BTCUSDT?.price ?? null;
    const ethPrice = prices.ETHUSDT?.price ?? null;

    latestPricesRef.current = {
      BTCUSDT: btcPrice ?? latestPricesRef.current.BTCUSDT,
      ETHUSDT: ethPrice ?? latestPricesRef.current.ETHUSDT,
    };
  }, [prices]);

  const initialState = useMemo(() => getInitialState(Date.now()), []);
  const [rounds, setRounds] = useState<Record<MarketKey, MarketRound>>(
    initialState.rounds,
  );
  const [marketBooks, setMarketBooks] = useState<Record<MarketKey, MarketBook>>(
    initialState.books,
  );

  const roundsRef = useRef(rounds);
  useEffect(() => {
    roundsRef.current = rounds;
  }, [rounds]);
  const marketBooksRef = useRef(marketBooks);
  useEffect(() => {
    marketBooksRef.current = marketBooks;
  }, [marketBooks]);
  const pendingSettlementsRef = useRef<PendingSettlement[]>([]);

  const oraclePricesRef = useRef<Record<AssetCode, number | null>>({
    BTC: null,
    ETH: null,
  });
  useEffect(() => {
    oraclePricesRef.current = {
      BTC: chainlinkOraclePrices.BTC?.price ?? null,
      ETH: chainlinkOraclePrices.ETH?.price ?? null,
    };
  }, [chainlinkOraclePrices]);

  const resolveRounds = useCallback(
    (events: SettlementEvent[], resolvedAt: number) => {
      if (events.length === 0) {
        return;
      }

      const eventMap = new Map<string, number>();
      for (const event of events) {
        eventMap.set(event.roundId, event.settlePrice);
      }

      setOpenPositions((previousOpen) => {
        let payoutTotal = 0;
        const resolved: SettledPosition[] = [];
        const stillOpen: OpenPosition[] = [];

        for (const position of previousOpen) {
          const settlePrice = eventMap.get(position.roundId);
          if (typeof settlePrice !== "number") {
            stillOpen.push(position);
            continue;
          }

          const isWin =
            position.direction === "up"
              ? settlePrice > position.entryPrice
              : settlePrice < position.entryPrice;
          const isPush = settlePrice === position.entryPrice;
          const payout = isPush
            ? position.amount
            : isWin
              ? roundToTwo(position.shares * TOKEN_TO_USDC_RATE)
              : 0;
          const profit = roundToTwo(payout - position.amount);

          payoutTotal += payout;
          resolved.push({
            ...position,
            status: isPush ? "push" : isWin ? "win" : "loss",
            settlePrice,
            profit,
            payout,
            resolvedAt,
          });
        }

        if (resolved.length > 0) {
          const nextBalance = balanceRef.current + payoutTotal;
          balanceRef.current = nextBalance;
          setBalance(nextBalance);

          setSettledPositions((previousSettled) =>
            [
              ...resolved.sort((a, b) => b.resolvedAt - a.resolvedAt),
              ...previousSettled,
            ].slice(0, 40),
          );

          if (resolved.some((position) => position.status === "win")) {
            void playSound("win").catch(() => undefined);
          }
        }

        return stillOpen;
      });
    },
    [],
  );

  const processPendingSettlements = useCallback(() => {
    const pending = pendingSettlementsRef.current;
    if (pending.length === 0) {
      return;
    }

    const toResolve: SettlementEvent[] = [];
    const stillPending: PendingSettlement[] = [];

    for (const item of pending) {
      const settlePrice = oraclePricesRef.current[item.asset];
      if (typeof settlePrice === "number") {
        toResolve.push({
          roundId: item.roundId,
          settlePrice,
        });
      } else {
        stillPending.push(item);
      }
    }

    pendingSettlementsRef.current = stillPending;
    if (toResolve.length > 0) {
      resolveRounds(toResolve, Date.now());
    }
  }, [resolveRounds]);

  useEffect(() => {
    const interval = setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);

      const currentRounds = roundsRef.current;
      const currentBooks = marketBooksRef.current;
      const nextRounds = { ...currentRounds };
      const nextBooks = { ...currentBooks };
      const newSettlements: PendingSettlement[] = [];
      let didChange = false;
      let didChangeBooks = false;

      for (const market of SHORTS_MARKETS) {
        const durationMs = market.durationSec * 1000;
        const latestPrice = latestPricesRef.current[market.symbol];
        const expectedRound = createRound(
          market.key,
          durationMs,
          currentTime,
          latestPrice,
        );
        const existingRound = currentRounds[market.key];
        const existingBook = currentBooks[market.key];

        if (!existingBook || existingBook.roundId !== existingRound.id) {
          nextBooks[market.key] = {
            roundId: existingRound.id,
            upStake: 0,
            downStake: 0,
            upPositions: 0,
            downPositions: 0,
            activity: [],
          };
          didChangeBooks = true;
        }

        if (existingRound.id !== expectedRound.id) {
          newSettlements.push({
            roundId: existingRound.id,
            asset: market.asset,
          });

          nextRounds[market.key] = expectedRound;
          nextBooks[market.key] = {
            roundId: expectedRound.id,
            upStake: 0,
            downStake: 0,
            upPositions: 0,
            downPositions: 0,
            activity: [],
          };
          didChange = true;
          didChangeBooks = true;
          continue;
        }

        if (
          existingRound.openPrice === null &&
          typeof latestPrice === "number"
        ) {
          nextRounds[market.key] = {
            ...existingRound,
            openPrice: latestPrice,
          };
          didChange = true;
        }
      }

      if (didChange) {
        roundsRef.current = nextRounds;
        setRounds(nextRounds);
      }
      if (didChangeBooks) {
        marketBooksRef.current = nextBooks;
        setMarketBooks(nextBooks);
      }

      if (newSettlements.length > 0) {
        const seen = new Set(
          pendingSettlementsRef.current.map((item) => item.roundId),
        );
        const merged = [...pendingSettlementsRef.current];

        for (const item of newSettlements) {
          if (seen.has(item.roundId)) {
            continue;
          }
          merged.push(item);
          seen.add(item.roundId);
        }

        pendingSettlementsRef.current = merged;
        processPendingSettlements();
      }
    }, ROUND_TICK_MS);

    return () => clearInterval(interval);
  }, [processPendingSettlements]);

  useEffect(() => {
    processPendingSettlements();
  }, [chainlinkOraclePrices, processPendingSettlements]);

  const marketQuoteSnapshots = useMemo(() => {
    const next = {} as Record<MarketKey, MarketQuoteSnapshot>;

    for (const market of SHORTS_MARKETS) {
      const round = rounds[market.key];
      const book = marketBooks[market.key] ?? {
        roundId: round.id,
        upStake: 0,
        downStake: 0,
        upPositions: 0,
        downPositions: 0,
        activity: [],
      };

      const latestUnderlyingPrice =
        prices[market.symbol]?.price ??
        chainlinkOraclePrices[market.asset]?.price ??
        round.openPrice;
      const quotes = getContractQuotes(
        round.openPrice,
        latestUnderlyingPrice,
        book.upStake,
        book.downStake,
      );

      next[market.key] = {
        up: quotes.up,
        down: quotes.down,
        upStake: book.upStake,
        downStake: book.downStake,
        upPositions: book.upPositions,
        downPositions: book.downPositions,
        activity: book.activity,
      };
    }

    return next;
  }, [chainlinkOraclePrices, marketBooks, prices, rounds]);

  const placePosition = useCallback(
    (marketKey: MarketKey, direction: Direction, entryQuote: number) => {
      if (priceFeedStatus !== "live" || oracleStatus !== "live") {
        return;
      }

      const activeRound = roundsRef.current[marketKey];
      const amount = selectedAmounts[marketKey];
      const nowMs = Date.now();

      if (!Number.isFinite(entryQuote) || entryQuote <= 0 || entryQuote >= 1) {
        return;
      }

      if (!activeRound || typeof activeRound.openPrice !== "number") {
        return;
      }

      if (nowMs >= activeRound.endTime) {
        return;
      }

      if (balanceRef.current < amount) {
        return;
      }

      const spendUsd = amount / TOKEN_TO_USDC_RATE;
      const shares = roundToFour(spendUsd / entryQuote);
      if (!Number.isFinite(shares) || shares <= 0) {
        return;
      }

      const nextBalance = balanceRef.current - amount;
      balanceRef.current = nextBalance;
      setBalance(nextBalance);

      const newPosition: OpenPosition = {
        id: `${activeRound.id}-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
        marketKey,
        roundId: activeRound.id,
        direction,
        amount,
        createdAt: nowMs,
        roundEndTime: activeRound.endTime,
        entryPrice: activeRound.openPrice,
        entryQuote,
        shares,
      };

      setOpenPositions((previous) => [newPosition, ...previous].slice(0, 120));

      setMarketBooks((previous) => {
        const existing = previous[marketKey];
        if (!existing || existing.roundId !== activeRound.id) {
          return previous;
        }

        const next: Record<MarketKey, MarketBook> = {
          ...previous,
          [marketKey]: {
            ...existing,
            upStake: existing.upStake + (direction === "up" ? amount : 0),
            downStake: existing.downStake + (direction === "down" ? amount : 0),
            upPositions: existing.upPositions + (direction === "up" ? 1 : 0),
            downPositions:
              existing.downPositions + (direction === "down" ? 1 : 0),
            activity: [
              {
                id: `you-${marketKey}-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
                side: direction,
                amount,
                quote: entryQuote,
                createdAt: nowMs,
                trader: "You",
                isUser: true,
              },
              ...existing.activity,
            ].slice(0, MAX_ACTIVITY_ITEMS),
          },
        };

        marketBooksRef.current = next;
        return next;
      });
    },
    [oracleStatus, priceFeedStatus, selectedAmounts],
  );

  const sortedOpenPositions = useMemo(
    () => [...openPositions].sort((a, b) => a.roundEndTime - b.roundEndTime),
    [openPositions],
  );

  const usdEquivalent = balance / TOKEN_TO_USDC_RATE;
  const isTradingEnabled =
    priceFeedStatus === "live" && oracleStatus === "live";

  useEffect(() => {
    if (!isTradingEnabled) {
      return;
    }

    const interval = setInterval(() => {
      const currentTime = Date.now();
      const currentBooks = marketBooksRef.current;
      const currentRounds = roundsRef.current;
      const nextBooks = { ...currentBooks };
      let didChangeBooks = false;

      for (const market of SHORTS_MARKETS) {
        if (Math.random() > BOT_MARKET_ACTIVE_PROBABILITY) {
          continue;
        }

        const round = currentRounds[market.key];
        if (!round || currentTime >= round.endTime) {
          continue;
        }

        const existing = nextBooks[market.key] ?? {
          roundId: round.id,
          upStake: 0,
          downStake: 0,
          upPositions: 0,
          downPositions: 0,
          activity: [],
        };
        let currentBook =
          existing.roundId === round.id
            ? existing
            : {
                roundId: round.id,
                upStake: 0,
                downStake: 0,
                upPositions: 0,
                downPositions: 0,
                activity: [],
              };

        const betCount =
          BOT_BETS_PER_TICK_MIN +
          Math.floor(
            Math.random() * (BOT_BETS_PER_TICK_MAX - BOT_BETS_PER_TICK_MIN + 1),
          );

        for (let index = 0; index < betCount; index += 1) {
          const latestUnderlying =
            latestPricesRef.current[market.symbol] ??
            oraclePricesRef.current[market.asset] ??
            round.openPrice;
          const leadingDirection = getLeadingDirection(
            round.openPrice,
            latestUnderlying,
          );
          const quotes = getContractQuotes(
            round.openPrice,
            latestUnderlying,
            currentBook.upStake,
            currentBook.downStake,
          );

          let side: Direction;
          if (leadingDirection) {
            side =
              Math.random() < BOT_WINNER_BIAS
                ? leadingDirection
                : leadingDirection === "up"
                  ? "down"
                  : "up";
          } else {
            side = Math.random() < quotes.up ? "up" : "down";
          }

          const quote = side === "up" ? quotes.up : quotes.down;
          const amount =
            FAKE_BET_SIZES[Math.floor(Math.random() * FAKE_BET_SIZES.length)];
          const trader =
            FAKE_TRADER_IDS[Math.floor(Math.random() * FAKE_TRADER_IDS.length)];

          currentBook = {
            ...currentBook,
            upStake: currentBook.upStake + (side === "up" ? amount : 0),
            downStake: currentBook.downStake + (side === "down" ? amount : 0),
            upPositions: currentBook.upPositions + (side === "up" ? 1 : 0),
            downPositions:
              currentBook.downPositions + (side === "down" ? 1 : 0),
            activity: [
              {
                id: `sim-${market.key}-${currentTime}-${index}-${Math.random().toString(36).slice(2, 6)}`,
                side,
                amount,
                quote,
                createdAt: currentTime,
                trader,
                isUser: false,
              },
              ...currentBook.activity,
            ].slice(0, MAX_ACTIVITY_ITEMS),
          };
        }

        nextBooks[market.key] = currentBook;
        didChangeBooks = true;
      }

      if (didChangeBooks) {
        marketBooksRef.current = nextBooks;
        setMarketBooks(nextBooks);
      }
    }, FAKE_BET_TICK_MS);

    return () => clearInterval(interval);
  }, [isTradingEnabled]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-4 py-4 border-b border-border flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <View className="w-9 h-9 rounded-lg bg-primary items-center justify-center">
            <Ionicons name="flash" size={20} color="#FFFFFF" />
          </View>
          <View>
            <Text className="text-text font-semibold text-lg">
              Polymarket Shorts
            </Text>
            <Text className="text-text-subtle text-xs">
              Internal demo • fake tokens
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => router.push("/settings")}
          className="bg-surface-hover border border-border rounded-lg p-2"
        >
          <Ionicons name="settings-outline" size={20} color="#FAFAFA" />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 16 }}
      >
        <View className="bg-surface border border-border rounded-2xl p-4 gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-text-subtle text-xs tracking-wide uppercase">
              Token Balance
            </Text>
            <View className="items-end gap-1">
              <View className="flex-row items-center gap-2">
                <View
                  className={`w-2.5 h-2.5 rounded-full ${getStatusColor(priceFeedStatus)}`}
                />
                <Text className="text-text-subtle text-xs uppercase">
                  Polymarket RTDS {priceFeedStatus}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View
                  className={`w-2.5 h-2.5 rounded-full ${getStatusColor(oracleStatus)}`}
                />
                <Text className="text-text-subtle text-xs uppercase">
                  Polymarket Chainlink {oracleStatus}
                </Text>
              </View>
            </View>
          </View>

          <View className="flex-row items-center">
            <Text className="text-text text-3xl font-mono font-bold">
              {Math.floor(balance).toLocaleString("en-US")}
            </Text>
            <View className="ml-2">
              <TokenIcon size={28} />
            </View>
          </View>

          <Text className="text-text-subtle text-sm">
            Approx ${usdEquivalent.toFixed(2)} USDC at 100 tokens = 1 USDC
          </Text>
        </View>

        {!isTradingEnabled && (
          <View className="bg-danger/15 border border-danger rounded-2xl p-4 gap-2">
            <View className="flex-row items-center gap-2">
              <Ionicons name="warning-outline" size={18} color="#EF4444" />
              <Text className="text-danger font-semibold">Trading Halted</Text>
            </View>
            <Text className="text-text text-sm">
              Shorts requires both Polymarket crypto prices and Polymarket
              chainlink prices. Betting is disabled until both are live.
            </Text>
            {priceFeedError ? (
              <Text className="text-text-subtle text-xs">{priceFeedError}</Text>
            ) : null}
            {oracleError ? (
              <Text className="text-text-subtle text-xs">{oracleError}</Text>
            ) : null}
          </View>
        )}

        <View className="flex-row flex-wrap gap-3">
          {SHORTS_MARKETS.map((market) => {
            const round = rounds[market.key];
            const tone = getMarketTone(market.asset);
            const quoteSnapshot = marketQuoteSnapshots[market.key];
            const chainlinkReference =
              chainlinkOraclePrices[market.asset]?.price ?? null;
            const liveSpotPrice = prices[market.symbol]?.price ?? null;
            const marketPrice =
              liveSpotPrice ?? chainlinkReference ?? round.openPrice;
            const upQuote = quoteSnapshot?.up ?? 0.5;
            const downQuote = quoteSnapshot?.down ?? 0.5;
            const roundVolume =
              (quoteSnapshot?.upStake ?? 0) + (quoteSnapshot?.downStake ?? 0);
            const marketActivity = quoteSnapshot?.activity ?? [];
            const selectedAmount = selectedAmounts[market.key];
            const roundTimeLeftMs = Math.max(0, round.endTime - now);
            const canPlace =
              isTradingEnabled &&
              roundTimeLeftMs > 0 &&
              typeof round.openPrice === "number";
            const roundProgress =
              (roundTimeLeftMs / (market.durationSec * 1000)) * 100;

            return (
              <View
                key={market.key}
                style={{ width: useTwoColumns ? "49%" : "100%" }}
                className={`bg-surface border rounded-2xl p-4 gap-3 ${tone.border}`}
              >
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className="text-text font-semibold text-base">
                      {market.label}
                    </Text>
                    <Text className="text-text-subtle text-xs">
                      Round ends in {formatCountdown(roundTimeLeftMs)}
                    </Text>
                  </View>
                  <View className={`px-2 py-1 rounded-full ${tone.accent}`}>
                    <Text className={`text-xs font-semibold ${tone.text}`}>
                      LIVE
                    </Text>
                  </View>
                </View>

                <View className="bg-background rounded-xl p-3 border border-border gap-2">
                  <View className="flex-row items-end justify-between">
                    <View>
                      <Text className="text-text-subtle text-xs">
                        Live Price
                      </Text>
                      <Text className="text-text text-2xl font-mono font-bold">
                        ${formatPrice(marketPrice)}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-text-subtle text-xs">
                        Round Open
                      </Text>
                      <Text className="text-text text-sm font-mono">
                        ${formatPrice(round.openPrice)}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center">
                    <View className="bg-danger/15 border border-danger/30 rounded-lg px-2 py-1">
                      <Text className="text-danger text-xs font-semibold">
                        DOWN {formatContractPrice(downQuote)}
                      </Text>
                    </View>
                    <View className="flex-1 items-center">
                      <Text className="text-text-subtle text-xs">
                        Vol {Math.round(roundVolume).toLocaleString("en-US")}{" "}
                        TOK
                      </Text>
                    </View>
                    <View className="bg-success/15 border border-success/30 rounded-lg px-2 py-1">
                      <Text className="text-success text-xs font-semibold">
                        UP {formatContractPrice(upQuote)}
                      </Text>
                    </View>
                  </View>

                  <View className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
                    <View
                      className="h-full bg-primary"
                      style={{
                        width: `${Math.max(0, Math.min(100, roundProgress))}%`,
                      }}
                    />
                  </View>
                </View>

                <View className="gap-2">
                  <View className="flex-row gap-2">
                    {marketActivity.slice(0, 3).map((trade) => (
                      <View
                        key={trade.id}
                        className="flex-1 bg-surface-hover border border-border rounded-lg px-2 py-1.5"
                      >
                        <Text className="text-text-subtle text-xs">
                          {trade.trader}
                        </Text>
                        <Text
                          className={`text-xs font-semibold ${
                            trade.side === "up" ? "text-success" : "text-danger"
                          }`}
                        >
                          {trade.side === "up" ? "UP" : "DOWN"}{" "}
                          {formatContractPrice(trade.quote)}
                        </Text>
                      </View>
                    ))}
                    {marketActivity.length === 0 ? (
                      <View className="flex-1 bg-surface-hover border border-border rounded-lg px-2 py-1.5 items-center justify-center">
                        <Text className="text-text-subtle text-xs">
                          No recent bets
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View className="flex-row gap-2">
                    {BET_AMOUNTS.map((amount) => (
                      <Pressable
                        key={amount}
                        onPress={() =>
                          setSelectedAmounts((previous) => ({
                            ...previous,
                            [market.key]: amount,
                          }))
                        }
                        className={`flex-1 py-2 rounded-lg border items-center ${
                          selectedAmount === amount
                            ? "bg-primary border-primary"
                            : "bg-surface-hover border-border"
                        }`}
                      >
                        <View className="flex-row items-center">
                          <Text
                            className={`font-mono font-semibold ${
                              selectedAmount === amount
                                ? "text-white"
                                : "text-text"
                            }`}
                          >
                            {amount}
                          </Text>
                          <View className="ml-1">
                            <TokenIcon size={14} />
                          </View>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View className="flex-row gap-3">
                  <Pressable
                    onPress={() => placePosition(market.key, "down", downQuote)}
                    disabled={!canPlace || balance < selectedAmount}
                    className={`flex-1 py-3 rounded-xl items-center justify-center flex-row ${
                      canPlace && balance >= selectedAmount
                        ? "bg-danger"
                        : "bg-danger/40"
                    }`}
                  >
                    <Ionicons name="trending-down" size={18} color="#FFFFFF" />
                    <Text className="text-white font-semibold ml-2">
                      DOWN {formatContractPrice(downQuote)}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => placePosition(market.key, "up", upQuote)}
                    disabled={!canPlace || balance < selectedAmount}
                    className={`flex-1 py-3 rounded-xl items-center justify-center flex-row ${
                      canPlace && balance >= selectedAmount
                        ? "bg-success"
                        : "bg-success/40"
                    }`}
                  >
                    <Ionicons name="trending-up" size={18} color="#FFFFFF" />
                    <Text className="text-white font-semibold ml-2">
                      UP {formatContractPrice(upQuote)}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>

        <View className="bg-surface border border-border rounded-2xl overflow-hidden">
          <View className="px-4 py-3 border-b border-border flex-row items-center justify-between">
            <Text className="text-text font-semibold">Open Positions</Text>
            <Text className="text-text-subtle text-xs">
              {openPositions.length} active
            </Text>
          </View>

          <View className="p-3 gap-2">
            {sortedOpenPositions.length === 0 ? (
              <View className="py-6 items-center">
                <Text className="text-text-subtle text-sm">
                  Place a position to start a shorts round
                </Text>
              </View>
            ) : (
              sortedOpenPositions.map((position) => {
                const market = MARKET_BY_KEY[position.marketKey];
                const secondsLeft = formatCountdown(
                  position.roundEndTime - now,
                );
                return (
                  <View
                    key={position.id}
                    className="bg-surface-hover/40 border border-border rounded-xl p-3"
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-text font-semibold">
                          {market.label}{" "}
                          {position.direction === "up" ? "UP" : "DOWN"}
                        </Text>
                        <Ionicons
                          name={
                            position.direction === "up"
                              ? "trending-up"
                              : "trending-down"
                          }
                          size={14}
                          color={
                            position.direction === "up" ? "#22C55E" : "#EF4444"
                          }
                        />
                      </View>
                      <Text className="text-text-subtle text-xs">
                        Settles in {secondsLeft}
                      </Text>
                    </View>
                    <View className="flex-row items-center justify-between mt-2">
                      <Text className="text-text text-xs font-mono">
                        Fill {formatContractPrice(position.entryQuote)} •{" "}
                        {position.shares.toFixed(4)} shares
                      </Text>
                      <Text className="text-text-subtle text-xs">
                        Cost {position.amount} TOK
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>

        <View className="bg-surface border border-border rounded-2xl overflow-hidden">
          <View className="px-4 py-3 border-b border-border flex-row items-center justify-between">
            <Text className="text-text font-semibold">Recent Settlements</Text>
            <Text className="text-text-subtle text-xs">
              Chainlink close • $1 payout/share
            </Text>
          </View>

          <View className="p-3 gap-2">
            {settledPositions.length === 0 ? (
              <View className="py-5 items-center">
                <Text className="text-text-subtle text-sm">
                  No settlements yet
                </Text>
              </View>
            ) : (
              settledPositions.slice(0, 10).map((position) => {
                const market = MARKET_BY_KEY[position.marketKey];
                const statusColor =
                  position.status === "win"
                    ? "text-success"
                    : position.status === "push"
                      ? "text-warning"
                      : "text-danger";

                return (
                  <View
                    key={position.id}
                    className="bg-surface-hover/40 border border-border rounded-xl p-3"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-text font-medium">
                        {market.label} {position.direction.toUpperCase()}
                      </Text>
                      <Text
                        className={`font-semibold uppercase text-xs ${statusColor}`}
                      >
                        {position.status}
                      </Text>
                    </View>

                    <View className="flex-row items-center justify-between mt-2">
                      <Text className="text-text-subtle text-xs">
                        Fill {formatContractPrice(position.entryQuote)} • Open $
                        {formatPrice(position.entryPrice)} / Close $
                        {formatPrice(position.settlePrice)}
                      </Text>
                      <Text
                        className={`text-sm font-mono ${
                          position.profit > 0
                            ? "text-success"
                            : position.profit < 0
                              ? "text-danger"
                              : "text-text-subtle"
                        }`}
                      >
                        {position.profit >= 0 ? "+" : ""}
                        {position.profit.toFixed(2)} TOK
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
