import type { BacklogListItemWire, BacklogStatus } from "@repo/contracts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PlatformColor,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useBacklog, useIsPremium } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { GameGridRow } from "@/components/game-grid-row";
import { LoadingState } from "@/components/query-states";
import { UpdatingPill } from "@/components/updating-pill";
import { QueryBoundary } from "@/components/query-boundary";
import { BacklogGameRow } from "@/features/backlog/backlog-game-row";
import { emptyBacklog, emptyFilter } from "@/features/backlog/empty-states";
import { showUpdatingPill } from "@/features/backlog/loading-state";
import { toRowSections, toSections, type BacklogRowSection } from "@/features/backlog/sections";
import { slotsLabel } from "@/features/backlog/slots";
import { StatusFilter } from "@/features/backlog/status-filter";
import { parseStatusParam } from "@/features/backlog/status-param";
import { useSlotState } from "@/features/backlog/use-slot-state";
import { useReviewPrompt } from "@/review/use-review-prompt";
import { Screen, SectionHeader, Type } from "@/theme";
import { columnCount } from "@/ui/columns";
import { isAccessibilitySize } from "@/ui/text-size";
import { useMeasuredWidth } from "@/ui/use-measured-width";

// A row's first game, so a key survives the column count changing under it.
const keyExtractor = (row: BacklogListItemWire[]) => String(row[0]?.gameId);

// Lowercase, deliberately not components: `SectionList` calls these as plain
// functions, and React Compiler would give a component a `useMemoCache` call
// that then runs outside a render. Two of them because the sticky header must
// match the list behind it — plain under rows, grouped under cards.
const sectionHeader = (section: BacklogRowSection, grouped: boolean) =>
  section.title === null ? null : (
    <View style={[styles.sectionHeader, grouped && styles.groupedSectionHeader]}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <Text style={styles.sectionCount}>{section.count}</Text>
    </View>
  );

const renderSectionHeader = ({ section }: { section: BacklogRowSection }) =>
  sectionHeader(section, false);

const renderGroupedSectionHeader = ({ section }: { section: BacklogRowSection }) =>
  sectionHeader(section, true);

export function BacklogScreen() {
  const router = useRouter();
  // The filter lives in `?status=`, so a widget tap and the user's own pick set
  // the same thing.
  const filter = parseStatusParam(useLocalSearchParams<{ status?: string }>().status);
  const setFilter = useCallback(
    (status: BacklogStatus | undefined) => router.setParams({ status }),
    [router],
  );
  const backlog = useBacklog();
  const premium = useIsPremium();
  const slots = slotsLabel(backlog.data?.items, premium);
  const { width, fontScale, onLayout, sideInsets } = useMeasuredWidth();
  const columns = columnCount(width, fontScale);
  const grid = columns > 1;
  const subtitleLines = isAccessibilitySize(fontScale) ? 2 : 1;
  const slotState = useSlotState();
  const { t } = useTranslation();
  // Only a pull the user started shows the native spinner; background
  // revalidation of cached data shows the pill instead.
  const [userRefreshing, setUserRefreshing] = useState(false);
  const updating = showUpdatingPill({
    hasData: backlog.data !== undefined,
    isFetching: backlog.isFetching,
    userRefreshing,
  });

  // Home: the only screen a user reaches without having just tapped something.
  useReviewPrompt();

  const openGame = useCallback((gameId: number) => router.push(`/game/${gameId}`), [router]);

  const renderItem = useCallback(
    ({ item }: { item: BacklogListItemWire[] }) => (
      <GameGridRow columns={columns}>
        {item.map((entry) => (
          <BacklogGameRow
            key={entry.gameId}
            entry={entry}
            variant={grid ? "card" : "row"}
            subtitleLines={subtitleLines}
            premium={slotState.premium}
            activeCount={slotState.activeCount}
            onPress={openGame}
          />
        ))}
      </GameGridRow>
    ),
    [openGame, grid, columns, subtitleLines, slotState.premium, slotState.activeCount],
  );

  const sections = useMemo(
    () => toRowSections(toSections(backlog.data?.items ?? [], filter), columns),
    [backlog.data, filter, columns],
  );

  // The empty state hides the filter, so a status left in the URL by a widget
  // link would resurface after the first add — as an empty filter, if the game
  // went to another status, which reads as the add having failed.
  const empty = backlog.data?.items.length === 0;
  useEffect(() => {
    if (empty && filter !== undefined) setFilter(undefined);
  }, [empty, filter, setFilter]);

  // One list behind every filter, so only the first load ever waits.
  if (backlog.isPending) return <LoadingState />;

  // An empty backlog has nothing to filter: a widget link to a status still
  // lands on the state that offers a way to add a game.
  if (empty) {
    return (
      <EmptyState
        {...emptyBacklog()}
        action={{ label: t("backlog.findGame"), onPress: () => router.navigate("/search") }}
        secondaryAction={{
          label: t("backlog.exploreGames"),
          onPress: () => router.navigate("/explore"),
        }}
        fullscreen
      />
    );
  }

  // An element, not a component, so it sits inside the list's scroll view — a
  // sibling above the list leaves the large title nothing to collapse against.
  const listHeader = (
    <View style={styles.header}>
      <StatusFilter value={filter} onChange={setFilter} />
      {slots === null ? null : (
        <Pressable
          style={styles.slotsTarget}
          accessibilityRole="button"
          accessibilityLabel={t("backlog.slotsHint", { slots })}
          onPress={() => router.push("/paywall")}
        >
          <Text style={styles.slots}>{slots}</Text>
        </Pressable>
      )}
    </View>
  );

  const list = (
    <SectionList
      style={grid ? styles.groupedList : styles.list}
      onLayout={onLayout}
      contentContainerStyle={[styles.listContent, sideInsets]}
      sections={sections}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      renderSectionHeader={grid ? renderGroupedSectionHeader : renderSectionHeader}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        filter === undefined ? undefined : <EmptyState {...emptyFilter(filter)} />
      }
      refreshControl={
        <RefreshControl
          refreshing={userRefreshing}
          onRefresh={() => {
            setUserRefreshing(true);
            void Promise.allSettled([backlog.refetch()]).then(() => setUserRefreshing(false));
          }}
        />
      }
      contentInsetAdjustmentBehavior="automatic"
      stickySectionHeadersEnabled
    />
  );

  return (
    <>
      <QueryBoundary query={backlog}>{() => list}</QueryBoundary>
      <UpdatingPill visible={updating} />
    </>
  );
}

const styles = StyleSheet.create({
  list: Screen.fill,
  groupedList: Screen.groupedFill,
  listContent: Screen.listContent,
  header: { paddingTop: 8, paddingBottom: 8, gap: 4 },
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
    // The footnote count sits on the headline's baseline.
    alignItems: "baseline",
  },
  groupedSectionHeader: SectionHeader.groupedContainer,
  sectionTitle: SectionHeader.title,
  sectionCount: { ...Type.footnote, color: PlatformColor("tertiaryLabel") },
});
