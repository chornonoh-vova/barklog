import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { FlatList, PlatformColor, ScrollView, StyleSheet, View, Text } from "react-native";

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
import { SimilarGames } from "@/features/game/similar-games";
import { screenshotUrl } from "@/igdb-image";
import { Type } from "@/theme";

const SHOT_WIDTH = 280;

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

  const screenshotsHeader = (
    <Text style={styles.title}>Screenshots</Text>
  );

  return (
    <>
      <Stack.Header transparent />
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title>{game.data?.name ?? ""}</Stack.Title>

      {game.data?.backlogEntry == null ? null : (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="Backlog actions">
            <Stack.Toolbar.MenuAction icon="trash" destructive onPress={() => remove.mutate()}>
              Remove from Backlog
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      )}

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

            {data.screenshots.length === 0 ? null : (
              <FlatList
                horizontal
                style={styles.shots}
                contentContainerStyle={styles.shotsContent}
                data={data.screenshots}
                keyExtractor={(imageId) => imageId}
                showsHorizontalScrollIndicator={false}
                ListHeaderComponent={screenshotsHeader}
                renderItem={({ item }) => (
                  <View style={styles.shot}>
                    <Image
                      source={{ uri: screenshotUrl(item) }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={150}
                      cachePolicy="disk"
                    />
                  </View>
                )}
              />
            )}

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
  title: { ...Type.headline, color: PlatformColor("label"), paddingHorizontal: 16 },
  shots: { marginBottom: 24 },
  shotsContent: { paddingHorizontal: 16, gap: 12 },
  shot: {
    width: SHOT_WIDTH,
    height: SHOT_WIDTH * (9 / 16),
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
  },
});
