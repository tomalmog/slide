import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  useWindowDimensions,
} from "react-native";
import { playSound } from "../utils/sounds";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { PredictionCard } from "../components/PredictionCard";
import { ActiveBets, Bet } from "../components/ActiveBets";
import { FloatingBetIndicators } from "../components/FloatingBetIndicators";

// Mock data for demonstration
const MOCK_ASSETS = [
  { id: "1", name: "Bitcoin", symbol: "BTCUSDT", icon: "₿" },
  { id: "2", name: "Ethereum", symbol: "ETHUSDT", icon: "Ξ" },
  { id: "3", name: "Solana", symbol: "SOLUSDT", icon: "◎" },
  { id: "4", name: "Cardano", symbol: "ADAUSDT", icon: "₳" },
  { id: "5", name: "Polkadot", symbol: "DOTUSDT", icon: "●" },
];

const MOCK_PRICE_DATA = {
  BTCUSDT: { price: 42350.25, change_24h: 2.45 },
  ETHUSDT: { price: 2245.8, change_24h: -1.23 },
  SOLUSDT: { price: 98.45, change_24h: 5.67 },
  ADAUSDT: { price: 0.52, change_24h: -0.8 },
  DOTUSDT: { price: 7.2, change_24h: 3.2 },
};

const SIDEBAR_WIDTH = 380;
const COLLAPSED_HANDLE_HEIGHT = 72; // Height of the handle when collapsed - tall enough to grab easily
const MIN_PANEL_HEIGHT = 200; // Minimum expanded height
const MAX_PANEL_RATIO = 0.7; // 70% max - overlay can cover most of the card

export default function HomeScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isWideScreen = width >= 768;
  const useSidebar = isWeb && isWideScreen;

  const [balance, setBalance] = useState(10000);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeBets, setActiveBets] = useState<Bet[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Calculate available height (screen minus header ~60px and safe areas)
  const availableHeight = height - 120;
  const maxPanelHeight = availableHeight * MAX_PANEL_RATIO;

  // Animation values for mobile (bottom panel overlay)
  // translateY: 0 = fully expanded, positive = moving down (collapsed)
  const panelTranslateY = useSharedValue(
    maxPanelHeight - COLLAPSED_HANDLE_HEIGHT,
  );

  // Animation values for web (sidebar)
  const sidebarTranslateX = useSharedValue(SIDEBAR_WIDTH);

  // For dragging
  const dragStartY = useSharedValue(0);

  const currentAsset = MOCK_ASSETS[currentIndex];
  const nextIndex = (currentIndex + 1) % MOCK_ASSETS.length;
  const nextAsset = MOCK_ASSETS[nextIndex];
  const currentPriceData =
    MOCK_PRICE_DATA[currentAsset.symbol as keyof typeof MOCK_PRICE_DATA];
  const nextPriceData =
    MOCK_PRICE_DATA[nextAsset.symbol as keyof typeof MOCK_PRICE_DATA];

  const collapsedY = maxPanelHeight - COLLAPSED_HANDLE_HEIGHT;
  const expandedY = maxPanelHeight - MIN_PANEL_HEIGHT;

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

  const updatePanelOpen = (open: boolean) => {
    setIsPanelOpen(open);
  };

  // Gesture for dragging the overlay panel
  const dragGesture = Gesture.Pan()
    .onStart(() => {
      dragStartY.value = panelTranslateY.value;
    })
    .onUpdate((event) => {
      // Clamp between fully expanded (0) and collapsed
      const newY = dragStartY.value + event.translationY;
      panelTranslateY.value = Math.max(0, Math.min(newY, collapsedY));
    })
    .onEnd(() => {
      // Just stay where the user left it - update state based on position
      const isOpen = panelTranslateY.value < collapsedY - 10;
      runOnJS(updatePanelOpen)(isOpen);
    });

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
      duration: 10000, // 10 seconds
    };

    setBalance((prev) => prev - amount);
    setActiveBets((prev) => [...prev, newBet]);
    setCurrentIndex((prev) => (prev + 1) % MOCK_ASSETS.length);

    console.log(
      `Placed ${direction} bet of ${amount} T on ${currentAsset.name}`,
    );
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

  // Animated styles for mobile bottom panel overlay
  const animatedPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelTranslateY.value }],
  }));

  // Animated styles for web sidebar
  const animatedSidebarStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sidebarTranslateX.value }],
  }));

  // Card area no longer needs to adjust - overlay covers it instead
  const animatedCardAreaStyle = useAnimatedStyle(() => {
    return {};
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header */}
      <View className="border-b border-border px-4 py-4 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <View className="w-8 h-8 bg-primary rounded-lg items-center justify-center">
            <Ionicons name="trending-up" size={20} color="#fff" />
          </View>
          <Text className="text-xl font-semibold text-text">Slide</Text>
        </View>

        <View className="flex-row items-center gap-4">
          {/* Settings Button */}
          <Pressable
            onPress={() => router.push("/settings")}
            className="bg-surface-hover border border-border rounded-lg p-2"
          >
            <Ionicons name="settings-outline" size={20} color="#FAFAFA" />
          </Pressable>

          {/* Menu Toggle Button */}
          <Pressable
            onPress={togglePanel}
            className="relative bg-surface-hover border border-border rounded-lg p-2"
          >
            <Ionicons
              name={isPanelOpen ? "close" : "menu"}
              size={20}
              color="#FAFAFA"
            />
            {activeBets.length > 0 && !isPanelOpen && (
              <View className="absolute -top-1 -right-1 bg-primary rounded-full min-w-[18px] h-[18px] items-center justify-center">
                <Text className="text-white text-xs font-semibold">
                  {activeBets.length}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* Main Content Area */}
      <View className="flex-1 flex-row">
        {/* Prediction Card */}
        <Animated.View
          style={[{ flex: 1 }, !useSidebar && animatedCardAreaStyle]}
          className="p-4"
        >
          {useSidebar ? (
            // Web layout: centered card with proper sizing
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
            // Mobile layout: full flex with bottom padding for the active bets handle
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

        {/* Web Sidebar - positioned on the right */}
        {useSidebar && (
          <Animated.View
            style={[{ width: SIDEBAR_WIDTH }, animatedSidebarStyle]}
            className="absolute top-0 right-0 bottom-0 border-l border-border"
          >
            <ActiveBets
              bets={activeBets}
              onBetResolved={handleBetResolved}
              variant="sidebar"
            />
          </Animated.View>
        )}
      </View>

      {/* Mobile Bottom Panel Overlay */}
      {!useSidebar && (
        <Animated.View
          style={[{ height: maxPanelHeight }, animatedPanelStyle]}
          className="absolute bottom-0 left-0 right-0 px-4"
        >
          {/* Draggable Handle - taller area to avoid system gesture conflict */}
          <GestureDetector gesture={dragGesture}>
            <View className="h-[72px] justify-center bg-surface border-t border-x border-border rounded-t-2xl px-4">
              <View className="items-center mb-2">
                <View className="w-12 h-1.5 bg-border rounded-full" />
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-medium text-text">
                  Active Bets
                </Text>
                {activeBets.length > 0 && (
                  <View className="bg-primary px-2.5 py-1 rounded-full">
                    <Text className="text-white text-xs font-semibold">
                      {activeBets.length}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </GestureDetector>

          <ActiveBets
            bets={activeBets}
            onBetResolved={handleBetResolved}
            variant="bottom"
          />
        </Animated.View>
      )}
    </SafeAreaView>
  );
}
