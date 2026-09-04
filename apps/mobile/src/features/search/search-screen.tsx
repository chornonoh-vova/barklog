import { SEARCH_QUERY_MIN, type GameSummaryWire } from "@repo/contracts";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { FlatList, StyleSheet } from "react-native";

import { useSearchGames } from "@/api/hooks";
import { GameRow } from "@/components/game-row";
import { EmptyState } from "@/components/empty-state";
import { QueryBoundary } from "@/components/query-boundary";
import { summarySubtitle } from "@/features/game/format";
import { useDebounced } from "@/hooks/use-debounced";
import { Screen } from "@/theme";

const DEBOUNCE_MS = 400;

const keyExtractor = (item: GameSummaryWire) => String(item.id);

export function SearchScreen({ query }: { query: string }) {
  const debounced = useDebounced(query.trim(), DEBOUNCE_MS);
  const search = useSearchGames(debounced);
  const router = useRouter();

  const openGame = useCallback((id: number) => router.push(`/search/game/${id}`), [router]);

  const renderItem = useCallback(
    ({ item }: { item: GameSummaryWire }) => (
      <GameRow
        id={item.id}
        title={item.name}
        subtitle={summarySubtitle(item)}
        coverImageId={item.coverImageId}
        onPress={openGame}
      />
    ),
    [openGame],
  );

  if (query.length < SEARCH_QUERY_MIN) {
    return (
      <EmptyState
        title="Fetch a game"
        systemImage="magnifyingglass"
        illustration="explore"
        description="Type a title. Two characters is enough to start."
        fullscreen
      />
    );
  }

  return (
    <QueryBoundary query={search}>
      {(data) => (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={data.items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic"
          ListEmptyComponent={
            <EmptyState
              title="No games found"
              systemImage="magnifyingglass"
              illustration="explore"
              description={`Nothing in the catalogue matches "${debounced}".`}
            />
          }
        />
      )}
    </QueryBoundary>
  );
}

const styles = StyleSheet.create({
  list: Screen.fill,
  listContent: Screen.listContent,
});
