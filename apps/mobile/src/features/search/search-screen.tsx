import { SEARCH_QUERY_MIN, type GameSummaryWire } from "@repo/contracts";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { FlatList, StyleSheet } from "react-native";

import { useSearchGames } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { GameGridRow } from "@/components/game-grid-row";
import { GameRow, type GameRowVariant } from "@/components/game-row";
import { QueryBoundary } from "@/components/query-boundary";
import { summarySubtitle } from "@/features/game/format";
import { useDebounced } from "@/hooks/use-debounced";
import { Screen } from "@/theme";
import { chunk, COLUMN_GAP, columnCount } from "@/ui/columns";
import { useMeasuredWidth } from "@/ui/use-measured-width";

const DEBOUNCE_MS = 400;

// A row's first game, so a key survives the column count changing under it.
const keyExtractor = (row: GameSummaryWire[]) => String(row[0]?.id);

export function SearchScreen({ query }: { query: string }) {
  const debounced = useDebounced(query.trim(), DEBOUNCE_MS);
  const search = useSearchGames(debounced);
  const router = useRouter();
  const { width, fontScale, onLayout, sideInsets } = useMeasuredWidth();
  const columns = columnCount(width, fontScale);
  const grid = columns > 1;

  const openGame = useCallback((id: number) => router.push(`/search/game/${id}`), [router]);

  const renderItem = useCallback(
    ({ item }: { item: GameSummaryWire[] }) => {
      const game = (summary: GameSummaryWire, variant: GameRowVariant) => (
        <GameRow
          key={summary.id}
          id={summary.id}
          title={summary.name}
          subtitle={summarySubtitle(summary)}
          coverImageId={summary.coverImageId}
          variant={variant}
          onPress={openGame}
        />
      );

      return grid ? (
        <GameGridRow columns={columns}>{item.map((summary) => game(summary, "card"))}</GameGridRow>
      ) : (
        <>{item.map((summary) => game(summary, "row"))}</>
      );
    },
    [openGame, grid, columns],
  );

  if (query.length < SEARCH_QUERY_MIN) {
    return (
      <EmptyState
        title="Fetch a game"
        systemImage="magnifyingglass"
        illustration="explore"
        description="Type a title. Two characters is enough to start."
        fullscreen
      />
    );
  }

  return (
    <QueryBoundary query={search}>
      {(data) => (
        // Rows of `chunk`, not `numColumns`: React Native refuses to change
        // `numColumns` on a mounted list, and remounting by `key` would throw
        // away the scroll position every time the window is resized.
        <FlatList
          style={grid ? styles.groupedList : styles.list}
          contentContainerStyle={[styles.listContent, grid && styles.gridContent, sideInsets]}
          onLayout={onLayout}
          data={chunk(data.items, columns)}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic"
          ListEmptyComponent={
            <EmptyState
              title="No games found"
              systemImage="magnifyingglass"
              illustration="explore"
              description={`Nothing in the catalogue matches "${debounced}".`}
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
