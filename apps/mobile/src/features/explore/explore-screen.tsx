import { SEARCH_LIMIT_MAX } from "@repo/contracts";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";

import { useGameFeed } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { ErrorState, LoadingState } from "@/components/query-states";
import { GameShelf } from "@/features/explore/game-shelf";
import { toShelves } from "@/features/explore/shelves";
import { Screen } from "@/theme";
import { useSideInsets } from "@/ui/use-side-insets";

// The most the API serves. The default 20 runs out before the edge of a wide
// window — iPad landscape with the sidebar hidden shows a shelf ending mid-screen.
const SHELF_LIMIT = SEARCH_LIMIT_MAX;

const EMPTY_CATALOGUE = (
  <EmptyState
    title="Nothing to sniff out yet"
    systemImage="safari"
    illustration="explore"
    description="The catalogue is still syncing. Check back shortly."
  />
);

export function ExploreScreen() {
  const popular = useGameFeed("popular", SHELF_LIMIT);
  const upcoming = useGameFeed("upcoming", SHELF_LIMIT);
  const recent = useGameFeed("recent", SHELF_LIMIT);
  const router = useRouter();
  const sideInsets = useSideInsets();

  // Each tab owns its own detail route so a push stays in the current tab: a
  // bare `/game/${id}` resolves to `(home)` and switches tabs.
  const openGame = useCallback((id: number) => router.push(`/explore/game/${id}`), [router]);

  const shelves = toShelves({
    popular: popular.data,
    upcoming: upcoming.data,
    recent: recent.data,
  });

  const feeds = [popular, upcoming, recent];
  const refetchAll = () => {
    for (const feed of feeds) void feed.refetch();
  };

  if (shelves.length === 0) {
    if (feeds.some((feed) => feed.isPending)) return <LoadingState />;

    const failed = feeds.find((feed) => feed.isError);

    return failed ? <ErrorState error={failed.error} onRetry={refetchAll} /> : EMPTY_CATALOGUE;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, sideInsets]}
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
