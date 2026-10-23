import { useTranslation } from "react-i18next";
import { ActivityIndicator, PlatformColor, StyleSheet, Text } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Type } from "@/theme";

// Clears the tab bar, which floats above the bottom safe area.
const ABOVE_TAB_BAR = 64;

/** At the bottom: the large title collapses on scroll, so the top has no
 * stable edge to sit against. */
export function UpdatingPill({ visible }: { visible: boolean }) {
  const { bottom } = useSafeAreaInsets();
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      pointerEvents="none"
      accessibilityRole="progressbar"
      accessibilityLabel={t("backlog.updating")}
      accessibilityLiveRegion="polite"
      style={[styles.pill, { bottom: bottom + ABOVE_TAB_BAR }]}
    >
      <ActivityIndicator size="small" />
      <Text style={styles.label}>{t("backlog.updating")}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: PlatformColor("secondarySystemBackground"),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor("separator"),
  },
  label: { ...Type.footnote, color: PlatformColor("secondaryLabel") },
});
