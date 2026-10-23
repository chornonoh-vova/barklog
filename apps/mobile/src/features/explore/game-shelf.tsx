import type { GameSummaryWire } from "@repo/contracts";
import { useCallback } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { GameTile } from "@/components/game-tile";
import { summarySubtitle } from "@/features/game/format";
import type { Shelf } from "@/features/explore/shelves";
import { ShelfTitle } from "@/ui/theme";
import { useSideInsets } from "@/ui/use-side-insets";

/** The gutter between the screen edge, or a safe area, and a shelf's content. */
const GUTTER = 16;

const keyExtractor = (column: GameSummaryWire[]) => String(column[0]?.id);

export function GameShelf({
  shelf,
  onPressGame,
}: {
  shelf: Shelf;
  onPressGame: (id: number) => void;
}) {
  // The list spans the full width and only its content is inset, so covers
  // scroll under the Dynamic Island in landscape and the tab sidebar on
  // iPhone Duo, where the glass then has something to show through it.
  const { paddingLeft, paddingRight } = useSideInsets();
  const inset = { paddingLeft: GUTTER + paddingLeft, paddingRight: GUTTER + paddingRight };

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
      <Text style={[styles.title, inset]}>{shelf.title}</Text>

      <FlatList
        horizontal
        data={shelf.columns}
        keyExtractor={keyExtractor}
        renderItem={renderColumn}
        contentContainerStyle={[styles.columns, inset]}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shelf: { gap: 8, paddingVertical: 12 },
  title: ShelfTitle,
  columns: { gap: 12 },
  column: { gap: 12 },
});
