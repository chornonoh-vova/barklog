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

const PROMPT = (
  <EmptyState
    title="Fetch a game"
    systemImage="magnifyingglass"
    description="Type a title. Two characters is enough to start."
  />
);

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

  // The API rejects a shorter query with a 422, so the prompt stands in for it
  // rather than the query firing and failing.
  if (debounced.length < SEARCH_QUERY_MIN) return PROMPT;

  return (
    <QueryBoundary query={search}>
      {(data) =>
        data.items.length === 0 ? (
          <EmptyState
            title="No games found"
            systemImage="magnifyingglass"
            description={`Nothing in the catalogue matches "${debounced}".`}
          />
        ) : (
          <FlatList
            style={styles.list}
            data={data.items}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            keyboardDismissMode="on-drag"
            contentInsetAdjustmentBehavior="automatic"
          />
        )
      }
    </QueryBoundary>
  );
}

const styles = StyleSheet.create({
  list: Screen.fill,
});
