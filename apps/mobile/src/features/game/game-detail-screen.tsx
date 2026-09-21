import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { PlatformColor, ScrollView, Share, StyleSheet } from "react-native";

import {
  useBacklogStats,
  useDeleteBacklogEntry,
  useGame,
  usePremium,
  useUpsertBacklogEntry,
} from "@/api/hooks";
import { QueryBoundary } from "@/components/query-boundary";
import { activeSlotsUsed } from "@/features/backlog/slots";
import { DetailRows } from "@/features/game/detail-rows";
import { EntryActions } from "@/features/game/entry-actions";
import { ExpandableSummary } from "@/features/game/expandable-summary";
import { Hero } from "@/features/game/hero";
import { IgdbAttribution } from "@/features/game/igdb-attribution";
import { Screenshots } from "@/features/game/screenshots";
import { gameShareContent } from "@/features/game/share";
import { SimilarGames } from "@/features/game/similar-games";

export function GameDetailScreen({ onOpenGame }: { onOpenGame: (id: number) => void }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gameId = Number(id);
  const game = useGame(gameId);
  const upsert = useUpsertBacklogEntry(gameId);
  const remove = useDeleteBacklogEntry(gameId);
  const router = useRouter();
  const premium = usePremium();
  const stats = useBacklogStats();
  const activeCount = stats.data === undefined ? undefined : activeSlotsUsed(stats.data);

  const gameData = game.data;
  const onShare = useCallback(() => {
    if (gameData === undefined) return;
    const { content, options } = gameShareContent(gameData);
    void Share.share(content, options).catch(() => {});
  }, [gameData]);

  return (
    <>
      <Stack.Header transparent />
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title>{game.data?.name ?? ""}</Stack.Title>

      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="square.and.arrow.up"
          accessibilityLabel="Share game"
          disabled={game.data === undefined}
          onPress={onShare}
        />
        {game.data?.backlogEntry == null ? null : (
          <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="Backlog actions">
            <Stack.Toolbar.MenuAction icon="trash" destructive onPress={() => remove.mutate()}>
              Remove from Backlog
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        )}
      </Stack.Toolbar>

      <QueryBoundary query={game}>
        {(data) => (
          <ScrollView
            style={styles.scroll}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
          >
            <Hero game={data} />

            <EntryActions
              entry={data.backlogEntry}
              premium={premium}
              activeCount={activeCount}
              onBlocked={() => router.push("/paywall")}
              onUpsert={(input) => upsert.mutate(input)}
            />

            {data.summary === null ? null : <ExpandableSummary summary={data.summary} />}

            <Screenshots screenshots={data.screenshots} />

            <DetailRows game={data} />

            <SimilarGames gameId={gameId} onPressGame={onOpenGame} />

            <IgdbAttribution slug={data.slug} />
          </ScrollView>
        )}
      </QueryBoundary>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
});
