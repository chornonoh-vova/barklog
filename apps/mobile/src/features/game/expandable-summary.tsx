import { useState } from "react";
import { PlatformColor, Pressable, StyleSheet, Text, View } from "react-native";

import { Type } from "@/theme";

const COLLAPSED_LINES = 3;

export function ExpandableSummary({ summary }: { summary: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Summary</Text>
      <Text style={styles.text} numberOfLines={expanded ? undefined : COLLAPSED_LINES}>
        {summary}
      </Text>
      <Pressable onPress={() => setExpanded((value) => !value)} accessibilityRole="button">
        <Text style={styles.more}>{expanded ? "LESS" : "MORE"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 16, gap: 4 },
  title: { ...Type.headline, color: PlatformColor("label"), paddingHorizontal: 16 },
  text: { ...Type.body, color: PlatformColor("label") },
  more: { ...Type.footnote, fontWeight: "700", color: PlatformColor("link") },
});
