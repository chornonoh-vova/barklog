import { FREE_ACTIVE_SLOTS } from "@repo/contracts";
import { PlatformColor, StyleSheet, View } from "react-native";

import { Brand } from "@/ui/theme";

/** How many segments the picture fills: an example, not the user's count. */
const FILLED = 4;
const WIDTH = 200;

/** A picture of the free-tier cap: one segment per slot, a few in use. */
export function SlotMeter() {
  return (
    <View
      testID="slot-meter"
      style={styles.meter}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {Array.from({ length: FREE_ACTIVE_SLOTS }, (_, index) => {
        const filled = index < FILLED;

        return (
          <View
            key={index}
            testID={filled ? "slot-filled" : "slot-empty"}
            style={[styles.segment, filled ? styles.filled : styles.empty]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  meter: { flexDirection: "row", gap: 4, width: WIDTH, paddingTop: 6 },
  segment: { flex: 1, height: 6, borderRadius: 3 },
  filled: { backgroundColor: Brand.tint },
  empty: { backgroundColor: PlatformColor("tertiarySystemFill") },
});
