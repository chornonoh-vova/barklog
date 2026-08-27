import type { GameDetailResponse } from "@repo/contracts";
import { PlatformColor, StyleSheet, Text, View } from "react-native";

import { releaseDateLine } from "@/features/game/format";
import { Type } from "@/theme";

const join = (refs: { name: string }[]): string | null =>
  refs.length === 0 ? null : refs.map((ref) => ref.name).join(", ");

const platformNames = (platforms: { name: string; abbreviation: string | null }[]) =>
  platforms.length === 0 ? null : platforms.map((p) => p.abbreviation ?? p.name).join(", ");

export function DetailRows({ game }: { game: GameDetailResponse }) {
  const rows: { label: string; value: string | null }[] = [
    { label: "Released", value: releaseDateLine(game.firstReleaseDate) },
    { label: "Type", value: game.gameType?.name ?? null },
    { label: "Genres", value: join(game.genres) },
    { label: "Platforms", value: platformNames(game.platforms) },
    { label: "Developers", value: join(game.developers) },
    { label: "Publishers", value: join(game.publishers) },
  ];

  return (
    <View style={styles.group}>
      {rows
        .filter((row): row is { label: string; value: string } => row.value !== null)
        .map((row) => (
          <View key={row.label} style={styles.row}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.value}>{row.value}</Text>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginHorizontal: 16,
    marginBottom: 32,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
  },
  row: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PlatformColor("separator"),
  },
  label: { ...Type.body, color: PlatformColor("secondaryLabel"), width: 96 },
  value: { ...Type.body, color: PlatformColor("label"), flex: 1, textAlign: "right" },
});
