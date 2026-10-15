import type { BacklogListItemWire, BacklogStatus } from "@repo/contracts";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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

import { useBacklog, useBacklogStats, useIsPremium } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { GameGridRow } from "@/components/game-grid-row";
import { LoadingState } from "@/components/query-states";
import { QueryBoundary } from "@/components/query-boundary";
import { BacklogGameRow } from "@/features/backlog/backlog-game-row";
import { emptyBacklog, emptyFilter } from "@/features/backlog/empty-states";
import { toRowSections, toSections, type BacklogRowSection } from "@/features/backlog/sections";
import { slotsLabel } from "@/features/backlog/slots";
import { StatusFilter } from "@/features/backlog/status-filter";
import { useSlotState } from "@/features/backlog/use-slot-state";
import { statsLine, statsLineSpoken } from "@/features/game/format";
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
  const [filter, setFilter] = useState<BacklogStatus | undefined>(undefined);
  const backlog = useBacklog(filter);
  const stats = useBacklogStats();
  const router = useRouter();
  const premium = useIsPremium();
  const slots = slotsLabel(stats.data, premium);
  const { width, fontScale, onLayout, sideInsets } = useMeasuredWidth();
  const columns = columnCount(width, fontScale);
  const grid = columns > 1;
  const subtitleLines = isAccessibilitySize(fontScale) ? 2 : 1;
  const slotState = useSlotState();
  const { t } = useTranslation();

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

  if (backlog.isPending) return <LoadingState />;

  if (filter === undefined && backlog.data?.items.length === 0) {
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
      {stats.data ? (
        <Text style={styles.stats} accessibilityLabel={statsLineSpoken(stats.data)}>
          {statsLine(stats.data)}
        </Text>
      ) : null}
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

  return (
    <QueryBoundary query={backlog}>
      {() => (
        <SectionList
          style={grid ? styles.groupedList : styles.list}
          onLayout={onLayout}
          contentContainerStyle={[styles.listContent, sideInsets]}
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={grid ? renderGroupedSectionHeader : renderSectionHeader}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={filter === undefined ? null : <EmptyState {...emptyFilter(filter)} />}
          refreshControl={
            <RefreshControl
              // A filter's first load shows the previous list as placeholder
              // data, which counts as refetching. Only a pull should show the
              // spinner; otherwise it pushes the content down and the large
              // title jumps.
              refreshing={backlog.isRefetching && !backlog.isPlaceholderData}
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
    // The footnote count sits on the headline's baseline.
    alignItems: "baseline",
  },
  groupedSectionHeader: SectionHeader.groupedContainer,
  sectionTitle: SectionHeader.title,
  sectionCount: { ...Type.footnote, color: PlatformColor("tertiaryLabel") },
});
