import type { GameSummaryWire } from "@repo/contracts";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { FlatList, PlatformColor, RefreshControl, StyleSheet } from "react-native";

import { usePopularGames } from "@/api/hooks";
import { GameRow } from "@/components/game-row";
import { NativeState } from "@/components/native-state";
import { QueryBoundary } from "@/components/query-boundary";
import { metaLine } from "@/features/game/format";

const POPULAR_LIMIT = 50;

export function ExploreScreen() {
  const popular = usePopularGames(POPULAR_LIMIT);
  const router = useRouter();

  const renderItem = useCallback(
    ({ item }: { item: GameSummaryWire }) => (
      // `GameSummaryWire` is the summary projection and carries no `genres` —
      // search and popular return summaries, not details — so the subtitle is
      // the release year alone.
      <GameRow
        title={item.name}
        subtitle={metaLine({ firstReleaseDate: item.firstReleaseDate, genres: [] })}
        coverImageId={item.coverImageId}
        onPress={() => router.push(`/game/${item.id}`)}
      />
    ),
    [router],
  );

  return (
    <QueryBoundary query={popular}>
      {(data) => (
        <FlatList
          style={styles.list}
          data={data.items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          ListEmptyComponent={
            <NativeState
              title="Nothing to sniff out yet"
              systemImage="safari"
              description="The catalogue is still syncing. Check back shortly."
            />
          }
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
  list: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
});
