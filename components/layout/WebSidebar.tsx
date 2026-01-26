import Animated, {
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { ActiveBets } from "../ActiveBets";
import { Bet } from "../../types";

interface Props {
  bets: Bet[];
  onBetResolved: (betId: string, won: boolean, profit: number) => void;
  width: number;
  translateX: SharedValue<number>;
}

export function WebSidebar({ bets, onBetResolved, width, translateX }: Props) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View
      style={[{ width }, animatedStyle]}
      className="absolute top-0 right-0 bottom-0 border-l border-border"
    >
      <ActiveBets bets={bets} onBetResolved={onBetResolved} variant="sidebar" />
    </Animated.View>
  );
}
