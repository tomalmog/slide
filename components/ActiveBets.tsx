import { useState, useEffect } from "react";
import { View, Text, ScrollView, Image } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

const TokenIcon = ({ size = 16 }: { size?: number }) => (
  <Image
    source={require("../assets/images/token.png")}
    style={{ width: size, height: size }}
  />
);

interface Bet {
  id: string;
  asset: string;
  symbol: string;
  direction: "up" | "down";
  amount: number;
  entryPrice: number;
  startTime: number;
  duration: number;
}

interface Props {
  bets: Bet[];
  onBetResolved: (betId: string, won: boolean, profit: number) => void;
  variant?: "bottom" | "sidebar";
}

function BetItem({
  bet,
  onResolved,
}: {
  bet: Bet;
  onResolved: (won: boolean, profit: number) => void;
}) {
  const [timeLeft, setTimeLeft] = useState(bet.duration);
  const [currentPrice, setCurrentPrice] = useState(bet.entryPrice);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (resolved) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - bet.startTime;
      const remaining = Math.max(0, bet.duration - elapsed);
      setTimeLeft(remaining);

      // Simulate price movement
      const priceChange = (Math.random() - 0.5) * (bet.entryPrice * 0.02);
      setCurrentPrice((prev) => prev + priceChange);

      if (remaining === 0) {
        clearInterval(interval);
        setResolved(true);

        // Determine win/loss
        const won =
          bet.direction === "up"
            ? currentPrice > bet.entryPrice
            : currentPrice < bet.entryPrice;

        const profit = won ? bet.amount * 0.85 : -bet.amount;

        setTimeout(() => {
          onResolved(won, profit);
        }, 100);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [bet, currentPrice, onResolved, resolved]);

  const progress = timeLeft / bet.duration;
  const secondsLeft = Math.ceil(timeLeft / 1000);

  const priceDiff = currentPrice - bet.entryPrice;
  const isWinning = bet.direction === "up" ? priceDiff > 0 : priceDiff < 0;

  const progressWidth = useAnimatedStyle(() => ({
    width: `${progress * 100}%`,
  }));

  return (
    <View className="relative bg-surface-hover/30 rounded-xl p-3 overflow-hidden">
      {/* Progress Bar Background */}
      <Animated.View
        style={progressWidth}
        className={`absolute inset-0 ${isWinning ? "bg-success/10" : "bg-danger/10"}`}
      />

      <View className="relative">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-2">
            <Text className="font-mono font-bold text-sm text-text">
              {bet.symbol}
            </Text>
            <Ionicons
              name={bet.direction === "up" ? "trending-up" : "trending-down"}
              size={14}
              color={isWinning ? "#22C55E" : "#EF4444"}
            />
          </View>

          <View className="flex-row items-center gap-1">
            <Ionicons name="time-outline" size={12} color="#71717A" />
            <Text
              className={`font-mono font-semibold text-xs ${
                secondsLeft <= 10 ? "text-danger" : "text-text"
              }`}
            >
              {secondsLeft}s
            </Text>
          </View>
        </View>

        {/* Details */}
        <View className="flex-row justify-between">
          <View>
            <Text className="text-text-subtle text-xs">Bet</Text>
            <View className="flex-row items-center">
              <Text className="font-mono font-semibold text-sm text-text">
                {bet.amount}
              </Text>
              <View className="ml-1">
                <TokenIcon size={14} />
              </View>
            </View>
          </View>
          <View>
            <Text className="text-text-subtle text-xs">Entry</Text>
            <Text className="font-mono text-sm text-text">
              ${bet.entryPrice.toFixed(2)}
            </Text>
          </View>
          <View>
            <Text className="text-text-subtle text-xs">Current</Text>
            <Text
              className={`font-mono font-semibold text-sm ${
                isWinning ? "text-success" : "text-danger"
              }`}
            >
              {isWinning ? "+" : ""}
              {priceDiff.toFixed(2)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function ActiveBets({ bets, onBetResolved, variant = "bottom" }: Props) {
  const isSidebar = variant === "sidebar";

  return (
    <View
      className={`bg-surface overflow-hidden flex-1 ${
        isSidebar
          ? "rounded-none border border-border"
          : "border-x border-border"
      }`}
    >
      {/* Header - only show for sidebar variant since bottom has its own handle */}
      {isSidebar && (
        <View className="px-5 py-4 border-b border-border flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-text-subtle uppercase tracking-wide">
            Active Bets
          </Text>
          {bets.length > 0 && (
            <View className="bg-primary px-2 py-0.5 rounded-full">
              <Text className="text-white text-xs font-semibold">
                {bets.length}
              </Text>
            </View>
          )}
        </View>
      )}

      <ScrollView
        className={`flex-1 ${isSidebar ? "p-4" : "p-3"}`}
        contentContainerStyle={{ gap: isSidebar ? 12 : 8 }}
        showsVerticalScrollIndicator={false}
      >
        {bets.length === 0 ? (
          <View className="flex-1 items-center justify-center py-8">
            <Text className="text-text-subtle text-sm">No active bets</Text>
            <Text className="text-text-subtle text-xs mt-1">
              Place a bet to get started
            </Text>
          </View>
        ) : (
          bets.map((bet) => (
            <BetItem
              key={bet.id}
              bet={bet}
              onResolved={(won, profit) => onBetResolved(bet.id, won, profit)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

export type { Bet };
