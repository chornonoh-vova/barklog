import type { GameDetailResponse } from "@repo/contracts";
import { useTranslation } from "react-i18next";
import { PlatformColor, StyleSheet, Text, View } from "react-native";

import { namesLine, platformNames, releaseDateLine } from "@/features/game/format";
import { Type } from "@/theme";

export function DetailRows({ game }: { game: GameDetailResponse }) {
  const { t } = useTranslation();
  const rows: { label: string; value: string | null }[] = [
    { label: t("game.released"), value: releaseDateLine(game.firstReleaseDate) },
    { label: t("game.type"), value: game.gameType?.name ?? null },
    { label: t("game.genres"), value: namesLine(game.genres) },
    { label: t("game.platforms"), value: platformNames(game.platforms) },
    { label: t("game.developers"), value: namesLine(game.developers) },
    { label: t("game.publishers"), value: namesLine(game.publishers) },
  ];

  return (
    <View style={styles.group}>
      {rows.flatMap((row) =>
        row.value === null
          ? []
          : [
              <View key={row.label} style={styles.row}>
                <Text style={styles.label}>{row.label}</Text>
                <Text style={styles.value}>{row.value}</Text>
              </View>,
            ],
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginHorizontal: 8,
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
