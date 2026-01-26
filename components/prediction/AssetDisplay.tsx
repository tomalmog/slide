import { View, Text } from "react-native";
import Animated from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Asset, PriceData } from "../../types";

interface Props {
  asset: Asset;
  priceData: PriceData | null;
  style?: any;
}

function formatPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } else if (price >= 1) {
    return price.toFixed(2);
  } else {
    return price.toFixed(4);
  }
}

export function AssetDisplay({ asset, priceData, style }: Props) {
  const price = priceData?.price ?? 0;
  const change24h = priceData?.change_24h ?? 0;
  const isPositive = change24h >= 0;

  return (
    <Animated.View style={style} className="items-center justify-center flex-1">
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
