import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TokenIcon } from "../ui/TokenIcon";
import { BetAmount } from "../../types";

const BET_AMOUNTS: BetAmount[] = [10, 25, 50, 100];

interface Props {
  balance: number;
  selectedAmount: BetAmount;
  onSelectAmount: (amount: BetAmount) => void;
  onPlaceBet: (direction: "up" | "down") => void;
  isLoading: boolean;
}

export function BetControls({
  balance,
  selectedAmount,
  onSelectAmount,
  onPlaceBet,
  isLoading,
}: Props) {
  const canBet = balance >= selectedAmount && !isLoading;

  return (
    <View className="p-4 gap-3 border-t border-border">
      <View>
        <Text className="text-xs text-text-subtle text-center mb-2 tracking-wide uppercase">
          Bet Amount
        </Text>
        <View className="flex-row gap-2">
          {BET_AMOUNTS.map((amount) => (
            <Pressable
              key={amount}
              onPress={() => onSelectAmount(amount)}
              disabled={balance < amount}
              className={`flex-1 py-3 rounded-lg items-center ${
                selectedAmount === amount ? "bg-primary" : "bg-surface-hover"
              } ${balance < amount ? "opacity-50" : ""}`}
            >
              <View className="flex-row items-center">
                <Text
                  className={`font-mono font-semibold ${
                    selectedAmount === amount ? "text-white" : "text-text-subtle"
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

      <View className="flex-row gap-3">
        <Pressable
          onPress={() => onPlaceBet("down")}
          disabled={!canBet}
          className={`flex-1 py-4 bg-danger rounded-xl items-center justify-center flex-row ${
            !canBet ? "opacity-50" : ""
          }`}
        >
          <Ionicons name="trending-down" size={20} color="#fff" />
          <Text className="text-white font-semibold text-lg ml-2">DOWN</Text>
        </Pressable>
        <Pressable
          onPress={() => onPlaceBet("up")}
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
  );
}
