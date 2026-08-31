import type { GameSummaryWire } from "@repo/contracts";
import { useCallback } from "react";
import { FlatList, PlatformColor, StyleSheet, Text, View } from "react-native";

import { useSimilarGames } from "@/api/hooks";
import { GameTile } from "@/components/game-tile";
import { summarySubtitle } from "@/features/game/format";
import { Type } from "@/theme";

const keyExtractor = (game: GameSummaryWire) => String(game.id);

export function SimilarGames({
  gameId,
  onPressGame,
}: {
  gameId: number;
  onPressGame: (id: number) => void;
}) {
  const similar = useSimilarGames(gameId);
  const items = similar.data?.items ?? [];

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
  title: { ...Type.headline, color: PlatformColor("label"), paddingHorizontal: 16 },
  row: { gap: 12, paddingHorizontal: 16 },
});
