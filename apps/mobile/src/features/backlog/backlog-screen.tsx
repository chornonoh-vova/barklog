import type { BacklogListItemWire, BacklogStatus } from "@repo/contracts";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { PlatformColor, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";

import { useBacklog, useBacklogStats } from "@/api/hooks";
import { GameRow } from "@/components/game-row";
import { NativeState } from "@/components/native-state";
import { QueryBoundary } from "@/components/query-boundary";
import { EMPTY_BACKLOG, EMPTY_FILTER } from "@/features/backlog/empty-states";
import { toSections } from "@/features/backlog/sections";
import { StatusFilter } from "@/features/backlog/status-filter";
import { rowSubtitle } from "@/features/game/format";
import { Type } from "@/theme";

export function BacklogScreen() {
  const [filter, setFilter] = useState<BacklogStatus | undefined>(undefined);
  const backlog = useBacklog(filter);
  const stats = useBacklogStats();
  const router = useRouter();

  const renderItem = useCallback(
    ({ item }: { item: BacklogListItemWire }) => (
      <GameRow
        title={item.game.name}
        subtitle={rowSubtitle(item)}
        coverImageId={item.game.coverImageId}
        onPress={() => router.push(`/game/${item.gameId}`)}
      />
    ),
    [router],
  );

  return (
    <QueryBoundary query={backlog}>
      {(data) => {
        const sections = toSections(data.items, filter);

        // The onboarding state: nothing tracked at all. The filter and the
        // stats line are hidden here on purpose — a filter over nothing is
        // noise, and the only useful thing to offer is a way to find a game.
        if (filter === undefined && data.items.length === 0) {
          return (
            <NativeState
              title={EMPTY_BACKLOG.title}
              systemImage={EMPTY_BACKLOG.systemImage}
              description={EMPTY_BACKLOG.description}
              action={{ label: "Find a Game", onPress: () => router.navigate("/search") }}
            />
          );
        }

        return (
          <SectionList
            style={styles.list}
            sections={sections}
            keyExtractor={(item) => String(item.gameId)}
            renderItem={renderItem}
            ListHeaderComponent={
              <View style={styles.header}>
                <StatusFilter value={filter} onChange={setFilter} />
                {stats.data ? (
                  <Text style={styles.stats}>
                    {`${stats.data.total} ${stats.data.total === 1 ? "game" : "games"}`}
                    {stats.data.averageRating === null ? "" : ` · avg ★${stats.data.averageRating}`}
                  </Text>
                ) : null}
              </View>
            }
            renderSectionHeader={({ section }) =>
              // Null title means a single status is filtered, so there is
              // nothing worth a header.
              section.title === null ? null : (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
                  <Text style={styles.sectionCount}>{section.count}</Text>
                </View>
              )
            }
            ListEmptyComponent={
              filter === undefined ? null : (
                <NativeState
                  title={EMPTY_FILTER[filter].title}
                  systemImage={EMPTY_FILTER[filter].systemImage}
                  description={EMPTY_FILTER[filter].description}
                />
              )
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
        );
      }}
    </QueryBoundary>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
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
