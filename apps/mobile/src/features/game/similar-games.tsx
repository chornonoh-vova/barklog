import type { GameSummaryWire } from "@repo/contracts";
import { useCallback } from "react";
import { FlatList, PlatformColor, StyleSheet, Text, View } from "react-native";

import { useSimilarGames } from "@/api/hooks";
import { GameTile } from "@/components/game-tile";
import { summarySubtitle } from "@/features/game/format";
import { Type } from "@/theme";

const keyExtractor = (game: GameSummaryWire) => String(game.id);

/**
 * Renders nothing while in flight, empty or failed — Explore's "a shelf that
 * fails is simply not drawn" rule applied to a section, and what lets this ship
 * before the `game_similar` backfill has run.
 *
 * One row, not Explore's two-row grid: a detail subsection, not a browse
 * surface, and a second row would double an already-long page's height.
 */
export function SimilarGames({
  gameId,
  onPressGame,
}: {
  gameId: number;
  onPressGame: (id: number) => void;
}) {
  const similar = useSimilarGames(gameId);
  const items = similar.data?.items ?? [];

  // Hoisted like GameShelf's renderColumn: an inline closure changes identity on
  // every render of the detail screen — including each optimistic backlog patch
  // — and makes FlatList redraw all twelve cells for unchanged data.
  const renderItem = useCallback(
    ({ item }: { item: GameSummaryWire }) => (
      <GameTile
        id={item.id}
        title={item.name}
        subtitle={summarySubtitle(item)}
        coverImageId={item.coverImageId}
        onPress={onPressGame}
      />
    ),
    [onPressGame],
  );

  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Similar Games</Text>

      <FlatList
        horizontal
        data={items}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.row}
        showsHorizontalScrollIndicator={false}
        renderItem={renderItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingBottom: 32 },
  // Matches GameShelf's heading, so a shelf title and a section title agree.
  title: { ...Type.headline, color: PlatformColor("label"), paddingHorizontal: 16 },
  row: { gap: 12, paddingHorizontal: 16 },
});
