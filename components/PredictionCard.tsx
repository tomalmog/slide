import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, Pressable } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "react-native";

const TokenIcon = ({ size = 24 }: { size?: number }) => (
  <Image
    source={require("../assets/images/token.png")}
    style={{ width: size, height: size }}
  />
);

type BetAmount = 10 | 25 | 50 | 100;

const BET_AMOUNTS: BetAmount[] = [10, 25, 50, 100];
const SWIPE_THRESHOLD = 50;

interface Asset {
  id: string;
  name: string;
  symbol: string;
  icon: string;
}

interface PriceData {
  price: number;
  change_24h: number;
}

interface Props {
  asset: Asset;
  nextAsset?: Asset;
  priceData: PriceData | null;
  nextPriceData?: PriceData | null;
  balance: number;
  onPlaceBet: (direction: "up" | "down", amount: BetAmount) => void;
  onSwipe: () => void;
  isLoading?: boolean;
  availableHeight?: number;
  floatingIndicators?: React.ReactNode;
}

function AssetDisplay({
  asset,
  priceData,
  style,
}: {
  asset: Asset;
  priceData: PriceData | null;
  style?: any;
}) {
  const price = priceData?.price ?? 0;
  const change24h = priceData?.change_24h ?? 0;
  const isPositive = change24h >= 0;

  const formatPrice = (p: number) => {
    if (p >= 1000) {
      return p.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } else if (p >= 1) {
      return p.toFixed(2);
    } else {
      return p.toFixed(4);
    }
  };

  return (
    <Animated.View style={style} className="items-center justify-center flex-1">
      {/* Asset Header */}
      <View className="items-center mb-4">
        <View className="flex-row items-center">
          <Text className="text-4xl mr-2">{asset.icon}</Text>
          <View>
            <Text className="text-xl font-semibold text-text">
              {asset.name}
            </Text>
            <Text className="text-text-subtle text-sm">
              {asset.symbol.replace("USDT", "")}
            </Text>
          </View>
        </View>
      </View>

      {/* Price Display */}
      <View className="items-center">
        <Text className="text-4xl font-bold font-mono text-text mb-2">
          ${formatPrice(price)}
        </Text>
        <View
          className={`flex-row items-center px-3 py-1.5 rounded-full ${
            isPositive ? "bg-success/10" : "bg-danger/10"
          }`}
        >
          <Ionicons
            name={isPositive ? "trending-up" : "trending-down"}
            size={14}
            color={isPositive ? "#22C55E" : "#EF4444"}
          />
          <Text
            className={`ml-1.5 text-sm font-medium ${
              isPositive ? "text-success" : "text-danger"
            }`}
          >
            {isPositive ? "+" : ""}
            {change24h.toFixed(2)}% 24h
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

export function PredictionCard({
  asset,
  nextAsset,
  priceData,
  nextPriceData,
  balance,
  onPlaceBet,
  onSwipe,
  isLoading = false,
  floatingIndicators,
}: Props) {
  const [selectedAmount, setSelectedAmount] = useState<BetAmount>(10);
  const translateY = useSharedValue(0);

  // For balance animation
  const balanceScale = useSharedValue(1);
  const balanceColor = useSharedValue(0); // 0 = neutral, 1 = green, -1 = red
  const prevBalance = useRef(balance);

  // Detect balance changes and animate
  useEffect(() => {
    if (balance !== prevBalance.current) {
      const increased = balance > prevBalance.current;
      balanceColor.value = increased ? 1 : -1;
      balanceScale.value = withSequence(
        withSpring(1.15, { damping: 10, stiffness: 400 }),
        withSpring(1, { damping: 15, stiffness: 300 }),
      );
      // Reset color after animation
      setTimeout(() => {
        balanceColor.value = withTiming(0, { duration: 500 });
      }, 1000);
      prevBalance.current = balance;
    }
  }, [balance]);

  const animatedBalanceStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: balanceScale.value }],
    };
  });

  const handleSwipe = useCallback(() => {
    onSwipe();
  }, [onSwipe]);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      // Only allow swiping up (negative Y)
      if (event.translationY < 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY < -SWIPE_THRESHOLD) {
        // Animate out and trigger swipe
        translateY.value = withTiming(-300, { duration: 200 }, () => {
          runOnJS(handleSwipe)();
          translateY.value = 0;
        });
      } else {
        // Reset position
        translateY.value = withTiming(0, { duration: 150 });
      }
    });

  // Current asset animates up and fades out
  const currentAssetStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, -150],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ translateY: translateY.value }],
      opacity,
    };
  });

  // Next asset comes in from below
  const nextAssetStyle = useAnimatedStyle(() => {
    const translateYNext = interpolate(
      translateY.value,
      [0, -150],
      [100, 0],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      translateY.value,
      [0, -100],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ translateY: translateYNext }],
      opacity,
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    };
  });

  const canBet = balance >= selectedAmount && !isLoading;

  return (
    <View className="flex-1">
      {/* Fixed Balance Section at Top */}
      <View className="p-4 border-b border-border">
        <Text className="text-xs text-text-subtle text-center mb-2 tracking-wide uppercase">
          Your Balance
        </Text>
        <Animated.View style={animatedBalanceStyle} className="items-center">
          <View className="flex-row items-center">
            <Text className="text-3xl font-bold font-mono text-success">
              {balance.toLocaleString("en-US", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </Text>
            <View className="ml-2">
              <TokenIcon size={28} />
            </View>
          </View>
        </Animated.View>
      </View>

      {/* Scrollable Asset Section */}
      <GestureDetector gesture={panGesture}>
        <View className="flex-1 overflow-hidden relative">
          {/* Current Asset */}
          <AssetDisplay
            asset={asset}
            priceData={priceData}
            style={currentAssetStyle}
          />

          {/* Next Asset Preview */}
          {nextAsset && (
            <AssetDisplay
              asset={nextAsset}
              priceData={nextPriceData ?? null}
              style={nextAssetStyle}
            />
          )}

          {/* Floating Indicators */}
          {floatingIndicators}
        </View>
      </GestureDetector>

      {/* Fixed Betting Controls */}
      <View className="p-4 gap-3 border-t border-border">
        {/* Bet Amount Selector */}
        <View>
          <Text className="text-xs text-text-subtle text-center mb-2 tracking-wide uppercase">
            Bet Amount
          </Text>
          <View className="flex-row gap-2">
            {BET_AMOUNTS.map((amount) => (
              <Pressable
                key={amount}
                onPress={() => setSelectedAmount(amount)}
                disabled={balance < amount}
                className={`flex-1 py-3 rounded-lg items-center ${
                  selectedAmount === amount ? "bg-primary" : "bg-surface-hover"
                } ${balance < amount ? "opacity-50" : ""}`}
              >
                <View className="flex-row items-center">
                  <Text
                    className={`font-mono font-semibold ${
                      selectedAmount === amount
                        ? "text-white"
                        : "text-text-subtle"
                    }`}
                  >
                    {amount}
                  </Text>
                  <View className="ml-1">
                    <TokenIcon size={16} />
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* UP/DOWN Buttons */}
        <View className="flex-row gap-3">
          <Pressable
            onPress={() => onPlaceBet("down", selectedAmount)}
            disabled={!canBet}
            className={`flex-1 py-4 bg-danger rounded-xl items-center justify-center flex-row ${
              !canBet ? "opacity-50" : ""
            }`}
          >
            <Ionicons name="trending-down" size={20} color="#fff" />
            <Text className="text-white font-semibold text-lg ml-2">DOWN</Text>
          </Pressable>
          <Pressable
            onPress={() => onPlaceBet("up", selectedAmount)}
            disabled={!canBet}
            className={`flex-1 py-4 bg-success rounded-xl items-center justify-center flex-row ${
              !canBet ? "opacity-50" : ""
            }`}
          >
            <Ionicons name="trending-up" size={20} color="#fff" />
            <Text className="text-white font-semibold text-lg ml-2">UP</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
