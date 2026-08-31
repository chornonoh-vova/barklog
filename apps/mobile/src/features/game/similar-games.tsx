import type { GameSummaryWire } from "@repo/contracts";
import { FlatList, PlatformColor, StyleSheet, Text, View } from "react-native";

import { useSimilarGames } from "@/api/hooks";
import { GameTile } from "@/components/game-tile";
import { summarySubtitle } from "@/features/game/format";
import { Type } from "@/theme";

const keyExtractor = (game: GameSummaryWire) => String(game.id);

/**
 * In flight, empty and failed all render nothing — Explore's rule ("a shelf
 * that fails is simply not drawn") applied to a section. That is also what lets
 * the whole feature ship before the backfill has run: until `game_similar` has
 * rows, this draws no section rather than an empty one.
 *
 * One row rather than Explore's two-row grid: this is a subsection of a detail
 * screen, not a browse surface, and a second row would double its height on an
 * already-long page.
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
        renderItem={({ item }) => (
          <GameTile
            id={item.id}
            title={item.name}
            subtitle={summarySubtitle(item)}
            coverImageId={item.coverImageId}
            onPress={onPressGame}
          />
        )}
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
