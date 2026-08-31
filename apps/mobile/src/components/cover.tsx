import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { PlatformColor, StyleSheet, View } from "react-native";

import { coverUrl, type CoverSize } from "@/igdb-image";
import { COVER_ASPECT } from "@/theme";

export function Cover({
  imageId,
  size,
  width,
}: {
  imageId: string | null;
  size: CoverSize;
  width: number;
}) {
  const uri = coverUrl(imageId, size);
  const style = { width, height: width / COVER_ASPECT };

  if (uri === null) {
    return (
      <View style={[styles.placeholder, style]}>
        <SymbolView
          name="gamecontroller"
          size={width * 0.45}
          tintColor={PlatformColor("secondaryLabel")}
        />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.image, style]}
      contentFit="cover"
      transition={150}
      cachePolicy="disk"
    />
  );
}

const styles = StyleSheet.create({
  image: {
    borderRadius: 6,
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
  },
  placeholder: {
    borderRadius: 6,
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
    alignItems: "center",
    justifyContent: "center",
  },
});
