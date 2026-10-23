import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PlatformColor, Pressable, StyleSheet, Text, View } from "react-native";

import { Type } from "@/ui/theme";

const COLLAPSED_LINES = 3;

export function ExpandableSummary({ summary }: { summary: string }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("game.summary")}</Text>
      <Text style={styles.text} numberOfLines={expanded ? undefined : COLLAPSED_LINES}>
        {summary}
      </Text>
      <Pressable onPress={() => setExpanded((value) => !value)} accessibilityRole="button">
        <Text style={styles.more}>{expanded ? t("game.summaryLess") : t("game.summaryMore")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 16, gap: 8 },
  title: { ...Type.headline, color: PlatformColor("label") },
  text: { ...Type.body, color: PlatformColor("label") },
  more: { ...Type.footnote, fontWeight: "700", color: PlatformColor("link") },
});
