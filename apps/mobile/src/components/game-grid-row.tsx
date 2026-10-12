import { Children, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { COLUMN_GAP, GUTTER } from "@/ui/columns";

/**
 * One row of a card grid. A short last row keeps empty slots, so a lone card
 * keeps the width it has in a full row instead of stretching across the
 * window. The slots are plain views: VoiceOver skips them.
 */
export function GameGridRow({ columns, children }: { columns: number; children: ReactNode }) {
  const empty = Math.max(0, columns - Children.count(children));

  return (
    <View style={styles.row}>
      {Children.map(children, (child) => (
        <View style={styles.slot}>{child}</View>
      ))}
      {Array.from({ length: empty }, (_, index) => (
        <View key={`empty-${index}`} style={styles.slot} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: COLUMN_GAP,
    paddingHorizontal: GUTTER,
    paddingBottom: COLUMN_GAP,
  },
  slot: { flex: 1 },
});
