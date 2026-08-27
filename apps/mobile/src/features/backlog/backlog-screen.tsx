import type { BacklogListItemWire, BacklogStatus } from "@repo/contracts";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { PlatformColor, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";

import { useBacklog, useBacklogStats } from "@/api/hooks";
import { GameRow } from "@/components/game-row";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/query-states";
import { QueryBoundary } from "@/components/query-boundary";
import { EMPTY_BACKLOG, EMPTY_FILTER } from "@/features/backlog/empty-states";
import { toSections, type BacklogSection } from "@/features/backlog/sections";
import { StatusFilter } from "@/features/backlog/status-filter";
import { rowSubtitle, statsLine } from "@/features/game/format";
import { Screen, Type } from "@/theme";

const keyExtractor = (item: BacklogListItemWire) => String(item.gameId);

// Lowercase, and deliberately not a component: `SectionList` calls this as a
// plain function rather than rendering it as an element, and React Compiler
// gives anything that looks like a component a `useMemoCache` call — which would
// then run outside a render.
const renderSectionHeader = ({ section }: { section: BacklogSection }) =>
  // A null title means a single status is filtered, so there is no header worth
  // drawing.
  section.title === null ? null : (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
      <Text style={styles.sectionCount}>{section.count}</Text>
    </View>
  );

export function BacklogScreen() {
  const [filter, setFilter] = useState<BacklogStatus | undefined>(undefined);
  const backlog = useBacklog(filter);
  const stats = useBacklogStats();
  const router = useRouter();

  const openGame = useCallback((gameId: number) => router.push(`/game/${gameId}`), [router]);

  const renderItem = useCallback(
    ({ item }: { item: BacklogListItemWire }) => (
      <GameRow
        id={item.gameId}
        title={item.game.name}
        subtitle={rowSubtitle(item)}
        coverImageId={item.game.coverImageId}
        onPress={openGame}
      />
    ),
    [openGame],
  );

  const sections = useMemo(
    () => toSections(backlog.data?.items ?? [], filter),
    [backlog.data, filter],
  );

  // Both of these read the backlog query, never `stats`. `stats` is a second
  // request that can fail or lag on its own, and gating on it left an empty
  // unfiltered list with no empty state at all whenever it did.
  if (backlog.isPending) return <LoadingState />;

  if (filter === undefined && backlog.data?.items.length === 0) {
    return (
      <EmptyState
        {...EMPTY_BACKLOG}
        action={{ label: "Find a Game", onPress: () => router.navigate("/search") }}
      />
    );
  }

  // Passed as an element, not a component, so it lives inside the list's own
  // scroll view — a sibling above the list leaves the large title with nothing
  // to collapse against and the header ends up clipped instead of scrolling.
  const listHeader = (
    <View style={styles.header}>
      <StatusFilter value={filter} onChange={setFilter} />
      {stats.data ? <Text style={styles.stats}>{statsLine(stats.data)}</Text> : null}
    </View>
  );

  return (
    <QueryBoundary query={backlog}>
      {() => (
        <SectionList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          ListHeaderComponent={listHeader}
          // `null` is unreachable: an empty unfiltered list took the
          // onboarding branch above.
          ListEmptyComponent={
            filter === undefined ? null : <EmptyState {...EMPTY_FILTER[filter]} />
          }
          refreshControl={
            <RefreshControl
              refreshing={backlog.isRefetching}
              onRefresh={() => {
                void backlog.refetch();
                void stats.refetch();
              }}
            />
          }
          contentInsetAdjustmentBehavior="automatic"
          stickySectionHeadersEnabled
        />
      )}
    </QueryBoundary>
  );
}

const styles = StyleSheet.create({
  list: Screen.fill,
  listContent: Screen.listContent,
  header: { paddingTop: 8, gap: 4 },
  stats: {
    ...Type.footnote,
    color: PlatformColor("secondaryLabel"),
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    backgroundColor: PlatformColor("systemBackground"),
  },
  sectionTitle: {
    ...Type.footnote,
    fontWeight: "600",
    letterSpacing: 0.5,
    color: PlatformColor("secondaryLabel"),
  },
  sectionCount: { ...Type.footnote, color: PlatformColor("tertiaryLabel") },
});
