import { useRouter } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";

import { EmptyState } from "@/components/empty-state";
import { SHARED_LANDING } from "@/features/share/empty-states";
import { Screen } from "@/theme";

export default function SharedIndex() {
  const router = useRouter();

  /**
   * `dismissTo("/")`, per the v57 router docs: it dismisses screens until the
   * href is reached, which takes this `fullScreenModal` off and lands on home.
   * `dismissAll()` pops to the first screen of the *closest* stack — this
   * screen — so it would do nothing, and `back()` returns to whichever tab the
   * share interrupted rather than home.
   */
  const goHome = useCallback(() => router.dismissTo("/"), [router]);

  return (
    <View style={Screen.fill}>
      <EmptyState {...SHARED_LANDING} action={{ label: "Back to Home", onPress: goHome }} />
    </View>
  );
}
