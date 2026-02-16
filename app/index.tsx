import { useState } from "react";
import { View, Platform, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { playSound } from "../utils/sounds";
import { Bet } from "../types";
import { MOCK_ASSETS, MOCK_PRICE_DATA } from "../data/mock";
import {
  SIDEBAR_WIDTH,
  COLLAPSED_HANDLE_HEIGHT,
  MIN_PANEL_HEIGHT,
  MAX_PANEL_RATIO,
} from "../constants/layout";
import { Header, MobileBottomPanel, WebSidebar } from "../components/layout";
import { PredictionCard } from "../components/PredictionCard";
import { FloatingBetIndicators } from "../components/FloatingBetIndicators";

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isWideScreen = width >= 768;
  const useSidebar = isWeb && isWideScreen;

  const [balance, setBalance] = useState(10000);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeBets, setActiveBets] = useState<Bet[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const availableHeight = height - 120;
  const maxPanelHeight = availableHeight * MAX_PANEL_RATIO;
  const collapsedY = maxPanelHeight - COLLAPSED_HANDLE_HEIGHT;
  const expandedY = maxPanelHeight - MIN_PANEL_HEIGHT;

  const panelTranslateY = useSharedValue(collapsedY);
  const sidebarTranslateX = useSharedValue(SIDEBAR_WIDTH);

  const currentAsset = MOCK_ASSETS[currentIndex];
  const nextIndex = (currentIndex + 1) % MOCK_ASSETS.length;
  const nextAsset = MOCK_ASSETS[nextIndex];
  const currentPriceData = MOCK_PRICE_DATA[currentAsset.symbol];
  const nextPriceData = MOCK_PRICE_DATA[nextAsset.symbol];

  const togglePanel = () => {
    const newState = !isPanelOpen;
    setIsPanelOpen(newState);

    if (useSidebar) {
      sidebarTranslateX.value = withSpring(newState ? 0 : SIDEBAR_WIDTH, {
        damping: 50,
        stiffness: 400,
        overshootClamping: true,
      });
    } else {
      panelTranslateY.value = newState ? expandedY : collapsedY;
    }
  };

  const handlePlaceBet = (direction: "up" | "down", amount: number) => {
    if (balance < amount) return;

    const newBet: Bet = {
      id: `${Date.now()}-${Math.random()}`,
      asset: currentAsset.name,
      symbol: currentAsset.symbol.replace("USDT", ""),
      direction,
      amount,
      entryPrice: currentPriceData.price,
      startTime: Date.now(),
      duration: 60000,
    };

    setBalance((prev) => prev - amount);
    setActiveBets((prev) => [...prev, newBet]);
    setCurrentIndex((prev) => (prev + 1) % MOCK_ASSETS.length);
  };

  const handleBetResolved = async (
    betId: string,
    won: boolean,
    profit: number,
  ) => {
    const bet = activeBets.find((b) => b.id === betId);
    if (!bet) return;

    setActiveBets((prev) => prev.filter((b) => b.id !== betId));

    if (won) {
      setBalance((prev) => prev + bet.amount + profit);
      playSound("win");
    }
  };

  const handleSwipe = () => {
    setCurrentIndex((prev) => (prev + 1) % MOCK_ASSETS.length);
  };

  const animatedCardAreaStyle = useAnimatedStyle(() => ({}));

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Header
        isPanelOpen={isPanelOpen}
        activeBetsCount={activeBets.length}
        onTogglePanel={togglePanel}
      />

      <View className="flex-1 flex-row">
        <Animated.View
          style={[{ flex: 1 }, !useSidebar && animatedCardAreaStyle]}
          className="p-4"
        >
          {useSidebar ? (
            <View className="flex-1 items-center justify-center">
              <View
                style={{
                  width: "100%",
                  maxWidth: 500,
                  aspectRatio: 0.75,
                  maxHeight: "100%",
                }}
                className="bg-surface border border-border rounded-2xl overflow-hidden"
              >
                <PredictionCard
                  asset={currentAsset}
                  nextAsset={nextAsset}
                  priceData={currentPriceData}
                  nextPriceData={nextPriceData}
                  balance={balance}
                  onPlaceBet={handlePlaceBet}
                  onSwipe={handleSwipe}
                  isLoading={false}
                />
              </View>
            </View>
          ) : (
            <View className="flex-1 pb-20">
              <View className="flex-1 bg-surface border border-border rounded-2xl overflow-hidden">
                <PredictionCard
                  asset={currentAsset}
                  nextAsset={nextAsset}
                  priceData={currentPriceData}
                  nextPriceData={nextPriceData}
                  balance={balance}
                  onPlaceBet={handlePlaceBet}
                  onSwipe={handleSwipe}
                  isLoading={false}
                  floatingIndicators={
                    activeBets.length > 0 ? (
                      <FloatingBetIndicators
                        bets={activeBets}
                        onPress={togglePanel}
                      />
                    ) : null
                  }
                />
              </View>
            </View>
          )}
        </Animated.View>

        {useSidebar && (
          <WebSidebar
            bets={activeBets}
            onBetResolved={handleBetResolved}
            width={SIDEBAR_WIDTH}
            translateX={sidebarTranslateX}
          />
        )}
      </View>

      {!useSidebar && (
        <MobileBottomPanel
          bets={activeBets}
          onBetResolved={handleBetResolved}
          maxPanelHeight={maxPanelHeight}
          panelTranslateY={panelTranslateY}
          collapsedY={collapsedY}
          onPanelOpenChange={setIsPanelOpen}
        />
      )}
    </SafeAreaView>
  );
}
