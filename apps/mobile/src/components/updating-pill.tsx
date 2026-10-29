import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  AccessibilityInfo,
  ActivityIndicator,
  PlatformColor,
  StyleSheet,
  Text,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Type } from "@/ui/theme";

// A native tabs screen's bottom inset already holds the tab bar while the bar
// runs along the bottom, and only the home indicator once iPhone Duo or iPad
// moves it into the rail or sidebar; a fixed bar height on top would float
// the pill too high in both.
const GAP = 16;

/** At the bottom: the large title collapses on scroll, so the top has no
 * stable edge to sit against. */
export function UpdatingPill({ visible }: { visible: boolean }) {
  const { bottom } = useSafeAreaInsets();
  const { t } = useTranslation();
  const label = t("backlog.updating");

  // iOS has no live regions, so VoiceOver hears the pill only when told. Once
  // per appearance: re-announcing on every render would talk over the user.
  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(label);
  }, [visible, label]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      pointerEvents="none"
      // One element, read as "Updating…, progress", not a spinner and a
      // label VoiceOver visits separately.
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={[styles.pill, { bottom: bottom + GAP }]}
    >
      <ActivityIndicator size="small" />
      <Text style={styles.label}>{label}</Text>
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
