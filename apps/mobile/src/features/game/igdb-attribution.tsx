import { openURL } from "expo-linking";
import { PlatformColor, StyleSheet, Text, View } from "react-native";

import { gameUrl } from "@/igdb-url";
import { Type } from "@/theme";

/**
 * The credit IGDB's terms of use ask for, closing out the screen whose every
 * field came from them. Only the word IGDB is the link, as an inner `Text` with
 * its own `onPress` rather than a `Pressable` around the line, so the tappable
 * region is the word itself and the sentence still wraps as one run of text.
 */
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
