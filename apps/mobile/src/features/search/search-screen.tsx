import { SEARCH_QUERY_MIN, type GameSummaryWire } from "@repo/contracts";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { FlatList, PlatformColor, StyleSheet } from "react-native";

import { useSearchGames } from "@/api/hooks";
import { GameRow } from "@/components/game-row";
import { NativeState } from "@/components/native-state";
import { QueryBoundary } from "@/components/query-boundary";
import { metaLine } from "@/features/game/format";
import { useDebounced } from "@/hooks/use-debounced";

const DEBOUNCE_MS = 400;

export function SearchResults({ query }: { query: string }) {
  const debounced = useDebounced(query.trim(), DEBOUNCE_MS);
  const search = useSearchGames(debounced);
  const router = useRouter();

  const renderItem = useCallback(
    ({ item }: { item: GameSummaryWire }) => (
      <GameRow
        title={item.name}
        subtitle={metaLine({ firstReleaseDate: item.firstReleaseDate, genres: [] })}
        coverImageId={item.coverImageId}
        onPress={() => router.push(`/game/${item.id}`)}
      />
    ),
    [router],
  );

  // The API rejects a shorter query with a 422, so the prompt state stands in
  // for it rather than the query firing and failing.
  if (debounced.length < SEARCH_QUERY_MIN) {
    return (
      <NativeState
        title="Fetch a game"
        systemImage="magnifyingglass"
        description="Search the whole catalogue by title. Two characters is enough to start."
      />
    );
  }

  return (
    <QueryBoundary query={search}>
      {(data) =>
        data.items.length === 0 ? (
          <NativeState
            title="No games found"
            systemImage="magnifyingglass"
            description={`Nothing in the catalogue matches "${debounced}".`}
          />
        ) : (
          <FlatList
            style={styles.list}
            data={data.items}
            keyExtractor={(item) => String(item.id)}
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
  list: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
});
