import { useState } from "react";
import { FlatList, PlatformColor, Pressable, StyleSheet, Text, View } from "react-native";

import { RemoteImage } from "@/components/remote-image";
import { screenshotLabel } from "@/features/game/screenshot-label";
import { ScreenshotViewer } from "@/features/game/screenshot-viewer";
import { screenshotUrl } from "@/igdb-image";
import { SHOT_ASPECT, ShelfTitle } from "@/theme";

const SHOT_WIDTH = 280;

export function Screenshots({ screenshots }: { screenshots: string[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (screenshots.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={ShelfTitle}>Screenshots</Text>

      <FlatList
        horizontal
        style={styles.shots}
        contentContainerStyle={styles.shotsContent}
        data={screenshots}
        keyExtractor={(imageId) => imageId}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => setOpenId(item)}
            style={({ pressed }) => [styles.shot, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={screenshotLabel(index, screenshots.length)}
            accessibilityHint="Opens full screen"
          >
            <RemoteImage source={{ uri: screenshotUrl(item, "med") }} style={styles.image} />
          </Pressable>
        )}
      />

      {openId === null ? null : (
        <ScreenshotViewer
          screenshots={screenshots}
          openId={openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  shots: { marginBottom: 24 },
  shotsContent: { paddingHorizontal: 16, gap: 12 },
  shot: {
    width: SHOT_WIDTH,
    height: SHOT_WIDTH / SHOT_ASPECT,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
  },
  pressed: { opacity: 0.6 },
  image: { width: "100%", height: "100%" },
});
