import { View, Text, ScrollView } from "react-native";
import { Bet } from "../types";
import { BetItem } from "./bets";

interface Props {
  bets: Bet[];
  onBetResolved: (betId: string, won: boolean, profit: number) => void;
  variant?: "bottom" | "sidebar";
}

export function ActiveBets({ bets, onBetResolved, variant = "bottom" }: Props) {
  const isSidebar = variant === "sidebar";

  return (
    <View
      className={`bg-surface overflow-hidden flex-1 ${
        isSidebar
          ? "rounded-none border border-border"
          : "border-x border-border"
      }`}
    >
      {isSidebar && (
        <View className="px-5 py-4 border-b border-border flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-text-subtle uppercase tracking-wide">
            Active Bets
          </Text>
          {bets.length > 0 && (
            <View className="bg-primary px-2 py-0.5 rounded-full">
              <Text className="text-white text-xs font-semibold">
                {bets.length}
              </Text>
            </View>
          )}
        </View>
      )}

      <ScrollView
        className={`flex-1 ${isSidebar ? "p-4" : "p-3"}`}
        contentContainerStyle={{ gap: isSidebar ? 12 : 8 }}
        showsVerticalScrollIndicator={false}
      >
        {bets.length === 0 ? (
          <View className="flex-1 items-center justify-center py-8">
            <Text className="text-text-subtle text-sm">No active bets</Text>
            <Text className="text-text-subtle text-xs mt-1">
              Place a bet to get started
            </Text>
          </View>
        ) : (
          bets.map((bet) => (
            <BetItem
              key={bet.id}
              bet={bet}
              onResolved={(won, profit) => onBetResolved(bet.id, won, profit)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}
