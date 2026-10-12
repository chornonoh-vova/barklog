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
import { EmptyState } from "@/components/empty-state";
import { GameGridRow } from "@/components/game-grid-row";
import { GameRow, type GameRowVariant } from "@/components/game-row";
import { LoadingState } from "@/components/query-states";
import { QueryBoundary } from "@/components/query-boundary";
import { EMPTY_BACKLOG, EMPTY_FILTER } from "@/features/backlog/empty-states";
import { toRowSections, toSections, type BacklogRowSection } from "@/features/backlog/sections";
import { slotsLabel } from "@/features/backlog/slots";
import { StatusFilter } from "@/features/backlog/status-filter";
import { rowSubtitle, statsLine } from "@/features/game/format";
import { useReviewPrompt } from "@/review/use-review-prompt";
import { Screen, SectionHeader, Type } from "@/theme";
import { columnCount } from "@/ui/columns";
import { useMeasuredWidth } from "@/ui/use-measured-width";

// A row's first game, so a key survives the column count changing under it.
const keyExtractor = (row: BacklogListItemWire[]) => String(row[0]?.gameId);

// Lowercase, deliberately not components: `SectionList` calls these as plain
// functions, and React Compiler would give a component a `useMemoCache` call
// that then runs outside a render. Two of them because the sticky header must
// match the list behind it — plain under rows, grouped under cards.
const sectionHeader = (section: BacklogRowSection, grouped: boolean) =>
  section.title === null ? null : (
    <View style={grouped ? styles.groupedSectionHeader : styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
      <Text style={styles.sectionCount}>{section.count}</Text>
    </View>
  );

const renderSectionHeader = ({ section }: { section: BacklogRowSection }) =>
  sectionHeader(section, false);

const renderGroupedSectionHeader = ({ section }: { section: BacklogRowSection }) =>
  sectionHeader(section, true);

export function BacklogScreen() {
  const [filter, setFilter] = useState<BacklogStatus | undefined>(undefined);
  const backlog = useBacklog(filter);
  const stats = useBacklogStats();
  const router = useRouter();
  const premium = useIsPremium();
  const slots = slotsLabel(stats.data, premium);
  const { width, fontScale, onLayout } = useMeasuredWidth();
  const columns = columnCount(width, fontScale);
  const grid = columns > 1;

  // Home: the only screen a user reaches without having just tapped something.
  useReviewPrompt();

  const openGame = useCallback((gameId: number) => router.push(`/game/${gameId}`), [router]);

  const renderItem = useCallback(
    ({ item }: { item: BacklogListItemWire[] }) => {
      const game = (entry: BacklogListItemWire, variant: GameRowVariant) => (
        <GameRow
          key={entry.gameId}
          id={entry.gameId}
          title={entry.game.name}
          subtitle={rowSubtitle(entry)}
          coverImageId={entry.game.coverImageId}
          variant={variant}
          onPress={openGame}
        />
      );

      return grid ? (
        <GameGridRow columns={columns}>{item.map((entry) => game(entry, "card"))}</GameGridRow>
      ) : (
        <>{item.map((entry) => game(entry, "row"))}</>
      );
    },
    [openGame, grid, columns],
  );

  const sections = useMemo(
    () => toRowSections(toSections(backlog.data?.items ?? [], filter), columns),
    [backlog.data, filter, columns],
  );

  if (backlog.isPending) return <LoadingState />;

  if (filter === undefined && backlog.data?.items.length === 0) {
    return (
      <EmptyState
        {...EMPTY_BACKLOG}
        action={{ label: "Find a Game", onPress: () => router.navigate("/search") }}
        secondaryAction={{ label: "Or explore games", onPress: () => router.navigate("/explore") }}
        fullscreen
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
          style={grid ? styles.groupedList : styles.list}
          onLayout={onLayout}
          contentContainerStyle={styles.listContent}
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={grid ? renderGroupedSectionHeader : renderSectionHeader}
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
  groupedList: Screen.groupedFill,
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
    ...SectionHeader.container,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  groupedSectionHeader: {
    ...SectionHeader.groupedContainer,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionTitle: SectionHeader.title,
  sectionCount: { ...Type.footnote, color: PlatformColor("tertiaryLabel") },
});
