import { SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { PlatformColor, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { Cover } from "@/components/cover";
import { statusSymbol } from "@/features/game/format";

import type { OnboardingCover } from "./covers";

const PADDING = 12;
const GAP = 8;
const SHELF = 4;
/** The header row's height, so the small widget's cover can take the rest. */
const HEADER = 14;

/**
 * A picture of the Home Screen widget, not the widget itself: a new user's
 * backlog is empty, so the real one would show nothing. Mirrors
 * `widgets/backlog-widget.tsx` closely enough to be recognised — a small widget
 * with one game, a medium one with a four-game shelf — without its runtime.
 */
export function WidgetMock({ covers }: { covers: readonly OnboardingCover[] }) {
  const { t, i18n } = useTranslation();
  const window = useWindowDimensions();
  const medium = Math.min(window.width - 64, 340);
  const small = Math.round(medium * 0.47);
  const column = (medium - PADDING * 2 - GAP * (SHELF - 1)) / SHELF;
  const shelf = covers.slice(0, SHELF);
  const first = covers[0];
  // As on the real small widget: the cover fills the height under the header,
  // and the title takes what is left beside it.
  const smallCoverHeight = small - PADDING * 2 - HEADER - GAP;
  const smallCoverWidth = Math.round(Math.min((smallCoverHeight * 3) / 4, small * 0.5));

  const header = (count?: number) => (
    <View style={styles.header}>
      <SymbolView
        name={statusSymbol("playing")}
        size={11}
        weight="bold"
        tintColor={PlatformColor("secondaryLabel")}
      />
      <Text style={[styles.headerText, styles.headerTitle]}>
        {t("status.playing").toLocaleUpperCase(i18n.language)}
      </Text>
      {count === undefined ? null : <Text style={styles.headerText}>{count}</Text>}
    </View>
  );

  return (
    <View
      style={styles.stack}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {first === undefined ? null : (
        <View style={[styles.widget, { width: small, height: small }]}>
          {header()}
          <View style={styles.smallRow}>
            <Cover imageId={first.coverImageId} size="big" width={smallCoverWidth} />
            <Text style={styles.smallName} numberOfLines={4}>
              {first.name}
            </Text>
          </View>
        </View>
      )}
      <View style={[styles.widget, { width: medium }]}>
        {header(shelf.length)}
        <View style={styles.shelf}>
          {shelf.map((cover) => (
            <View key={cover.coverImageId} style={{ width: column }}>
              <Cover imageId={cover.coverImageId} size="big" width={column} />
              <Text style={styles.name} numberOfLines={1}>
                {cover.name}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12, alignItems: "center" },
  widget: {
    padding: PADDING,
    gap: 8,
    borderRadius: 20,
    borderCurve: "continuous",
    backgroundColor: PlatformColor("secondarySystemBackground"),
  },
  header: { flexDirection: "row", alignItems: "center", gap: 4, height: HEADER },
  headerTitle: { flex: 1 },
  headerText: {
    fontSize: 11,
    fontWeight: "700",
    color: PlatformColor("secondaryLabel"),
    fontVariant: ["tabular-nums"],
  },
  smallRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  smallName: { flex: 1, fontSize: 15, fontWeight: "600", color: PlatformColor("label") },
  shelf: { flexDirection: "row", gap: GAP },
  name: { fontSize: 11, fontWeight: "600", color: PlatformColor("label"), marginTop: 4 },
});
