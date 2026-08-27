import { SEARCH_LIMIT_MAX, type GameSummaryWire } from "@repo/contracts";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { FlatList, RefreshControl, StyleSheet } from "react-native";

import { usePopularGames } from "@/api/hooks";
import { GameRow } from "@/components/game-row";
import { EmptyState } from "@/components/empty-state";
import { QueryBoundary } from "@/components/query-boundary";
import { summarySubtitle } from "@/features/game/format";
import { Screen } from "@/theme";

const keyExtractor = (item: GameSummaryWire) => String(item.id);

const EMPTY_CATALOGUE = (
  <EmptyState
    title="Nothing to sniff out yet"
    systemImage="safari"
    description="The catalogue is still syncing. Check back shortly."
  />
);

export function ExploreScreen() {
  const popular = usePopularGames(SEARCH_LIMIT_MAX);
  const router = useRouter();

  // Each tab owns its own detail route (`/explore/game/[id]`, `/search/game/[id]`,
  // and the unprefixed `/game/[id]` inside `(home)`) so the push stays inside the
  // current tab. A bare `/game/${id}` resolves to `(home)` and switches tabs.
  const openGame = useCallback(
    (id: number) => router.push(`/explore/game/${id}`),
    [router],
  );

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

  return (
    <QueryBoundary query={popular}>
      {(data) => (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={data.items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListEmptyComponent={EMPTY_CATALOGUE}
          refreshControl={
            <RefreshControl
              refreshing={popular.isRefetching}
              onRefresh={() => void popular.refetch()}
            />
          }
          contentInsetAdjustmentBehavior="automatic"
        />
      )}
    </QueryBoundary>
  );
}

const styles = StyleSheet.create({
  list: Screen.fill,
  listContent: Screen.listContent,
});
