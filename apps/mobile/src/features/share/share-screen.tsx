import type { GameSummaryWire } from "@repo/contracts";
import { useCallback } from "react";
import { FlatList, PlatformColor, StyleSheet, Text, View } from "react-native";

import { useIdentifyShare } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { GameRow } from "@/components/game-row";
import { QueryBoundary } from "@/components/query-boundary";
import { LoadingState } from "@/components/query-states";
import { summarySubtitle } from "@/features/game/format";
import { NO_LINK, TITLE_MATCH_NOTICE, UNREADABLE, noMatch } from "@/features/share/empty-states";
import { Screen, Type } from "@/theme";

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
      {(data) =>
        data.items.length === 0 ? (
          <EmptyState
            {...noMatch(data.identified, data.guesses)}
            action={{ label: "Search Instead", onPress: onSearch }}
          />
        ) : (
          <FlatList
            style={Screen.fill}
            data={data.items}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            // Keeps the first row out from under the header.
            contentInsetAdjustmentBehavior="automatic"
            ListHeaderComponent={
              <View style={styles.header}>
                <Text style={styles.question}>Which game is this?</Text>
                <Text style={styles.source} numberOfLines={2}>
                  {data.source.title}
                </Text>
                {data.identified ? null : <Text style={styles.notice}>{TITLE_MATCH_NOTICE}</Text>}
              </View>
            }
          />
        )
      }
    </QueryBoundary>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 2 },
  question: { ...Type.headline, color: PlatformColor("label") },
  source: { ...Type.subheadline, color: PlatformColor("secondaryLabel") },
  notice: { ...Type.footnote, color: PlatformColor("secondaryLabel"), paddingTop: 4 },
});
