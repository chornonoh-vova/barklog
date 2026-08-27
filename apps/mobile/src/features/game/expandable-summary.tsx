import { useState } from "react";
import { PlatformColor, Pressable, StyleSheet, Text, View } from "react-native";

import { Type } from "@/theme";

const COLLAPSED_LINES = 3;

/**
 * Stays React Native rather than becoming a SwiftUI `DisclosureGroup`: this is
 * body content, not a control (composition rule, §3 of the design).
 */
export function ExpandableSummary({ summary }: { summary: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
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
  text: { ...Type.body, color: PlatformColor("label") },
  more: { ...Type.footnote, fontWeight: "700", color: PlatformColor("link") },
});
