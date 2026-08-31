import { Stack } from "expo-router";
import { PlatformColor } from "react-native";

export default function SharedLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Redundant but explicit: `NativeStackView` already paints every
          non-`transparentModal` screen with the theme background, so this only
          states that the detail screen pushed from here is a normal opaque
          screen. `index` needs no entry — it takes the group's defaults. */}
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
