import { View, Text } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  SharedValue,
  useAnimatedStyle,
  runOnJS,
} from "react-native-reanimated";
import { ActiveBets } from "../ActiveBets";
import { Bet } from "../../types";

interface Props {
  bets: Bet[];
  onBetResolved: (betId: string, won: boolean, profit: number) => void;
  maxPanelHeight: number;
  panelTranslateY: SharedValue<number>;
  collapsedY: number;
  onPanelOpenChange: (open: boolean) => void;
}

export function MobileBottomPanel({
  bets,
  onBetResolved,
  maxPanelHeight,
  panelTranslateY,
  collapsedY,
  onPanelOpenChange,
}: Props) {
  const dragStartY = { value: 0 };

  const dragGesture = Gesture.Pan()
    .onStart(() => {
      dragStartY.value = panelTranslateY.value;
    })
    .onUpdate((event) => {
      const newY = dragStartY.value + event.translationY;
      panelTranslateY.value = Math.max(0, Math.min(newY, collapsedY));
    })
    .onEnd(() => {
      const isOpen = panelTranslateY.value < collapsedY - 10;
      runOnJS(onPanelOpenChange)(isOpen);
    });

  const animatedPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelTranslateY.value }],
  }));

  return (
    <Animated.View
      style={[{ height: maxPanelHeight }, animatedPanelStyle]}
      className="absolute bottom-0 left-0 right-0 px-4"
    >
      <GestureDetector gesture={dragGesture}>
        <View className="h-[72px] justify-center bg-surface border-t border-x border-border rounded-t-2xl px-4">
          <View className="items-center mb-2">
            <View className="w-12 h-1.5 bg-border rounded-full" />
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-medium text-text">Active Bets</Text>
            {bets.length > 0 && (
              <View className="bg-primary px-2.5 py-1 rounded-full">
                <Text className="text-white text-xs font-semibold">
                  {bets.length}
                </Text>
              </View>
            )}
          </View>
        </View>
      </GestureDetector>

      <ActiveBets bets={bets} onBetResolved={onBetResolved} variant="bottom" />
    </Animated.View>
  );
}
