import type { GameSummaryWire } from "@repo/contracts";
import { useCallback } from "react";
import { FlatList, PlatformColor, StyleSheet, Text, View } from "react-native";

import { GameTile } from "@/components/game-tile";
import { summarySubtitle } from "@/features/game/format";
import type { Shelf } from "@/features/explore/shelves";
import { Type } from "@/theme";

const keyExtractor = (column: GameSummaryWire[]) => String(column[0]?.id);

export function GameShelf({
  shelf,
  onPressGame,
}: {
  shelf: Shelf;
  onPressGame: (id: number) => void;
}) {
  const renderColumn = useCallback(
    ({ item }: { item: GameSummaryWire[] }) => (
      <View style={styles.column}>
        {item.map((game) => (
          <GameTile
            key={game.id}
            id={game.id}
            title={game.name}
            subtitle={summarySubtitle(game)}
            coverImageId={game.coverImageId}
            onPress={onPressGame}
          />
        ))}
      </View>
    ),
    [onPressGame],
  );

  return (
    <View style={styles.shelf}>
      <Text style={styles.title}>{shelf.title}</Text>

      <FlatList
        horizontal
        data={shelf.columns}
        keyExtractor={keyExtractor}
        renderItem={renderColumn}
        contentContainerStyle={styles.columns}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shelf: { gap: 8, paddingVertical: 12 },
  title: { ...Type.headline, color: PlatformColor("label"), paddingHorizontal: 16 },
  columns: { gap: 12, paddingHorizontal: 16 },
  column: { gap: 12 },
});
