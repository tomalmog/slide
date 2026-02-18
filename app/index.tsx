import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { TokenIcon } from "../components/ui/TokenIcon";
import {
  AssetCode,
  MARKET_BY_ASSET,
  MARKET_BY_KEY,
  MarketKey,
  MarketSymbol,
  ROUND_TICK_MS,
  SHORTS_MARKETS,
  TOKEN_TO_USDC_RATE,
} from "../constants/shorts";
import { useLiveCryptoPrices } from "../hooks/useLiveCryptoPrices";
import { useSettledPositions } from "../contexts/SettledPositionsContext";
import { useBotSimulation } from "../hooks/useBotSimulation";
import { getUpProbability } from "../utils/quoteProbability";
import { playSound } from "../utils/sounds";

type Direction = "up" | "down";
type PositionStatus = "win" | "loss" | "push";

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

interface PriceSample {
  timestamp: number;
  price: number;
}

interface ChartTimeMarker {
  id: string;
  x: number;
  label: string;
  textAnchor: "start" | "middle" | "end";
}

const STARTING_BALANCE = 10000;
const DEFAULT_BET_AMOUNT = 50;
const MIN_CONTRACT_CENTS = 15;
const CHART_SAMPLE_MS = 250;
const MAX_CHART_POINTS = 220;
const CHART_WINDOW_MS = 50000;
const CHART_TIME_MARKER_MS = 10000;
const CHART_CURRENT_MARKER_DELAY_MS = 2000;
const CHART_VIEWBOX_WIDTH = 320;
const CHART_VIEWBOX_HEIGHT = 130;
const CHART_PLOT_WIDTH = 268;
const CHART_AXIS_GAP = 4;
const CHART_Y_LABEL_X = CHART_PLOT_WIDTH + CHART_AXIS_GAP;
const MAX_ACTIVITY_ITEMS = 10;
const MARKET_TONES = [
  {
    border: "border-warning/40",
    accent: "bg-warning/15",
    text: "text-warning",
  },
  {
    border: "border-primary/40",
    accent: "bg-primary/15",
    text: "text-primary",
  },
  {
    border: "border-success/40",
    accent: "bg-success/15",
    text: "text-success",
  },
  {
    border: "border-danger/40",
    accent: "bg-danger/15",
    text: "text-danger",
  },
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

function formatAxisPrice(price: number) {
  if (price >= 1000) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  return price.toFixed(2);
}

function formatCountdown(ms: number) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatChartTime(timestamp: number) {
  const date = new Date(timestamp);
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
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

function getCurrentRoundUserPositionCounts(
  positions: OpenPosition[],
  rounds: Record<MarketKey, MarketRound>,
) {
  const counts = {} as Record<MarketKey, number>;
  for (const market of SHORTS_MARKETS) {
    counts[market.key] = 0;
  }

  for (const position of positions) {
    const activeRoundId = rounds[position.marketKey]?.id;
    if (position.roundId === activeRoundId) {
      counts[position.marketKey] += 1;
    }
  }

  return counts;
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

function getInitialLatestPriceMap() {
  const next = {} as Record<MarketSymbol, number | null>;
  for (const market of SHORTS_MARKETS) {
    next[market.symbol] = null;
  }
  return next;
}

function buildChartPath(points: { x: number; y: number }[]) {
  if (points.length === 0) {
    return "";
  }

  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
}

function buildWindowSeries(
  samples: PriceSample[],
  windowStart: number,
  windowEnd: number,
  sampleStepMs: number,
): PriceSample[] {
  if (samples.length === 0) {
    return [];
  }

  const sortedSamples = [...samples].sort(
    (firstSample, secondSample) =>
      firstSample.timestamp - secondSample.timestamp,
  );
  const filledSamples: PriceSample[] = [];
  let sourceIndex = 0;
  let latestPrice = sortedSamples[0].price;

  for (
    let timestamp = windowStart;
    timestamp <= windowEnd;
    timestamp += sampleStepMs
  ) {
    while (
      sourceIndex < sortedSamples.length &&
      sortedSamples[sourceIndex].timestamp <= timestamp
    ) {
      latestPrice = sortedSamples[sourceIndex].price;
      sourceIndex += 1;
    }

    filledSamples.push({ timestamp, price: latestPrice });
  }

  if (
    filledSamples.length === 0 ||
    filledSamples[filledSamples.length - 1].timestamp < windowEnd
  ) {
    filledSamples.push({ timestamp: windowEnd, price: latestPrice });
  }

  return filledSamples.slice(-MAX_CHART_POINTS);
}

function getContractQuotes(
  openPrice: number | null,
  latestPrice: number | null,
  _upStake: number,
  _downStake: number,
  _asset: AssetCode = "BTC",
  roundProgress: number = 0.5,
  roundDurationMs: number = 30000,
) {
  const upProbability = getUpProbability({
    openPrice,
    latestPrice,
    roundProgress,
    roundDurationMs,
  });

  const upCents = clamp(
    Math.round(upProbability * 100),
    MIN_CONTRACT_CENTS,
    100 - MIN_CONTRACT_CENTS,
  );
  const downCents = 100 - upCents;

  return {
    up: upCents / 100,
    down: downCents / 100,
  };
}

function getMarketTone(marketIndex: number) {
  return MARKET_TONES[marketIndex % MARKET_TONES.length];
}

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const marketCardWidth = Math.max(320, width - 32);

  const {
    prices,
    history: livePriceHistory,
    status: priceFeedStatus,
    error: priceFeedError,
  } = useLiveCryptoPrices();
  const [balance, setBalance] = useState(STARTING_BALANCE);
  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const { setSettledPositions } = useSettledPositions();
  const [now, setNow] = useState(Date.now());
  const [positionsExpanded, setPositionsExpanded] = useState(false);
  const [activeMarketIndex, setActiveMarketIndex] = useState(0);
  const marketScrollRef = useRef<ScrollView | null>(null);

  const balanceRef = useRef(balance);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  const openPositionsRef = useRef<OpenPosition[]>(openPositions);
  useEffect(() => {
    openPositionsRef.current = openPositions;
  }, [openPositions]);

  const latestPricesRef = useRef<Record<MarketSymbol, number | null>>(
    getInitialLatestPriceMap(),
  );

  // Single market data source: live Binance feed.
  useEffect(() => {
    const nextLatestPrices = { ...latestPricesRef.current };
    for (const market of SHORTS_MARKETS) {
      const spotPrice = prices[market.symbol]?.price ?? null;
      nextLatestPrices[market.symbol] =
        spotPrice ?? nextLatestPrices[market.symbol];
    }
    latestPricesRef.current = nextLatestPrices;
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

  const resolveRounds = useCallback(
    (events: SettlementEvent[], resolvedAt: number) => {
      if (events.length === 0) {
        return;
      }

      const eventMap = new Map<string, number>();
      for (const event of events) {
        eventMap.set(event.roundId, event.settlePrice);
      }

      const previousOpen = openPositionsRef.current;
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

      if (resolved.length === 0) {
        return;
      }

      openPositionsRef.current = stillOpen;
      setOpenPositions(stillOpen);

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
    },
    [setSettledPositions],
  );

  const processPendingSettlements = useCallback(() => {
    const pending = pendingSettlementsRef.current;
    if (pending.length === 0) {
      return;
    }

    const toResolve: SettlementEvent[] = [];
    const stillPending: PendingSettlement[] = [];

    for (const item of pending) {
      const fallbackMarket = MARKET_BY_ASSET[item.asset];
      const settlePrice = latestPricesRef.current[fallbackMarket.symbol];
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
  }, [prices, processPendingSettlements]);

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
        prices[market.symbol]?.price ?? round.openPrice;
      const roundDuration = round.endTime - round.startTime;
      const roundProgress =
        roundDuration > 0
          ? Math.min(1, Math.max(0, (now - round.startTime) / roundDuration))
          : 0.5;
      const quotes = getContractQuotes(
        round.openPrice,
        latestUnderlyingPrice,
        book.upStake,
        book.downStake,
        market.asset,
        roundProgress,
        roundDuration,
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
  }, [marketBooks, now, prices, rounds]);

  const currentRoundPositionCount = useMemo(
    () => getCurrentRoundUserPositionCounts(openPositions, rounds),
    [openPositions, rounds],
  );

  const handleMarketScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const xOffset = event.nativeEvent.contentOffset.x;
      const nextIndex = clamp(
        Math.round(xOffset / marketCardWidth),
        0,
        SHORTS_MARKETS.length - 1,
      );
      setActiveMarketIndex(nextIndex);
    },
    [marketCardWidth],
  );

  const shouldPrioritizeOtherMarkets = useCallback((marketKey: MarketKey) => {
    const counts = getCurrentRoundUserPositionCounts(
      openPositionsRef.current,
      roundsRef.current,
    );

    if ((counts[marketKey] ?? 0) === 0) {
      return false;
    }

    const nowMs = Date.now();
    for (const market of SHORTS_MARKETS) {
      if (market.key === marketKey) {
        continue;
      }

      const round = roundsRef.current[market.key];
      if (
        !round ||
        typeof round.openPrice !== "number" ||
        nowMs >= round.endTime
      ) {
        continue;
      }

      if ((counts[market.key] ?? 0) === 0) {
        return true;
      }
    }

    return false;
  }, []);

  const placePosition = useCallback(
    (marketKey: MarketKey, direction: Direction, entryQuote: number) => {
      if (priceFeedStatus !== "live") {
        return;
      }

      const activeRound = roundsRef.current[marketKey];
      const amount = DEFAULT_BET_AMOUNT;
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
      const previousOpenPositions = openPositionsRef.current;

      const userRoundCounts = getCurrentRoundUserPositionCounts(
        previousOpenPositions,
        roundsRef.current,
      );
      if (
        (userRoundCounts[marketKey] ?? 0) > 0 &&
        shouldPrioritizeOtherMarkets(marketKey)
      ) {
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

      setOpenPositions((previous) => {
        const next = [newPosition, ...previous].slice(0, 120);
        openPositionsRef.current = next;
        return next;
      });

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

      const countsAfterBet = getCurrentRoundUserPositionCounts(
        [newPosition, ...previousOpenPositions],
        roundsRef.current,
      );
      const currentIndex = SHORTS_MARKETS.findIndex(
        (market) => market.key === marketKey,
      );
      const findNextIndex = (preferUnbet: boolean) => {
        for (let offset = 1; offset <= SHORTS_MARKETS.length; offset += 1) {
          const candidateIndex =
            (currentIndex + offset) % SHORTS_MARKETS.length;
          const candidate = SHORTS_MARKETS[candidateIndex];
          const candidateRound = roundsRef.current[candidate.key];
          if (
            !candidateRound ||
            typeof candidateRound.openPrice !== "number" ||
            nowMs >= candidateRound.endTime
          ) {
            continue;
          }

          if (preferUnbet && (countsAfterBet[candidate.key] ?? 0) > 0) {
            continue;
          }

          return candidateIndex;
        }

        return -1;
      };

      let nextIndex = findNextIndex(true);
      if (nextIndex < 0) {
        nextIndex = findNextIndex(false);
      }

      if (nextIndex >= 0) {
        setActiveMarketIndex(nextIndex);
        marketScrollRef.current?.scrollTo({
          x: nextIndex * marketCardWidth,
          animated: true,
        });
      }
    },
    [marketCardWidth, priceFeedStatus, shouldPrioritizeOtherMarkets],
  );

  const sortedOpenPositions = useMemo(
    () => [...openPositions].sort((a, b) => a.roundEndTime - b.roundEndTime),
    [openPositions],
  );

  useEffect(() => {
    marketScrollRef.current?.scrollTo({
      x: activeMarketIndex * marketCardWidth,
      animated: false,
    });
  }, [activeMarketIndex, marketCardWidth]);

  const isTradingEnabled = priceFeedStatus === "live";

  useBotSimulation({
    roundsRef,
    marketBooksRef,
    latestPricesRef,
    getContractQuotes,
    setMarketBooks,
    enabled: isTradingEnabled,
  });

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

        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => router.push("/settlements")}
            className="bg-surface-hover border border-border rounded-lg p-2"
          >
            <Ionicons name="receipt-outline" size={20} color="#FAFAFA" />
          </Pressable>
          <Pressable
            onPress={() => router.push("/settings")}
            className="bg-surface-hover border border-border rounded-lg p-2"
          >
            <Ionicons name="settings-outline" size={20} color="#FAFAFA" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 16 }}
      >
        {!isTradingEnabled && (
          <View className="bg-danger/15 border border-danger rounded-2xl p-4 gap-2">
            <View className="flex-row items-center gap-2">
              <Ionicons name="warning-outline" size={18} color="#EF4444" />
              <Text className="text-danger font-semibold">Trading Halted</Text>
            </View>
            <Text className="text-text text-sm">
              Shorts requires live Binance market data. Betting is disabled
              until the feed reconnects.
            </Text>
            {priceFeedError ? (
              <Text className="text-text-subtle text-xs">{priceFeedError}</Text>
            ) : null}
          </View>
        )}

        <View className="gap-2">
          <ScrollView
            ref={marketScrollRef}
            horizontal
            pagingEnabled
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleMarketScrollEnd}
            scrollEventThrottle={16}
          >
            {SHORTS_MARKETS.map((market, marketIndex) => {
              const round = rounds[market.key];
              const tone = getMarketTone(marketIndex);
              const quoteSnapshot = marketQuoteSnapshots[market.key];
              const spotPrice = prices[market.symbol]?.price ?? null;
              const marketPrice = spotPrice ?? round.openPrice;
              const upQuote = quoteSnapshot?.up ?? 0.5;
              const downQuote = quoteSnapshot?.down ?? 0.5;
              const roundVolume =
                (quoteSnapshot?.upStake ?? 0) + (quoteSnapshot?.downStake ?? 0);
              const sourceHistory = livePriceHistory[market.symbol] ?? [];
              const rawHistory = sourceHistory.map((point) => ({
                timestamp: point.updatedAt,
                price: point.price,
              }));
              const priceHistoryFull =
                rawHistory.length > 0
                  ? rawHistory
                  : typeof marketPrice === "number"
                    ? [{ timestamp: now, price: marketPrice }]
                    : [];
              const chartWindowStart = now - CHART_WINDOW_MS;
              const preWindowPoint = rawHistory
                .filter((point) => point.timestamp < chartWindowStart)
                .sort(
                  (firstPoint, secondPoint) =>
                    secondPoint.timestamp - firstPoint.timestamp,
                )[0];
              const windowedPriceHistory = priceHistoryFull.filter(
                (point) =>
                  point.timestamp >= chartWindowStart && point.timestamp <= now,
              );
              const baseHistory =
                windowedPriceHistory.length > 0
                  ? [
                      ...(preWindowPoint
                        ? [
                            {
                              timestamp: chartWindowStart,
                              price: preWindowPoint.price,
                            },
                          ]
                        : []),
                      ...windowedPriceHistory,
                    ]
                  : typeof marketPrice === "number"
                    ? [{ timestamp: now, price: marketPrice }]
                    : [];
              const filledHistory = buildWindowSeries(
                baseHistory,
                chartWindowStart,
                now,
                CHART_SAMPLE_MS,
              );
              const chartHistory =
                filledHistory.length > 0 && typeof marketPrice === "number"
                  ? [
                      ...filledHistory.slice(0, -1),
                      { timestamp: now, price: marketPrice },
                    ]
                  : filledHistory;
              const chartValues = chartHistory.map((point) => point.price);
              if (typeof round.openPrice === "number") {
                chartValues.push(round.openPrice);
              }
              if (typeof marketPrice === "number") {
                chartValues.push(marketPrice);
              }
              const baseMin =
                chartValues.length > 0 ? Math.min(...chartValues) : 0;
              const baseMax =
                chartValues.length > 0 ? Math.max(...chartValues) : 1;
              const flatRangePaddingBase = Math.max(
                Math.abs(baseMin),
                Math.abs(baseMax),
                0.000001,
              );
              const chartPadding =
                baseMax === baseMin
                  ? flatRangePaddingBase * 0.002
                  : (baseMax - baseMin) * 0.15;
              const chartMin = baseMin - chartPadding;
              const chartMax = baseMax + chartPadding;
              const chartRange = chartMax - chartMin || 1;
              const toChartX = (timestamp: number) =>
                clamp(
                  ((timestamp - chartWindowStart) / CHART_WINDOW_MS) *
                    CHART_PLOT_WIDTH,
                  0,
                  CHART_PLOT_WIDTH,
                );
              const toChartY = (value: number) =>
                ((chartMax - value) / chartRange) * CHART_VIEWBOX_HEIGHT;
              const chartPoints = chartHistory.map((point) => ({
                x: toChartX(point.timestamp),
                y: toChartY(point.price),
              }));
              const chartPath = buildChartPath(chartPoints);
              const latestChartPoint = chartPoints[chartPoints.length - 1];
              const startLineY =
                typeof round.openPrice === "number"
                  ? toChartY(round.openPrice)
                  : null;
              const currentLineY =
                typeof marketPrice === "number" ? toChartY(marketPrice) : null;
              const arePriceLinesOverlapping =
                startLineY !== null &&
                currentLineY !== null &&
                Math.abs(startLineY - currentLineY) < 2;
              const startPriceLabelY =
                startLineY === null
                  ? null
                  : clamp(
                      startLineY + (arePriceLinesOverlapping ? -5 : 3),
                      10,
                      CHART_VIEWBOX_HEIGHT - 14,
                    );
              const currentPriceLabelY =
                currentLineY === null
                  ? null
                  : clamp(
                      currentLineY + (arePriceLinesOverlapping ? 8 : 3),
                      10,
                      CHART_VIEWBOX_HEIGHT - 14,
                    );
              const markerSlotTime =
                Math.floor(now / CHART_TIME_MARKER_MS) * CHART_TIME_MARKER_MS;
              const currentSlotAgeMs = now - markerSlotTime;
              const movingMarkerLifespanMs =
                CHART_WINDOW_MS - CHART_TIME_MARKER_MS;
              const movingTimeMarkers: ChartTimeMarker[] = [];
              for (
                let markerTimestamp = markerSlotTime - CHART_TIME_MARKER_MS;
                markerTimestamp >= chartWindowStart;
                markerTimestamp -= CHART_TIME_MARKER_MS
              ) {
                const markerAgeMs = now - markerTimestamp;
                if (
                  markerAgeMs <= CHART_TIME_MARKER_MS ||
                  movingMarkerLifespanMs <= 0
                ) {
                  continue;
                }

                const movementProgress = clamp(
                  (markerAgeMs - CHART_TIME_MARKER_MS) / movingMarkerLifespanMs,
                  0,
                  1,
                );
                movingTimeMarkers.push({
                  id: `moving-${markerTimestamp}`,
                  x: CHART_PLOT_WIDTH * (1 - movementProgress),
                  label: formatChartTime(markerTimestamp),
                  textAnchor: "middle",
                });
              }
              movingTimeMarkers.sort(
                (firstMarker, secondMarker) => firstMarker.x - secondMarker.x,
              );

              const chartTimeMarkers: ChartTimeMarker[] = [
                ...movingTimeMarkers,
              ];
              if (currentSlotAgeMs >= CHART_CURRENT_MARKER_DELAY_MS) {
                chartTimeMarkers.push({
                  id: `current-${markerSlotTime}`,
                  x: CHART_PLOT_WIDTH,
                  label: formatChartTime(markerSlotTime),
                  textAnchor: "end",
                });
              }

              if (chartTimeMarkers.length > 0) {
                chartTimeMarkers[0].textAnchor = "start";
              }
              const selectedAmount = DEFAULT_BET_AMOUNT;
              const roundTimeLeftMs = Math.max(0, round.endTime - now);
              const hasBetThisRound =
                (currentRoundPositionCount[market.key] ?? 0) > 0;
              const blockedByRotation =
                hasBetThisRound && shouldPrioritizeOtherMarkets(market.key);
              const canPlace =
                isTradingEnabled &&
                roundTimeLeftMs > 0 &&
                typeof round.openPrice === "number" &&
                !blockedByRotation;

              return (
                <View
                  key={market.key}
                  style={{ width: marketCardWidth }}
                  className={`bg-surface border rounded-2xl p-4 gap-3 ${tone.border}`}
                >
                  <View className="items-center gap-2">
                    <View className="flex-row items-center justify-center">
                      <Text className="text-text text-3xl font-mono font-bold">
                        {Math.floor(balance).toLocaleString("en-US")}
                      </Text>
                      <View className="ml-2">
                        <TokenIcon size={28} />
                      </View>
                    </View>
                    <View
                      className={`w-10 h-10 rounded-full border border-border items-center justify-center ${tone.accent}`}
                    >
                      <Text
                        className={`text-[10px] font-semibold ${tone.text}`}
                      >
                        {market.asset}
                      </Text>
                    </View>
                    <Text className="text-text font-semibold text-base">
                      {market.label}
                    </Text>
                    <Text className="text-text-subtle text-xs">
                      Ends in {formatCountdown(roundTimeLeftMs)}
                    </Text>
                  </View>

                  <View className="bg-background rounded-xl p-3 border border-border gap-2">
                    <View className="flex-row items-end justify-between">
                      <View>
                        <Text className="text-text-subtle text-xs">
                          Current
                        </Text>
                        <Text className="text-text text-2xl font-mono font-bold">
                          ${formatPrice(marketPrice)}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-text-subtle text-xs">
                          Initial
                        </Text>
                        <Text className="text-text text-sm font-mono">
                          ${formatPrice(round.openPrice)}
                        </Text>
                      </View>
                    </View>

                    <View className="h-36 rounded-lg bg-surface-hover/20 border border-border overflow-hidden">
                      <Svg
                        width="100%"
                        height="100%"
                        viewBox={`0 0 ${CHART_VIEWBOX_WIDTH} ${CHART_VIEWBOX_HEIGHT}`}
                        preserveAspectRatio="none"
                      >
                        {chartTimeMarkers.map((marker) => (
                          <Line
                            key={`time-grid-${market.key}-${marker.id}`}
                            x1={marker.x}
                            y1={0}
                            x2={marker.x}
                            y2={CHART_VIEWBOX_HEIGHT}
                            stroke="#27272A"
                            strokeWidth={1}
                            opacity={0.45}
                          />
                        ))}
                        {startLineY !== null ? (
                          <Line
                            x1={0}
                            y1={startLineY}
                            x2={CHART_PLOT_WIDTH}
                            y2={startLineY}
                            stroke="#EF4444"
                            strokeWidth={arePriceLinesOverlapping ? 1.8 : 1.5}
                            strokeDasharray="6 6"
                            opacity={0.9}
                          />
                        ) : null}
                        {currentLineY !== null ? (
                          <Line
                            x1={0}
                            y1={currentLineY}
                            x2={CHART_PLOT_WIDTH}
                            y2={currentLineY}
                            stroke="#F59E0B"
                            strokeWidth={arePriceLinesOverlapping ? 1.2 : 1.5}
                            strokeDasharray={
                              arePriceLinesOverlapping ? "3 6" : "6 6"
                            }
                            opacity={arePriceLinesOverlapping ? 0.85 : 0.9}
                          />
                        ) : null}
                        {chartPath ? (
                          <Path
                            d={chartPath}
                            stroke="#F59E0B"
                            strokeWidth={2.2}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ) : null}
                        {latestChartPoint ? (
                          <Circle
                            cx={latestChartPoint.x}
                            cy={latestChartPoint.y}
                            r={3.5}
                            fill="#F59E0B"
                          />
                        ) : null}
                        {/* Y-axis: top price */}
                        <SvgText
                          x={CHART_Y_LABEL_X}
                          y={10}
                          fill="#A1A1AA"
                          fontSize={7}
                          fontFamily="monospace"
                        >
                          {formatAxisPrice(chartMax)}
                        </SvgText>
                        {/* Y-axis: open price */}
                        {startPriceLabelY !== null &&
                        round.openPrice !== null ? (
                          <SvgText
                            x={CHART_Y_LABEL_X}
                            y={startPriceLabelY}
                            fill="#EF4444"
                            fontSize={7}
                            fontFamily="monospace"
                          >
                            {formatAxisPrice(round.openPrice)}
                          </SvgText>
                        ) : null}
                        {/* Y-axis: current price */}
                        {currentPriceLabelY !== null && marketPrice !== null ? (
                          <SvgText
                            x={CHART_Y_LABEL_X}
                            y={currentPriceLabelY}
                            fill="#F59E0B"
                            fontSize={7}
                            fontFamily="monospace"
                          >
                            {formatAxisPrice(marketPrice)}
                          </SvgText>
                        ) : null}
                        {/* Y-axis: bottom price */}
                        <SvgText
                          x={CHART_Y_LABEL_X}
                          y={CHART_VIEWBOX_HEIGHT - 4}
                          fill="#A1A1AA"
                          fontSize={7}
                          fontFamily="monospace"
                        >
                          {formatAxisPrice(chartMin)}
                        </SvgText>
                        {chartTimeMarkers.map((marker) => (
                          <SvgText
                            key={`time-label-${market.key}-${marker.id}`}
                            x={marker.x}
                            y={CHART_VIEWBOX_HEIGHT - 4}
                            fill="#71717A"
                            fontSize={6.5}
                            fontFamily="monospace"
                            textAnchor={marker.textAnchor}
                          >
                            {marker.label}
                          </SvgText>
                        ))}
                      </Svg>
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
                  </View>

                  <Text className="text-text-subtle text-xs text-center">
                    Bet size: {selectedAmount} TOK
                  </Text>

                  {blockedByRotation ? (
                    <Text className="text-warning text-xs">
                      Place at least one bet on other open markets first.
                    </Text>
                  ) : null}

                  <View className="flex-row gap-3">
                    <Pressable
                      onPress={() =>
                        placePosition(market.key, "down", downQuote)
                      }
                      disabled={!canPlace || balance < selectedAmount}
                      className={`flex-1 py-3 rounded-xl items-center justify-center flex-row ${
                        canPlace && balance >= selectedAmount
                          ? "bg-danger"
                          : "bg-danger/40"
                      }`}
                    >
                      <Ionicons
                        name="trending-down"
                        size={18}
                        color="#FFFFFF"
                      />
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
          </ScrollView>
          <View className="items-center">
            <Text className="text-text-subtle text-xs">
              {activeMarketIndex + 1} / {SHORTS_MARKETS.length}
            </Text>
          </View>
        </View>

        <View className="bg-surface border border-border rounded-2xl overflow-hidden">
          <Pressable
            onPress={() => setPositionsExpanded((prev) => !prev)}
            className="px-4 py-3 border-b border-border flex-row items-center justify-between"
          >
            <View className="flex-row items-center gap-2">
              <Text className="text-text font-semibold">Open Positions</Text>
              <Text className="text-text-subtle text-xs">
                {openPositions.length} active
              </Text>
            </View>
            <Ionicons
              name={positionsExpanded ? "chevron-up" : "chevron-down"}
              size={18}
              color="#A1A1AA"
            />
          </Pressable>

          {positionsExpanded && (
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
                              position.direction === "up"
                                ? "#22C55E"
                                : "#EF4444"
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
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
