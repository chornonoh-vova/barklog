import { BottomSheet, RNHostView } from "@expo/ui";
import type { GameSummaryWire } from "@repo/contracts";
import { useCallback } from "react";
import { FlatList, PlatformColor, StyleSheet, Text, View } from "react-native";

import { useIdentifyShare } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { GameRow } from "@/components/game-row";
import { QueryBoundary } from "@/components/query-boundary";
import { LoadingState } from "@/components/query-states";
import { summarySubtitle } from "@/features/game/format";
import { NO_LINK, noMatch } from "@/features/share/empty-states";
import { Type } from "@/theme";

const keyExtractor = (item: GameSummaryWire) => String(item.id);

export function ShareSheet({
  url,
  isResolving,
  isPresented,
  onSelect,
  onDismiss,
  onSearch,
}: {
  url: string | null;
  isResolving: boolean;
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
        <View style={styles.sheet}>
          {isResolving ? (
            // Transient: iOS is still resolving the payload, so no url yet.
            <LoadingState />
          ) : url === null ? (
            // Resolved, and there was no link in it. Without this branch the
            // disabled query stays `isPending` forever and the user watches a
            // spinner that will never finish.
            <EmptyState {...NO_LINK} action={{ label: "Close", onPress: onDismiss }} />
          ) : (
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
          )}
        </View>
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
