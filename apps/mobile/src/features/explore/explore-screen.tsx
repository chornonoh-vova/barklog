import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";

import { useGameFeed } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { ErrorState, LoadingState } from "@/components/query-states";
import { GameShelf } from "@/features/explore/game-shelf";
import { SHELF_LIMIT, toShelves } from "@/features/explore/shelves";
import { Screen } from "@/theme";

const EMPTY_CATALOGUE = (
  <EmptyState
    title="Nothing to sniff out yet"
    systemImage="safari"
    description="The catalogue is still syncing. Check back shortly."
  />
);

export function ExploreScreen() {
  const popular = useGameFeed("popular", SHELF_LIMIT);
  const upcoming = useGameFeed("upcoming", SHELF_LIMIT);
  const recent = useGameFeed("recent", SHELF_LIMIT);
  const router = useRouter();

  // Each tab owns its own detail route (`/explore/game/[id]`, `/search/game/[id]`,
  // and the unprefixed `/game/[id]` inside `(home)`) so the push stays inside the
  // current tab. A bare `/game/${id}` resolves to `(home)` and switches tabs.
  const openGame = useCallback((id: number) => router.push(`/explore/game/${id}`), [router]);

  const shelves = useMemo(
    () => toShelves({ popular: popular.data, upcoming: upcoming.data, recent: recent.data }),
    [popular.data, upcoming.data, recent.data],
  );

  const feeds = [popular, upcoming, recent];
  const refetchAll = () => {
    for (const feed of feeds) void feed.refetch();
  };

  // Three independent requests, so the screen only takes over when there is
  // nothing to draw at all: something still coming spins, a failure that left
  // no shelf behind offers a retry, and only then is the catalogue really
  // empty. A feed that fails beside two that answered just goes unrendered.
  if (shelves.length === 0) {
    if (feeds.some((feed) => feed.isPending)) return <LoadingState />;

    const failed = feeds.find((feed) => feed.isError);

    return failed ? <ErrorState error={failed.error} onRetry={refetchAll} /> : EMPTY_CATALOGUE;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={feeds.some((feed) => feed.isRefetching)}
          onRefresh={refetchAll}
        />
      }
      contentInsetAdjustmentBehavior="automatic"
    >
      {shelves.map((shelf) => (
        <GameShelf key={shelf.feed} shelf={shelf} onPressGame={openGame} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: Screen.fill,
  content: { paddingBottom: 24 },
});
