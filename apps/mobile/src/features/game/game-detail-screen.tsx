import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PlatformColor, ScrollView, StyleSheet, View } from "react-native";

import { useBacklogEntry, useGame } from "@/lib/api/hooks";
import { QueryBoundary } from "@/components/query-boundary";
import { DetailRows } from "@/features/game/detail-rows";
import { EntryActions } from "@/features/game/entry-actions";
import { ExpandableSummary } from "@/features/game/expandable-summary";
import { Hero } from "@/features/game/hero";
import { IgdbAttribution } from "@/features/game/igdb-attribution";
import { Screenshots } from "@/features/game/screenshots";
import { confirmRemove } from "@/features/game/confirm-remove";
import { shareGame } from "@/features/game/share-game";
import { SimilarGames } from "@/features/game/similar-games";
import { COLUMN_GAP, detailIsSplit } from "@/ui/columns";
import { useMeasuredWidth } from "@/ui/use-measured-width";

export function GameDetailScreen({ onOpenGame }: { onOpenGame: (id: number) => void }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gameId = Number(id);
  const game = useGame(gameId);
  const writes = useBacklogEntry(gameId);
  const { width, fontScale, onLayout, sideInsets } = useMeasuredWidth();
  const split = detailIsSplit(width, fontScale);
  const { t } = useTranslation();

  const gameData = game.data;
  const onShare = useCallback(() => {
    if (gameData !== undefined) shareGame(gameData);
  }, [gameData]);

  return (
    <>
      <Stack.Header transparent />
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title>{game.data?.name ?? ""}</Stack.Title>

      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="square.and.arrow.up"
          accessibilityLabel={t("game.shareGame")}
          disabled={game.data === undefined}
          onPress={onShare}
        />
        {game.data?.backlogEntry == null ? null : (
          <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel={t("game.backlogActions")}>
            <Stack.Toolbar.MenuAction
              icon="trash"
              destructive
              onPress={() => confirmRemove(game.data?.name ?? t("game.thisGame"), writes.remove)}
            >
              {t("backlog.removeFromBacklog")}
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        )}
      </Stack.Toolbar>

      <QueryBoundary query={game}>
        {(data) => {
          const overview = (
            <>
              <Hero game={data} />

              <EntryActions
                entry={data.backlogEntry}
                onMove={writes.move}
                onRate={(rating) => {
                  // The rating picker only renders once a status exists.
                  if (data.backlogEntry !== null) writes.rate(data.backlogEntry.status, rating);
                }}
              />

              {data.summary === null ? null : <ExpandableSummary summary={data.summary} />}
            </>
          );

          return (
            // Side insets go on the content, not the page: the shelves inset
            // themselves, so they can scroll under the side safe areas.
            <ScrollView
              style={styles.scroll}
              onLayout={onLayout}
              contentInsetAdjustmentBehavior="automatic"
              showsVerticalScrollIndicator={false}
            >
              {/* Wide: what you act on to the left, facts to the right. The
                  shelves stay full width below either way — horizontal
                  scrolling is the one part that already uses the width. */}
              <View style={sideInsets}>
                {split ? (
                  <View style={styles.split}>
                    <View style={styles.primary}>{overview}</View>
                    <View style={styles.secondary}>
                      <DetailRows game={data} />
                    </View>
                  </View>
                ) : (
                  overview
                )}
              </View>

              <Screenshots screenshots={data.screenshots} />

              {split ? null : (
                <View style={sideInsets}>
                  <DetailRows game={data} />
                </View>
              )}

              <SimilarGames gameId={gameId} onPressGame={onOpenGame} />

              <View style={sideInsets}>
                <IgdbAttribution slug={data.slug} />
              </View>
            </ScrollView>
          );
        }}
      </QueryBoundary>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
  split: { flexDirection: "row", gap: COLUMN_GAP },
  // 3:2 so the 132pt cover and a three-line title are not squeezed at 700pt.
  primary: { flex: 3 },
  // Hero's own top inset, so the two columns start level.
  secondary: { flex: 2, paddingTop: 8 },
});
