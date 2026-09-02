import type { BacklogListItemWire, BacklogStatus } from "@repo/contracts";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  PlatformColor,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useBacklog, useBacklogStats, useIsPremium } from "@/api/hooks";
import { GameRow } from "@/components/game-row";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/query-states";
import { QueryBoundary } from "@/components/query-boundary";
import { EMPTY_BACKLOG, EMPTY_FILTER } from "@/features/backlog/empty-states";
import { toSections, type BacklogSection } from "@/features/backlog/sections";
import { slotsLabel } from "@/features/backlog/slots";
import { StatusFilter } from "@/features/backlog/status-filter";
import { rowSubtitle, statsLine } from "@/features/game/format";
import { Screen, Type } from "@/theme";

const keyExtractor = (item: BacklogListItemWire) => String(item.gameId);

// Lowercase, deliberately not a component: `SectionList` calls this as a plain
// function, and React Compiler would give a component a `useMemoCache` call
// that then runs outside a render.
const renderSectionHeader = ({ section }: { section: BacklogSection }) =>
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
  const premium = useIsPremium();
  const slots = slotsLabel(stats.data, premium);

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

  if (backlog.isPending) return <LoadingState />;

  if (filter === undefined && backlog.data?.items.length === 0) {
    return (
      <EmptyState
        {...EMPTY_BACKLOG}
        action={{ label: "Find a Game", onPress: () => router.navigate("/search") }}
      />
    );
  }

  // An element, not a component, so it sits inside the list's scroll view — a
  // sibling above the list leaves the large title nothing to collapse against.
  const listHeader = (
    <View style={styles.header}>
      <StatusFilter value={filter} onChange={setFilter} />
      {stats.data ? <Text style={styles.stats}>{statsLine(stats.data)}</Text> : null}
      {slots === null ? null : (
        <Pressable
          style={styles.slotsTarget}
          accessibilityRole="button"
          accessibilityLabel={`${slots}. Tap to see Barklog Premium.`}
          onPress={() => router.push("/paywall")}
        >
          <Text style={styles.slots}>{slots}</Text>
        </Pressable>
      )}
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
  // A footnote line leaves this control about 26pt tall, and it is a real
  // control on the most-visited screen, so it owes the 44pt minimum. A minimum
  // rather than a fixed height, so a larger text size grows it instead of
  // clipping.
  slotsTarget: { minHeight: 44, justifyContent: "center" },
  slots: { ...Type.footnote, color: PlatformColor("link"), paddingHorizontal: 16 },
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
