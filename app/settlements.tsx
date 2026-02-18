import { View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSettledPositions } from "../contexts/SettledPositionsContext";
import { MARKET_BY_KEY, type MarketKey } from "../constants/shorts";

function formatPrice(price: number | null) {
  if (price === null) {
    return "--";
  }
  if (price >= 1000) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return price.toFixed(4);
}

function formatContractPrice(price: number) {
  return `$${price.toFixed(2)}`;
}

export default function SettlementsScreen() {
  const router = useRouter();
  const { settledPositions } = useSettledPositions();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="border-b border-border px-4 py-4 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.replace("/")}
            className="w-8 h-8 items-center justify-center"
          >
            <Ionicons name="arrow-back" size={24} color="#FAFAFA" />
          </Pressable>
          <Text className="text-xl font-semibold text-text">
            Recent Settlements
          </Text>
        </View>
        <Text className="text-text-subtle text-xs">
          Chainlink close
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 12 }}>
        {settledPositions.length === 0 ? (
          <View className="py-12 items-center">
            <Ionicons name="receipt-outline" size={48} color="#71717A" />
            <Text className="text-text-subtle text-sm mt-4">
              No settlements yet
            </Text>
            <Text className="text-text-subtle text-xs mt-1">
              Place positions and wait for rounds to resolve
            </Text>
          </View>
        ) : (
          settledPositions.map((position) => {
            const market = MARKET_BY_KEY[position.marketKey as MarketKey];
            const statusColor =
              position.status === "win"
                ? "text-success"
                : position.status === "push"
                  ? "text-warning"
                  : "text-danger";

            return (
              <View
                key={position.id}
                className="bg-surface border border-border rounded-xl p-3"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-text font-medium">
                    {market?.label ?? position.marketKey}{" "}
                    {position.direction.toUpperCase()}
                  </Text>
                  <Text
                    className={`font-semibold uppercase text-xs ${statusColor}`}
                  >
                    {position.status}
                  </Text>
                </View>

                <View className="flex-row items-center justify-between mt-2">
                  <Text className="text-text-subtle text-xs">
                    Fill {formatContractPrice(position.entryQuote)} • Open $
                    {formatPrice(position.entryPrice)} / Close $
                    {formatPrice(position.settlePrice)}
                  </Text>
                  <Text
                    className={`text-sm font-mono ${
                      position.profit > 0
                        ? "text-success"
                        : position.profit < 0
                          ? "text-danger"
                          : "text-text-subtle"
                    }`}
                  >
                    {position.profit >= 0 ? "+" : ""}
                    {position.profit.toFixed(2)} TOK
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
