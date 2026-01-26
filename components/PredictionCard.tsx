import { useState, useCallback } from "react";
import { View } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Asset, PriceData, BetAmount } from "../types";
import { BalanceDisplay, AssetDisplay, BetControls } from "./prediction";

const SWIPE_THRESHOLD = 50;

interface Props {
  asset: Asset;
  nextAsset?: Asset;
  priceData: PriceData | null;
  nextPriceData?: PriceData | null;
  balance: number;
  onPlaceBet: (direction: "up" | "down", amount: BetAmount) => void;
  onSwipe: () => void;
  isLoading?: boolean;
  floatingIndicators?: React.ReactNode;
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

  const handleSwipe = useCallback(() => {
    onSwipe();
  }, [onSwipe]);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY < 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY < -SWIPE_THRESHOLD) {
        translateY.value = withTiming(-300, { duration: 200 }, () => {
          runOnJS(handleSwipe)();
          translateY.value = 0;
        });
      } else {
        translateY.value = withTiming(0, { duration: 150 });
      }
    });

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

  const handlePlaceBet = (direction: "up" | "down") => {
    onPlaceBet(direction, selectedAmount);
  };

  return (
    <View className="flex-1">
      <BalanceDisplay balance={balance} />

      <GestureDetector gesture={panGesture}>
        <View className="flex-1 overflow-hidden relative">
          <AssetDisplay
            asset={asset}
            priceData={priceData}
            style={currentAssetStyle}
          />
          {nextAsset && (
            <AssetDisplay
              asset={nextAsset}
              priceData={nextPriceData ?? null}
              style={nextAssetStyle}
            />
          )}
          {floatingIndicators}
        </View>
      </GestureDetector>

      <BetControls
        balance={balance}
        selectedAmount={selectedAmount}
        onSelectAmount={setSelectedAmount}
        onPlaceBet={handlePlaceBet}
        isLoading={isLoading}
      />
    </View>
  );
}
