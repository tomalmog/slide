import { useState, useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Bet } from "../types";

interface Props {
  bets: Bet[];
  onPress?: () => void;
}

interface BetWithTimeLeft extends Bet {
  timeLeft: number;
  isWinning: boolean;
}

function BetIndicator({ bet, index }: { bet: BetWithTimeLeft; index: number }) {
  const scale = useSharedValue(0);
  const secondsLeft = Math.ceil(bet.timeLeft / 1000);
  const isUrgent = secondsLeft <= 10;

  useEffect(() => {
    scale.value = withDelay(
      index * 50,
      withSpring(1, {
        damping: 18,
        stiffness: 200,
      }),
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={animatedStyle}
      className={`w-11 h-11 rounded-full items-center justify-center border-2 ${
        bet.isWinning
          ? "bg-success/20 border-success"
          : "bg-danger/20 border-danger"
      } ${isUrgent ? "border-warning" : ""}`}
    >
      <Ionicons
        name={bet.direction === "up" ? "trending-up" : "trending-down"}
        size={16}
        color={bet.isWinning ? "#22C55E" : "#EF4444"}
      />
      <Text
        className={`text-[10px] font-mono font-bold ${
          isUrgent ? "text-warning" : "text-text"
        }`}
      >
        {secondsLeft}s
      </Text>
    </Animated.View>
  );
}

export function FloatingBetIndicators({ bets, onPress }: Props) {
  const [betsWithTime, setBetsWithTime] = useState<BetWithTimeLeft[]>([]);

  useEffect(() => {
    if (bets.length === 0) {
      setBetsWithTime([]);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const updated = bets
        .map((bet) => {
          const elapsed = now - bet.startTime;
          const timeLeft = Math.max(0, bet.duration - elapsed);
          // Simulate winning state based on time (in real app, use actual price)
          const isWinning = Math.random() > 0.5;
          return { ...bet, timeLeft, isWinning };
        })
        .sort((a, b) => a.timeLeft - b.timeLeft)
        .slice(0, 5);

      setBetsWithTime(updated);
    }, 100);

    return () => clearInterval(interval);
  }, [bets]);

  if (bets.length === 0) {
    return null;
  }

  return (
    <Pressable onPress={onPress} className="absolute left-2 top-2 items-center">
      {/* Floating indicators */}
      <View className="bg-surface/90 border border-border rounded-2xl p-2 gap-2">
        {betsWithTime.map((bet, index) => (
          <BetIndicator key={bet.id} bet={bet} index={index} />
        ))}

        {/* Total count indicator at bottom */}
        <View className="items-center pt-1 border-t border-border mt-1 w-11">
          <Text className="text-text-subtle text-[10px] font-mono text-center">
            {bets.length} active
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
