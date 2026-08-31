import { Stack } from "expo-router";
import { PlatformColor } from "react-native";

export default function SharedLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Transparent, so the sheet floats over the tabs the user came from. */}
      <Stack.Screen name="index" options={{ contentStyle: { backgroundColor: "transparent" } }} />
      {/* Redundant but explicit: `NativeStackView` already paints every
          non-`transparentModal` screen with the theme background, so this only
          states the intent that the detail screen is opaque while its sibling
          above is not. */}
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
