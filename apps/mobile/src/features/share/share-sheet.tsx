import { BottomSheet } from "@expo/ui";
import type { GameSummaryWire } from "@repo/contracts";
import { useCallback } from "react";
import { FlatList, PlatformColor, StyleSheet, Text, View } from "react-native";

import { useIdentifyShare } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { GameRow } from "@/components/game-row";
import { QueryBoundary } from "@/components/query-boundary";
import { summarySubtitle } from "@/features/game/format";
import { Type } from "@/theme";

const keyExtractor = (item: GameSummaryWire) => String(item.id);

/** Reads as a sentence when the guesses are joined, not as a debug dump. */
function guessLine(guesses: string[]): string {
  if (guesses.length === 0) return "We could not tell which game this video is about.";

  return `We think this is about ${guesses.join(" or ")}, but it is not in the catalogue yet.`;
}

export function ShareSheet({
  url,
  isPresented,
  onSelect,
  onDismiss,
  onSearch,
}: {
  url: string | null;
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
      <View style={styles.sheet}>
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
                  title="No match in the catalogue"
                  systemImage="magnifyingglass"
                  description={guessLine(data.guesses)}
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
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 4 },
  title: { ...Type.title2, color: PlatformColor("label") },
  source: { ...Type.subheadline, color: PlatformColor("secondaryLabel") },
});
