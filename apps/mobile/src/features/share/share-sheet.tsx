import { BottomSheet, RNHostView } from "@expo/ui";
import type { GameSummaryWire } from "@repo/contracts";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { FlatList, PlatformColor, StyleSheet, Text, View } from "react-native";

import { useIdentifyShare } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { GameRow } from "@/components/game-row";
import { QueryBoundary } from "@/components/query-boundary";
import { LoadingState } from "@/components/query-states";
import { summarySubtitle } from "@/features/game/format";
import { NO_LINK, UNREADABLE, noMatch } from "@/features/share/empty-states";
import { Type } from "@/theme";

const keyExtractor = (item: GameSummaryWire) => String(item.id);

export function ShareSheet({
  url,
  isPending,
  error,
  isPresented,
  onSelect,
  onDismiss,
  onSearch,
}: {
  url: string | null;
  isPending: boolean;
  error: Error | null;
  isPresented: boolean;
  onSelect: (id: number) => void;
  onDismiss: () => void;
  onSearch: () => void;
}) {
  const identify = useIdentifyShare(url);

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
   * settled branches below all read as terminal, and one of them would flash
   * on every share's first frame if pending were not checked ahead of them.
   */
  let body: ReactNode;
  if (isPending) {
    body = <LoadingState />;
  } else if (error !== null) {
    // The payload never became readable. `NO_LINK` below would blame the user
    // for a failure that was not theirs.
    body = <EmptyState {...UNREADABLE} action={{ label: "Close", onPress: onDismiss }} />;
  } else if (url === null) {
    // Settled, and nothing in the share was a link. Without this branch the
    // disabled query stays `isPending` forever and the spinner never finishes.
    body = <EmptyState {...NO_LINK} action={{ label: "Close", onPress: onDismiss }} />;
  } else {
    body = (
      <QueryBoundary query={identify}>
        {(data) => (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>Barklog fetched these</Text>
              <Text style={styles.source} numberOfLines={2}>
                {data.source.title}
              </Text>
            </View>

            {data.items.length === 0 ? (
              <EmptyState
                {...noMatch(data.guesses)}
                action={{ label: "Search Instead", onPress: onSearch }}
              />
            ) : (
              <FlatList
                data={data.items}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                contentInsetAdjustmentBehavior="automatic"
              />
            )}
          </>
        )}
      </QueryBoundary>
    );
  }

  return (
    <BottomSheet
      isPresented={isPresented}
      onDismiss={onDismiss}
      snapPoints={["half", "full"]}
      contentPadding={0}
    >
      {/* `RNHostView`, and it cannot be simplified away: `@expo/ui`'s universal
          layer maps to SwiftUI on iOS, not to React Native, so the sheet's
          children are SwiftUI children. An RN subtree — every row here is
          remote IGDB cover art — needs an explicit host or it renders nothing
          at all. `matchContents={false}` lets the host take the parent SwiftUI
          view's size; `true` would size it to its children and fight the
          `presentationDetents` the snap points set. */}
      <RNHostView matchContents={false}>
        <View style={styles.sheet}>{body}</View>
      </RNHostView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 4 },
  title: { ...Type.title2, color: PlatformColor("label") },
  source: { ...Type.subheadline, color: PlatformColor("secondaryLabel") },
});
