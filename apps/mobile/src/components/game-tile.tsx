import { memo } from "react";
import { PlatformColor, Pressable, StyleSheet, Text, useWindowDimensions } from "react-native";

import { Cover } from "@/components/cover";
import { Type } from "@/theme";

const TILE_WIDTH = 100;

const TITLE_LINE = 17;

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
  /* Both labels reserve a whole number of lines so tiles in a shelf line up,
     and that reservation has to grow with Dynamic Type or the scaled text
     clips inside it. `fontScale` here, not `PixelRatio.getFontScale()`: the
     latter is read once and would not survive the setting changing while the
     app is open. */
  const { fontScale } = useWindowDimensions();
  const line = TITLE_LINE * fontScale;

  return (
    <Pressable
      onPress={() => onPress(id)}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={subtitle === null ? title : `${title}, ${subtitle}`}
    >
      {/* `big`: at 100pt on a 3x screen the small transform's 180px is visibly soft. */}
      <Cover imageId={coverImageId} size="big" width={TILE_WIDTH} />

      <Text style={[styles.title, { lineHeight: line, height: line * 2 }]} numberOfLines={2}>
        {title}
      </Text>
      <Text style={[styles.subtitle, { lineHeight: line, height: line }]} numberOfLines={1}>
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
  },
  subtitle: {
    ...Type.footnote,
    color: PlatformColor("secondaryLabel"),
  },
});
