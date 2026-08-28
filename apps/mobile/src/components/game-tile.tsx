import { memo } from "react";
import { PlatformColor, Pressable, StyleSheet, Text } from "react-native";

import { Cover } from "@/components/cover";
import { Type } from "@/theme";

const TILE_WIDTH = 100;

/** Fixed heights, so the two rows of a shelf stay aligned. */
const TITLE_LINE = 17;

/** Memoized like `GameRow`, taking `id` rather than a per-tile closure. */
export const GameTile = memo(function GameTile({
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
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={subtitle === null ? title : `${title}, ${subtitle}`}
    >
      {/* `big`: at 100pt on a 3x screen the small transform's 180px is visibly soft. */}
      <Cover imageId={coverImageId} size="big" width={TILE_WIDTH} />

      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {subtitle ?? ""}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tile: { width: TILE_WIDTH, gap: 4 },
  pressed: { opacity: 0.6 },
  title: {
    ...Type.footnote,
    fontWeight: "600",
    color: PlatformColor("label"),
    lineHeight: TITLE_LINE,
    height: TITLE_LINE * 2,
  },
  subtitle: {
    ...Type.footnote,
    color: PlatformColor("secondaryLabel"),
    lineHeight: TITLE_LINE,
    height: TITLE_LINE,
  },
});
