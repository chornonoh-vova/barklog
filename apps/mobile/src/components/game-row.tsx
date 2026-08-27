import { SymbolView } from "expo-symbols";
import { Pressable, PlatformColor, StyleSheet, Text, View } from "react-native";

import { Cover } from "@/components/cover";
import { Type } from "@/theme";

const COVER_WIDTH = 44;

export function GameRow({
  title,
  subtitle,
  coverImageId,
  onPress,
}: {
  title: string;
  subtitle: string | null;
  coverImageId: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={subtitle === null ? title : `${title}, ${subtitle}`}
    >
      <Cover imageId={coverImageId} size="small" width={COVER_WIDTH} />

      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle === null ? null : (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      <SymbolView name="chevron.right" size={13} tintColor={PlatformColor("tertiaryLabel")} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: PlatformColor("systemBackground"),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PlatformColor("separator"),
  },
  pressed: {
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
  },
  text: { flex: 1, gap: 2 },
  title: { ...Type.headline, color: PlatformColor("label") },
  subtitle: { ...Type.subheadline, color: PlatformColor("secondaryLabel") },
});
