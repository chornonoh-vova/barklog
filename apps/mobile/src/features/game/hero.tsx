import type { GameDetailResponse } from "@repo/contracts";
import { PlatformColor, StyleSheet, Text, View } from "react-native";

import { Cover } from "@/components/cover";
import { metaLine, ratingLine, ratingLineSpoken } from "@/features/game/format";
import { Type } from "@/ui/theme";
import { useIsAccessibilitySize } from "@/ui/use-accessibility-size";

const COVER_WIDTH = 132;

export function Hero({ game }: { game: GameDetailResponse }) {
  const meta = metaLine({ firstReleaseDate: game.firstReleaseDate, genres: game.genres });
  const rating = ratingLine(game);
  const developer = game.developers[0]?.name ?? null;
  const ax = useIsAccessibilitySize();

  return (
    <View style={styles.container}>
      <View style={[styles.row, ax && styles.stacked]}>
        <Cover imageId={game.coverImageId} size="big" width={COVER_WIDTH} />

        <View style={[styles.info, ax && styles.stackedInfo]}>
          <Text style={styles.name} numberOfLines={3}>
            {game.name}
          </Text>
          {developer === null ? null : <Text style={styles.developer}>{developer}</Text>}
          {meta === null ? null : <Text style={styles.meta}>{meta}</Text>}
          {rating === null ? null : (
            <Text style={styles.meta} accessibilityLabel={ratingLineSpoken(game) ?? undefined}>
              {rating}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 8 },
  row: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  info: { flex: 1, gap: 8, justifyContent: "flex-start" },
  // Cover above the text at accessibility sizes, so the title gets the full width.
  stacked: { flexDirection: "column", alignItems: "center" },
  stackedInfo: { alignSelf: "stretch" },
  name: { ...Type.title2, color: PlatformColor("label") },
  developer: { ...Type.headline, color: PlatformColor("label") },
  meta: { ...Type.subheadline, color: PlatformColor("secondaryLabel") },
});
