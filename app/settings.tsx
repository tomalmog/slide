import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

export default function SettingsScreen() {
  const router = useRouter();
  const isWeb = Platform.OS === "web";

  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Login/Register state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // User profile state
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");

  // Payment card state
  const [cardNumber, setCardNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [hasCard, setHasCard] = useState(false);

  const handleLogin = () => {
    // TODO: Implement actual authentication
    console.log("Login:", { email, password });
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setEmail("");
    setPassword("");
    setName("");
    setUsername("");
  };

  const handleSaveProfile = () => {
    // TODO: Implement profile save
    console.log("Save profile:", { name, username });
  };

  const handleSaveCard = () => {
    // TODO: Implement card save (should use secure payment gateway)
    console.log("Save card:", { cardNumber, expiryDate, cvv, cardholderName });
    setHasCard(true);
  };

  const formatCardNumber = (text: string) => {
    const cleaned = text.replace(/\s/g, "");
    const chunks = cleaned.match(/.{1,4}/g) || [];
    return chunks.join(" ");
  };

  const formatExpiryDate = (text: string) => {
    const cleaned = text.replace(/\D/g, "");
    if (cleaned.length >= 2) {
      return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`;
    }
    return cleaned;
  };

  const settingsContent = (
    <>
      {/* Header */}
      <View className="border-b border-border px-4 py-4 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.replace("/")}
            className="w-8 h-8 items-center justify-center"
          >
            <Ionicons name="arrow-back" size={24} color="#FAFAFA" />
          </Pressable>
          <Text className="text-xl font-semibold text-text">Settings</Text>
        </View>
      </View>

      <ScrollView className="flex-1">
        <View className="p-4 gap-6">
          {/* Account Section */}
          <View className="bg-surface-hover border border-border rounded-2xl p-6 gap-4">
            <View className="flex-row items-center gap-2 mb-2">
              <Ionicons name="person-circle" size={24} color="#3B82F6" />
              <Text className="text-lg font-semibold text-text">Account</Text>
            </View>

            {!isLoggedIn ? (
              // Login Form
              <View className="gap-4">
                <View>
                  <Text className="text-text-subtle mb-2">Email</Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Enter your email"
                    placeholderTextColor="#71717A"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    className="bg-background border border-border rounded-lg px-4 py-3 text-text"
                  />
                </View>

                <View>
                  <Text className="text-text-subtle mb-2">Password</Text>
                  <View className="relative">
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Enter your password"
                      placeholderTextColor="#71717A"
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      className="bg-background border border-border rounded-lg px-4 py-3 pr-12 text-text"
                    />
                    <Pressable
                      onPress={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3"
                    >
                      <Ionicons
                        name={showPassword ? "eye-off" : "eye"}
                        size={20}
                        color="#71717A"
                      />
                    </Pressable>
                  </View>
                </View>

                <Pressable
                  onPress={handleLogin}
                  className="bg-primary rounded-lg py-3 items-center"
                >
                  <Text className="text-white font-semibold text-base">
                    Login
                  </Text>
                </Pressable>

                <Text className="text-text-subtle text-center text-sm">
                  Don&apos;t have an account?{" "}
                  <Text className="text-primary">Sign up</Text>
                </Text>
              </View>
            ) : (
              // Profile Management
              <View className="gap-4">
                <View className="bg-success/10 border border-success/20 rounded-lg p-3 flex-row items-center gap-2">
                  <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                  <Text className="text-success text-sm">
                    Logged in as {email}
                  </Text>
                </View>

                <View>
                  <Text className="text-text-subtle mb-2">Display Name</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Your name"
                    placeholderTextColor="#71717A"
                    className="bg-background border border-border rounded-lg px-4 py-3 text-text"
                  />
                </View>

                <View>
                  <Text className="text-text-subtle mb-2">Username</Text>
                  <TextInput
                    value={username}
                    onChangeText={setUsername}
                    placeholder="@username"
                    placeholderTextColor="#71717A"
                    autoCapitalize="none"
                    className="bg-background border border-border rounded-lg px-4 py-3 text-text"
                  />
                </View>

                <Pressable
                  onPress={handleSaveProfile}
                  className="bg-primary rounded-lg py-3 items-center"
                >
                  <Text className="text-white font-semibold text-base">
                    Save Profile
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleLogout}
                  className="bg-danger/10 border border-danger rounded-lg py-3 items-center"
                >
                  <Text className="text-danger font-semibold text-base">
                    Logout
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Payment Method Section */}
          {isLoggedIn && (
            <View className="bg-surface-hover border border-border rounded-2xl p-6 gap-4">
              <View className="flex-row items-center gap-2 mb-2">
                <Ionicons name="card" size={24} color="#3B82F6" />
                <Text className="text-lg font-semibold text-text">
                  Payment Method
                </Text>
              </View>

              {hasCard ? (
                <View className="gap-4">
                  <View className="bg-primary rounded-xl p-4 gap-3">
                    <Ionicons name="card" size={32} color="white" />
                    <View>
                      <Text className="text-white font-mono text-lg">
                        •••• •••• •••• {cardNumber.slice(-4)}
                      </Text>
                      <View className="flex-row justify-between mt-2">
                        <Text className="text-white/80 text-sm">
                          {cardholderName || "Cardholder Name"}
                        </Text>
                        <Text className="text-white/80 text-sm">
                          {expiryDate}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Pressable
                    onPress={() => setHasCard(false)}
                    className="bg-danger/10 border border-danger rounded-lg py-3 items-center"
                  >
                    <Text className="text-danger font-semibold text-base">
                      Remove Card
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View className="gap-4">
                  <View>
                    <Text className="text-text-subtle mb-2">Card Number</Text>
                    <TextInput
                      value={cardNumber}
                      onChangeText={(text) => {
                        const cleaned = text.replace(/\s/g, "");
                        if (cleaned.length <= 16) {
                          setCardNumber(formatCardNumber(cleaned));
                        }
                      }}
                      placeholder="1234 5678 9012 3456"
                      placeholderTextColor="#71717A"
                      keyboardType="number-pad"
                      maxLength={19}
                      className="bg-background border border-border rounded-lg px-4 py-3 text-text font-mono"
                    />
                  </View>

                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Text className="text-text-subtle mb-2">Expiry Date</Text>
                      <TextInput
                        value={expiryDate}
                        onChangeText={(text) => {
                          const cleaned = text.replace(/\D/g, "");
                          if (cleaned.length <= 4) {
                            setExpiryDate(formatExpiryDate(cleaned));
                          }
                        }}
                        placeholder="MM/YY"
                        placeholderTextColor="#71717A"
                        keyboardType="number-pad"
                        maxLength={5}
                        className="bg-background border border-border rounded-lg px-4 py-3 text-text font-mono"
                      />
                    </View>

                    <View className="flex-1">
                      <Text className="text-text-subtle mb-2">CVV</Text>
                      <TextInput
                        value={cvv}
                        onChangeText={(text) => {
                          if (text.length <= 3) setCvv(text);
                        }}
                        placeholder="123"
                        placeholderTextColor="#71717A"
                        keyboardType="number-pad"
                        maxLength={3}
                        secureTextEntry
                        className="bg-background border border-border rounded-lg px-4 py-3 text-text font-mono"
                      />
                    </View>
                  </View>

                  <View>
                    <Text className="text-text-subtle mb-2">
                      Cardholder Name
                    </Text>
                    <TextInput
                      value={cardholderName}
                      onChangeText={setCardholderName}
                      placeholder="John Doe"
                      placeholderTextColor="#71717A"
                      autoCapitalize="words"
                      className="bg-background border border-border rounded-lg px-4 py-3 text-text"
                    />
                  </View>

                  <View className="bg-warning/10 border border-warning/20 rounded-lg p-3 flex-row gap-2">
                    <Ionicons name="lock-closed" size={16} color="#F59E0B" />
                    <Text className="text-warning text-xs flex-1">
                      Your payment information is encrypted and secure
                    </Text>
                  </View>

                  <Pressable
                    onPress={handleSaveCard}
                    className="bg-primary rounded-lg py-3 items-center"
                  >
                    <Text className="text-white font-semibold text-base">
                      Save Card
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* App Settings */}
          <View className="bg-surface-hover border border-border rounded-2xl p-6 gap-4">
            <View className="flex-row items-center gap-2 mb-2">
              <Ionicons name="settings" size={24} color="#3B82F6" />
              <Text className="text-lg font-semibold text-text">
                App Settings
              </Text>
            </View>

            <Pressable className="flex-row items-center justify-between py-2">
              <View className="flex-row items-center gap-3">
                <Ionicons name="notifications" size={20} color="#71717A" />
                <Text className="text-text">Notifications</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#71717A" />
            </Pressable>

            <View className="h-px bg-border" />

            <Pressable className="flex-row items-center justify-between py-2">
              <View className="flex-row items-center gap-3">
                <Ionicons name="moon" size={20} color="#71717A" />
                <Text className="text-text">Dark Mode</Text>
              </View>
              <View className="bg-primary rounded-full w-12 h-6 justify-center items-end px-1">
                <View className="w-4 h-4 bg-white rounded-full" />
              </View>
            </Pressable>

            <View className="h-px bg-border" />

            <Pressable className="flex-row items-center justify-between py-2">
              <View className="flex-row items-center gap-3">
                <Ionicons name="help-circle" size={20} color="#71717A" />
                <Text className="text-text">Help & Support</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#71717A" />
            </Pressable>

            <View className="h-px bg-border" />

            <Pressable className="flex-row items-center justify-between py-2">
              <View className="flex-row items-center gap-3">
                <Ionicons name="document-text" size={20} color="#71717A" />
                <Text className="text-text">Terms & Privacy</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#71717A" />
            </Pressable>
          </View>

          {/* Version Info */}
          <View className="items-center py-4">
            <Text className="text-text-subtle text-sm">Slide v1.0.0</Text>
          </View>
        </View>
      </ScrollView>
    </>
  );

  // Web layout with inline styles for reliable rendering
  if (isWeb) {
    return (
      <View style={styles.webContainer} className="bg-background">
        <View
          style={styles.webCard}
          className="bg-surface border border-border rounded-2xl overflow-hidden"
        >
          {settingsContent}
        </View>
      </View>
    );
  }

  // Mobile layout
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {settingsContent}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  webCard: {
    width: "100%",
    maxWidth: 576,
    maxHeight: "90%",
  },
});
