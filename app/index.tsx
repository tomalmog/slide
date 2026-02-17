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
  ROUND_LOCK_WINDOW_MS,
  ROUND_TICK_MS,
  SHORTS_MARKETS,
  SHORTS_PAYOUT_RATE,
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
  lockTime: number;
  openPrice: number | null;
}

interface OpenPosition {
  id: string;
  marketKey: MarketKey;
  roundId: string;
  direction: Direction;
  amount: number;
  createdAt: number;
  roundEndTime: number;
  entryPrice: number;
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

const STARTING_BALANCE = 10000;

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
    lockTime: endTime - ROUND_LOCK_WINDOW_MS,
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

  const [rounds, setRounds] = useState<Record<MarketKey, MarketRound>>(() => {
    const next = {} as Record<MarketKey, MarketRound>;
    const currentTime = Date.now();
    for (const market of SHORTS_MARKETS) {
      next[market.key] = createRound(
        market.key,
        market.durationSec * 1000,
        currentTime,
        null,
      );
    }
    return next;
  });

  const roundsRef = useRef(rounds);
  useEffect(() => {
    roundsRef.current = rounds;
  }, [rounds]);
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
          const profit = isWin
            ? roundToTwo(position.amount * SHORTS_PAYOUT_RATE)
            : 0;
          const payout = isPush
            ? position.amount
            : isWin
              ? position.amount + profit
              : 0;

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
      const nextRounds = { ...currentRounds };
      const newSettlements: PendingSettlement[] = [];
      let didChange = false;

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

        if (existingRound.id !== expectedRound.id) {
          newSettlements.push({
            roundId: existingRound.id,
            asset: market.asset,
          });

          nextRounds[market.key] = expectedRound;
          didChange = true;
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

  const placePosition = useCallback(
    (marketKey: MarketKey, direction: Direction) => {
      if (priceFeedStatus !== "live" || oracleStatus !== "live") {
        return;
      }

      const activeRound = roundsRef.current[marketKey];
      const amount = selectedAmounts[marketKey];

      if (!activeRound || typeof activeRound.openPrice !== "number") {
        return;
      }

      if (Date.now() >= activeRound.lockTime) {
        return;
      }

      if (balanceRef.current < amount) {
        return;
      }

      const nextBalance = balanceRef.current - amount;
      balanceRef.current = nextBalance;
      setBalance(nextBalance);

      const newPosition: OpenPosition = {
        id: `${activeRound.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        marketKey,
        roundId: activeRound.id,
        direction,
        amount,
        createdAt: Date.now(),
        roundEndTime: activeRound.endTime,
        entryPrice: activeRound.openPrice,
      };

      setOpenPositions((previous) => [newPosition, ...previous].slice(0, 120));
    },
    [oracleStatus, priceFeedStatus, selectedAmounts],
  );

  const currentRoundPositionCount = useMemo(() => {
    const counts = {} as Record<MarketKey, number>;
    for (const market of SHORTS_MARKETS) {
      counts[market.key] = 0;
    }

    for (const position of openPositions) {
      const activeRoundId = rounds[position.marketKey].id;
      if (position.roundId === activeRoundId) {
        counts[position.marketKey] += 1;
      }
    }

    return counts;
  }, [openPositions, rounds]);

  const sortedOpenPositions = useMemo(
    () => [...openPositions].sort((a, b) => a.roundEndTime - b.roundEndTime),
    [openPositions],
  );

  const usdEquivalent = balance / TOKEN_TO_USDC_RATE;
  const isTradingEnabled =
    priceFeedStatus === "live" && oracleStatus === "live";

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
            const chainlinkReference =
              chainlinkOraclePrices[market.asset]?.price ?? null;
            const liveSpotPrice = prices[market.symbol]?.price ?? null;
            const marketPrice =
              liveSpotPrice ?? chainlinkReference ?? round.openPrice;
            const displayedSource =
              liveSpotPrice !== null
                ? `Polymarket crypto_prices (${market.symbol})`
                : `Polymarket crypto_prices_chainlink (${market.asset}/USD)`;
            const selectedAmount = selectedAmounts[market.key];
            const roundTimeLeftMs = Math.max(0, round.endTime - now);
            const lockTimeLeftMs = Math.max(0, round.lockTime - now);
            const isLocked = lockTimeLeftMs === 0;
            const canPlace =
              isTradingEnabled &&
              !isLocked &&
              typeof round.openPrice === "number";
            const roundProgress =
              (roundTimeLeftMs / (market.durationSec * 1000)) * 100;
            const positionsThisRound = currentRoundPositionCount[market.key];

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
                      {isLocked ? "LOCKED" : "OPEN"}
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

                  <View className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
                    <View
                      className="h-full bg-primary"
                      style={{
                        width: `${Math.max(0, Math.min(100, roundProgress))}%`,
                      }}
                    />
                  </View>

                  <View className="flex-row items-center justify-between">
                    <Text className="text-text-subtle text-xs">
                      {isLocked
                        ? "Bets locked for current round"
                        : `Locks in ${formatCountdown(lockTimeLeftMs)}`}
                    </Text>
                    <Text className="text-text-subtle text-xs">
                      {positionsThisRound} live positions
                    </Text>
                  </View>
                  <Text className="text-text-subtle text-xs">
                    Source: {displayedSource}
                  </Text>
                  <Text className="text-text-subtle text-xs">
                    Chainlink ref: ${formatPrice(chainlinkReference)}
                  </Text>
                  <Text className="text-text-subtle text-xs">
                    Spot ref: ${formatPrice(liveSpotPrice)}
                  </Text>
                </View>

                <View className="gap-2">
                  <Text className="text-text-subtle text-xs tracking-wide uppercase">
                    Bet amount
                  </Text>
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
                    onPress={() => placePosition(market.key, "down")}
                    disabled={!canPlace || balance < selectedAmount}
                    className={`flex-1 py-3 rounded-xl items-center justify-center flex-row ${
                      canPlace && balance >= selectedAmount
                        ? "bg-danger"
                        : "bg-danger/40"
                    }`}
                  >
                    <Ionicons name="trending-down" size={18} color="#FFFFFF" />
                    <Text className="text-white font-semibold ml-2">DOWN</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => placePosition(market.key, "up")}
                    disabled={!canPlace || balance < selectedAmount}
                    className={`flex-1 py-3 rounded-xl items-center justify-center flex-row ${
                      canPlace && balance >= selectedAmount
                        ? "bg-success"
                        : "bg-success/40"
                    }`}
                  >
                    <Ionicons name="trending-up" size={18} color="#FFFFFF" />
                    <Text className="text-white font-semibold ml-2">UP</Text>
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
                      <View className="flex-row items-center">
                        <Text className="text-text text-sm font-mono">
                          {position.amount}
                        </Text>
                        <View className="ml-1">
                          <TokenIcon size={12} />
                        </View>
                      </View>
                      <Text className="text-text-subtle text-xs">
                        Round open ${formatPrice(position.entryPrice)}
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
              Chainlink close • 90% payout
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
                        Open ${formatPrice(position.entryPrice)} / Close $
                        {formatPrice(position.settlePrice)}
                      </Text>
                      <Text
                        className={`text-sm font-mono ${
                          position.payout > position.amount
                            ? "text-success"
                            : "text-text-subtle"
                        }`}
                      >
                        +{position.payout.toFixed(2)} TOK
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
