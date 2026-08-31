import { openURL } from "expo-linking";
import { PlatformColor, StyleSheet, Text, View } from "react-native";

import { gameUrl } from "@/igdb-url";
import { Type } from "@/theme";

/** The credit IGDB's terms require. An inner `Text` rather than a `Pressable`
 * around the line, so only the word is tappable and the sentence wraps as one. */
export function IgdbAttribution({ slug }: { slug: string }) {
  const url = gameUrl(slug);

  return (
    <View style={styles.container}>
      <Text style={styles.line}>
        Powered by{" "}
        <Text style={styles.link} accessibilityRole="link" onPress={() => void openURL(url)}>
          IGDB
        </Text>{" "}
        data
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 32, alignItems: "center" },
  line: { ...Type.footnote, color: PlatformColor("secondaryLabel") },
  link: { ...Type.footnote, color: PlatformColor("link") },
});
