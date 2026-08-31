import { Stack } from "expo-router";
import { PlatformColor } from "react-native";

export default function SharedLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Transparent, so the sheet floats over the tabs the user came from. */}
      <Stack.Screen name="index" options={{ contentStyle: { backgroundColor: "transparent" } }} />
      {/* Opaque, or the detail screen inherits the group's transparency. */}
      <Stack.Screen
        name="game/[id]"
        options={{
          headerShown: true,
          contentStyle: { backgroundColor: PlatformColor("systemBackground") },
        }}
      />
    </Stack>
  );
}
