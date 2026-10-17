import { SEARCH_QUERY_MIN, type GameSummaryWire } from "@repo/contracts";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, StyleSheet } from "react-native";

import { useSearchGames } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { GameGridRow } from "@/components/game-grid-row";
import { GameRow } from "@/components/game-row";
import { QueryBoundary } from "@/components/query-boundary";
import { summarySubtitle } from "@/features/game/format";
import { RecentSearches } from "@/features/search/recent-searches";
import { useDebounced } from "@/hooks/use-debounced";
import { Screen } from "@/theme";
import { chunk, COLUMN_GAP, columnCount } from "@/ui/columns";
import { isAccessibilitySize } from "@/ui/text-size";
import { useMeasuredWidth } from "@/ui/use-measured-width";

const DEBOUNCE_MS = 400;

// A row's first game, so a key survives the column count changing under it.
const keyExtractor = (row: GameSummaryWire[]) => String(row[0]?.id);

export function SearchScreen({
  query,
  recents,
  onPickRecent,
  onClearRecents,
  onOpenResult,
}: {
  query: string;
  recents: readonly string[];
  onPickRecent: (query: string) => void;
  onClearRecents: () => void;
  /** Called with the query a result was found by, as that result opens. */
  onOpenResult: (query: string) => void;
}) {
  const debounced = useDebounced(query.trim(), DEBOUNCE_MS);
  const search = useSearchGames(debounced);
  const router = useRouter();
  const { width, fontScale, onLayout, sideInsets } = useMeasuredWidth();
  const columns = columnCount(width, fontScale);
  const grid = columns > 1;
  const subtitleLines = isAccessibilitySize(fontScale) ? 2 : 1;
  const { t } = useTranslation();
  // Out here, not in the render prop: memoised, so `FlatList` keeps its rows.
  const rows = useMemo(() => chunk(search.data?.items ?? [], columns), [search.data, columns]);

  // The query the visible results belong to. While the next query loads, the
  // previous results stay on screen (`keepPreviousData`), and a tap on one of
  // them was found by the previous query, not by `debounced`.
  const [shownQuery, setShownQuery] = useState(debounced);
  if (search.data !== undefined && !search.isPlaceholderData && shownQuery !== debounced) {
    setShownQuery(debounced);
  }

  // Recorded on open, not on every keystroke: a query worth remembering is one
  // that found the game.
  const openGame = useCallback(
    (id: number) => {
      onOpenResult(shownQuery);
      router.push(`/search/game/${id}`);
    },
    [onOpenResult, shownQuery, router],
  );

  const renderItem = useCallback(
    ({ item }: { item: GameSummaryWire[] }) => (
      <GameGridRow columns={columns}>
        {item.map((summary) => (
          <GameRow
            key={summary.id}
            id={summary.id}
            title={summary.name}
            subtitle={summarySubtitle(summary)}
            coverImageId={summary.coverImageId}
            variant={grid ? "card" : "row"}
            subtitleLines={subtitleLines}
            onPress={openGame}
          />
        ))}
      </GameGridRow>
    ),
    [openGame, grid, columns, subtitleLines],
  );

  if (query.length < SEARCH_QUERY_MIN) {
    if (recents.length > 0) {
      return <RecentSearches recents={recents} onPick={onPickRecent} onClear={onClearRecents} />;
    }

    return (
      <EmptyState
        title={t("search.promptTitle")}
        systemImage="magnifyingglass"
        illustration="explore"
        description={t("search.promptDescription")}
        fullscreen
      />
    );
  }

  return (
    <QueryBoundary query={search}>
      {() => (
        // Rows of `chunk`, not `numColumns`: React Native refuses to change
        // `numColumns` on a mounted list, and remounting by `key` would throw
        // away the scroll position every time the window is resized.
        <FlatList
          style={grid ? styles.groupedList : styles.list}
          contentContainerStyle={[styles.listContent, grid && styles.gridContent, sideInsets]}
          onLayout={onLayout}
          data={rows}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic"
          ListEmptyComponent={
            <EmptyState
              title={t("search.noResultsTitle")}
              systemImage="magnifyingglass"
              illustration="explore"
              description={t("search.noResultsDescription", { query: shownQuery })}
            />
          }
        />
      )}
    </QueryBoundary>
  );
}

const styles = StyleSheet.create({
  list: Screen.fill,
  groupedList: Screen.groupedFill,
  listContent: Screen.listContent,
  gridContent: { paddingTop: COLUMN_GAP },
});
