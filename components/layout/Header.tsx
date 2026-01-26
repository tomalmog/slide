import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

interface Props {
  isPanelOpen: boolean;
  activeBetsCount: number;
  onTogglePanel: () => void;
}

export function Header({ isPanelOpen, activeBetsCount, onTogglePanel }: Props) {
  const router = useRouter();

  return (
    <View className="border-b border-border px-4 py-4 flex-row items-center justify-between">
      <View className="flex-row items-center gap-3">
        <View className="w-8 h-8 bg-primary rounded-lg items-center justify-center">
          <Ionicons name="trending-up" size={20} color="#fff" />
        </View>
        <Text className="text-xl font-semibold text-text">Slide</Text>
      </View>

      <View className="flex-row items-center gap-4">
        <Pressable
          onPress={() => router.push("/settings")}
          className="bg-surface-hover border border-border rounded-lg p-2"
        >
          <Ionicons name="settings-outline" size={20} color="#FAFAFA" />
        </Pressable>

        <Pressable
          onPress={onTogglePanel}
          className="relative bg-surface-hover border border-border rounded-lg p-2"
        >
          <Ionicons
            name={isPanelOpen ? "close" : "menu"}
            size={20}
            color="#FAFAFA"
          />
          {activeBetsCount > 0 && !isPanelOpen && (
            <View className="absolute -top-1 -right-1 bg-primary rounded-full min-w-[18px] h-[18px] items-center justify-center">
              <Text className="text-white text-xs font-semibold">
                {activeBetsCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}
