import type { GameSummaryWire } from "@repo/contracts";
import { useCallback } from "react";
import { FlatList } from "react-native";

import { useIdentifyShare } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { GameRow } from "@/components/game-row";
import { QueryBoundary } from "@/components/query-boundary";
import { LoadingState } from "@/components/query-states";
import { summarySubtitle } from "@/features/game/format";
import { NO_LINK, UNREADABLE, noMatch } from "@/features/share/empty-states";
import { ShareHeader } from "@/features/share/share-header";
import { Screen } from "@/theme";

const keyExtractor = (item: GameSummaryWire) => String(item.id);

export function ShareScreen({
  url,
  isPending,
  error,
  onSelect,
  onGoHome,
  onSearch,
}: {
  url: string | null;
  isPending: boolean;
  error: Error | null;
  onSelect: (id: number) => void;
  onGoHome: () => void;
  onSearch: () => void;
}) {
  const identify = useIdentifyShare(url);
  const backToHome = { label: "Back to Home", onPress: onGoHome };

  const renderItem = useCallback(
    ({ item }: { item: GameSummaryWire }) => (
      <GameRow
        id={item.id}
        title={item.name}
        subtitle={summarySubtitle(item)}
        coverImageId={item.coverImageId}
        onPress={onSelect}
      />
    ),
    [onSelect],
  );

  // `isPending` first: the settled branches below all read as terminal, and one
  // would flash on a share's first frame if pending were checked after them.
  if (isPending) return <LoadingState />;

  if (error !== null) {
    return <EmptyState {...UNREADABLE} action={backToHome} />;
  }

  // Without this branch the disabled query stays pending forever.
  if (url === null) {
    return <EmptyState {...NO_LINK} action={backToHome} />;
  }

  return (
    <QueryBoundary query={identify}>
      {(data) => (
        <FlatList
          style={Screen.fill}
          // `flexGrow: 1`, or the empty component is clipped — see `theme.ts`.
          contentContainerStyle={Screen.listContent}
          data={data.items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          // Also what lets the large title collapse on scroll.
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={<ShareHeader source={data.source} identified={data.identified} />}
          ListEmptyComponent={
            <EmptyState
              {...noMatch(data.identified, data.guesses)}
              action={{ label: "Search Instead", onPress: onSearch }}
            />
          }
        />
      )}
    </QueryBoundary>
  );
}
