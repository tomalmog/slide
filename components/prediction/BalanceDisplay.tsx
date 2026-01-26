import { useEffect, useRef } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
} from "react-native-reanimated";
import { TokenIcon } from "../ui/TokenIcon";

interface Props {
  balance: number;
}

export function BalanceDisplay({ balance }: Props) {
  const balanceScale = useSharedValue(1);
  const balanceColor = useSharedValue(0);
  const prevBalance = useRef(balance);

  useEffect(() => {
    if (balance !== prevBalance.current) {
      const increased = balance > prevBalance.current;
      balanceColor.value = increased ? 1 : -1;
      balanceScale.value = withSequence(
        withSpring(1.15, { damping: 10, stiffness: 400 }),
        withSpring(1, { damping: 15, stiffness: 300 })
      );
      setTimeout(() => {
        balanceColor.value = withTiming(0, { duration: 500 });
      }, 1000);
      prevBalance.current = balance;
    }
  }, [balance]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: balanceScale.value }],
  }));

  return (
    <View className="p-4 border-b border-border">
      <Text className="text-xs text-text-subtle text-center mb-2 tracking-wide uppercase">
        Your Balance
      </Text>
      <Animated.View style={animatedStyle} className="items-center">
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
  );
}
