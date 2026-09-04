import type { GameSummaryWire } from "@repo/contracts";
import { openURL } from "expo-linking";
import { useCallback, useMemo } from "react";
import { SectionList, StyleSheet, Text, View } from "react-native";

import { useIdentifyShare } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { GameRow } from "@/components/game-row";
import { QueryBoundary } from "@/components/query-boundary";
import { LoadingState } from "@/components/query-states";
import { summarySubtitle } from "@/features/game/format";
import { NO_LINK, UNREADABLE, noMatch } from "@/features/share/empty-states";
import { toShareSections, type ShareSection } from "@/features/share/sections";
import { ShareHeader } from "@/features/share/share-header";
import { Screen, SectionHeader } from "@/theme";

const keyExtractor = (item: GameSummaryWire) => String(item.id);

// Lowercase, deliberately not a component: `SectionList` calls this as a plain
// function, and React Compiler would give a component a `useMemoCache` call
// that then runs outside a render.
const renderSectionHeader = ({ section }: { section: ShareSection }) =>
  section.title === null ? null : (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
    </View>
  );

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

  const sections = useMemo(
    () =>
      identify.data === undefined
        ? []
        : toShareSections(identify.data.basis, identify.data.items, identify.data.source.author),
    [identify.data],
  );

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
        <SectionList
          style={Screen.fill}
          // `flexGrow: 1`, or the empty component is clipped — see `theme.ts`.
          contentContainerStyle={Screen.listContent}
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          // Also what lets the large title collapse on scroll.
          contentInsetAdjustmentBehavior="automatic"
          stickySectionHeadersEnabled
          ListHeaderComponent={<ShareHeader source={data.source} basis={data.basis} />}
          ListEmptyComponent={
            <EmptyState
              {...noMatch(data.basis, data.guesses)}
              action={{ label: "Search Instead", onPress: onSearch }}
              // The last resort: nothing was identified, so hand the video back.
              secondaryAction={
                data.basis === "none"
                  ? {
                    label: "Open the Original Video",
                    onPress: () => void openURL(data.source.pageUrl),
                  }
                  : undefined
              }
            />
          }
        />
      )}
    </QueryBoundary>
  );
}

const styles = StyleSheet.create({
  sectionHeader: SectionHeader.container,
  sectionTitle: SectionHeader.title,
});
