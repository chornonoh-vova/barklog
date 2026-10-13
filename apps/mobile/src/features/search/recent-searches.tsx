import { SymbolView } from "expo-symbols";
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen, Type } from "@/theme";
import { useSideInsets } from "@/ui/use-side-insets";

/** The Search tab before anything is typed: the last few queries, newest first. */
export function RecentSearches({
  recents,
  onPick,
  onClear,
}: {
  recents: readonly string[];
  onPick: (query: string) => void;
  onClear: () => void;
}) {
  const sideInsets = useSideInsets();

  return (
    <ScrollView
      style={styles.list}
      contentContainerStyle={sideInsets}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Recent
        </Text>
        <Pressable
          style={styles.clear}
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Clear recent searches"
        >
          <Text style={styles.clearLabel}>Clear</Text>
        </Pressable>
      </View>

      {recents.map((query) => (
        <Pressable
          key={query}
          onPress={() => onPick(query)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Search for ${query}`}
        >
          <SymbolView
            name="clock.arrow.circlepath"
            size={17}
            tintColor={PlatformColor("secondaryLabel")}
          />
          <Text style={styles.query} numberOfLines={1}>
            {query}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: Screen.fill,
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 16,
    paddingRight: 8,
    paddingTop: 8,
  },
  title: { ...Type.headline, color: PlatformColor("label") },
  clear: { minHeight: 44, paddingHorizontal: 8, justifyContent: "center" },
  clearLabel: { ...Type.body, color: PlatformColor("link") },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PlatformColor("separator"),
  },
  pressed: { backgroundColor: PlatformColor("secondarySystemGroupedBackground") },
  query: { ...Type.body, flex: 1, color: PlatformColor("label") },
});
