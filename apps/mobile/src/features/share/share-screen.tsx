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

  /**
   * Four states, and the order matters. `isPending` has to come first: the
   * settled branches below all read as terminal, and one of them would show on
   * a share's first frame if pending were not checked ahead of them.
   */
  if (isPending) return <LoadingState />;

  if (error !== null) {
    return <EmptyState {...UNREADABLE} action={backToHome} />;
  }

  // Without this branch the disabled query stays pending and the spinner never
  // finishes.
  if (url === null) {
    return <EmptyState {...NO_LINK} action={backToHome} />;
  }

  return (
    <QueryBoundary query={identify}>
      {(data) => (
        <FlatList
          style={Screen.fill}
          // Without `flexGrow: 1` the empty component is cloned into the
          // content container with no height and gets clipped — see
          // `theme.ts`. `backlog-screen.tsx` carries a header and an empty
          // component the same way.
          contentContainerStyle={Screen.listContent}
          data={data.items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          // Keeps the first row out from under the header, and lets the
          // large title collapse on scroll.
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={
            <ShareHeader source={data.source} identified={data.identified} />
          }
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
