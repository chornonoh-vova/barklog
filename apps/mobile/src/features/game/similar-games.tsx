import type { GameSummaryWire } from "@repo/contracts";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { useSimilarGames } from "@/lib/api/hooks";
import { GameTile } from "@/components/game-tile";
import { summarySubtitle } from "@/features/game/format";
import { ShelfTitle } from "@/ui/theme";
import { useShelfInset } from "@/ui/use-shelf-inset";

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
  const inset = useShelfInset();
  const { t } = useTranslation();

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
      <Text style={[styles.title, inset]}>{t("game.similarGames")}</Text>

      <FlatList
        horizontal
        data={items}
        keyExtractor={keyExtractor}
        contentContainerStyle={[styles.row, inset]}
        showsHorizontalScrollIndicator={false}
        renderItem={renderItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingBottom: 32 },
  title: ShelfTitle,
  row: { gap: 12 },
});
