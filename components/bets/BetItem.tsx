import { useState, useEffect } from "react";
import { View, Text } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { TokenIcon } from "../ui/TokenIcon";
import { Bet } from "../../types";

interface Props {
  bet: Bet;
  onResolved: (won: boolean, profit: number) => void;
}

export function BetItem({ bet, onResolved }: Props) {
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
      <Animated.View
        style={progressWidth}
        className={`absolute inset-0 ${isWinning ? "bg-success/10" : "bg-danger/10"}`}
      />

      <View className="relative">
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
