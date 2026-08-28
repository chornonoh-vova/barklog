import { memo } from "react";
import { PlatformColor, Pressable, StyleSheet, Text } from "react-native";

import { Cover } from "@/components/cover";
import { Type } from "@/theme";

export const TILE_WIDTH = 100;

/**
 * `big` rather than the `small` a row uses: at 100pt this lands on a 3x screen
 * around 300px, and the small transform's 180px is visibly soft there.
 */
const COVER_SIZE = "big";

/** Two lines of title and one of subtitle, fixed, so every tile in a shelf is
 * the same height and the two rows of the grid stay aligned. */
const TITLE_LINE = 17;

/**
 * The grid counterpart to `GameRow`, memoized for the same reason: a shelf
 * re-renders on every pull-to-refresh, and taking `id` with one hoisted
 * `onPress(id)` — rather than a per-tile closure — lets every visible tile
 * bail out.
 */
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
      <Cover imageId={coverImageId} size={COVER_SIZE} width={TILE_WIDTH} />

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
