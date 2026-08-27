import { SymbolView } from "expo-symbols";
import { memo } from "react";
import { Pressable, PlatformColor, StyleSheet, Text, View } from "react-native";

import { Cover } from "@/components/cover";
import { Type } from "@/theme";

const COVER_WIDTH = 44;

/**
 * Memoized, and taking `id` rather than a prepared closure, because the lists
 * above it re-render on every pull-to-refresh and every keystroke. A per-item
 * `onPress={() => push(id)}` would hand each row a fresh function and defeat
 * the memo; one hoisted `onPress(id)` lets every visible row bail out.
 */
export const GameRow = memo(function GameRow({
  id,
  title,
  subtitle,
  coverImageId,
  onPress,
}: {
  id: number;
  title: string;
  subtitle: string | null;
  coverImageId: string | null;
  onPress: (id: number) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(id)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={subtitle === null ? title : `${title}, ${subtitle}`}
    >
      <Cover imageId={coverImageId} size="small" width={COVER_WIDTH} />

      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle === null ? null : (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      <SymbolView name="chevron.right" size={13} tintColor={PlatformColor("tertiaryLabel")} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: PlatformColor("systemBackground"),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PlatformColor("separator"),
  },
  pressed: {
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
  },
  text: { flex: 1, gap: 2 },
  title: { ...Type.headline, color: PlatformColor("label") },
  subtitle: { ...Type.subheadline, color: PlatformColor("secondaryLabel") },
});
