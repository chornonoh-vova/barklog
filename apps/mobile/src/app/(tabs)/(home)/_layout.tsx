import { Stack } from "expo-router";

/** A widget can open `game/[id]` straight from a cold start; this puts Home
 * underneath it, so Back has somewhere to go. */
export const unstable_settings = { anchor: "index" };

export default function HomeLayout() {
  return <Stack />;
}
