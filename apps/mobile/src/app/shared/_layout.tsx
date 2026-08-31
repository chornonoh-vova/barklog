import { Stack } from "expo-router";

/**
 * A passthrough, but not a removable one: this layout is what makes `shared` a
 * single route in the root stack, so the modal contains its own push to
 * `game/[id]` instead of that detail screen becoming a second root route.
 */
export default function SharedLayout() {
  return <Stack screenOptions={{ headerShown: true }} />;
}
