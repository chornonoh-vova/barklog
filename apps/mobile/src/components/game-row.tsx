import { SymbolView } from "expo-symbols";
import { memo, type ReactNode } from "react";
import { Pressable, PlatformColor, StyleSheet, Text, View } from "react-native";

import { Cover } from "@/components/cover";
import { Type } from "@/ui/theme";

const COVER_WIDTH = 44;
const MENU_SIZE = 44;

/** `row` is the plain list row a phone shows; `card` is one cell of a grid on a
 * wider window. Same content, so the two never drift apart. */
export type GameRowVariant = "row" | "card";

/** Takes `id`, not a closure: a per-item `onPress={() => push(id)}` would hand
 * each row a fresh function and defeat the memo. */
export const GameRow = memo(function GameRow({
  id,
  title,
  subtitle,
  spokenSubtitle,
  subtitleLines = 1,
  coverImageId,
  variant = "row",
  menu,
  onPress,
}: {
  id: number;
  title: string;
  subtitle: string | null;
  /** What VoiceOver reads instead of `subtitle`, when the visible one uses glyphs. */
  spokenSubtitle?: string;
  /** 2 at accessibility text sizes. A prop, so the list reads the text size
   * once instead of every row subscribing to the window. */
  subtitleLines?: number;
  coverImageId: string | null;
  variant?: GameRowVariant;
  /** A trailing control, such as Home's `…` menu. It replaces the chevron. */
  menu?: ReactNode;
  onPress: (id: number) => void;
}) {
  const spoken = spokenSubtitle ?? subtitle;

  const card = variant === "card";

  const body = (
    <Pressable
      onPress={() => onPress(id)}
      style={({ pressed }) => [
        card ? styles.card : styles.row,
        menu !== undefined && styles.withMenu,
        pressed && (card ? styles.cardPressed : styles.pressed),
      ]}
      accessibilityRole="button"
      accessibilityLabel={spoken === null ? title : `${title}, ${spoken}`}
    >
      <Cover imageId={coverImageId} size="small" width={COVER_WIDTH} />

      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle === null ? null : (
          <Text style={styles.subtitle} numberOfLines={subtitleLines}>
            {subtitle}
          </Text>
        )}
      </View>

      {!card && menu === undefined ? (
        <SymbolView name="chevron.right" size={13} tintColor={PlatformColor("tertiaryLabel")} />
      ) : null}
    </Pressable>
  );

  if (menu === undefined) return body;

  // A sibling on top, not a child: a tap on the menu must not also open the game.
  return (
    <View style={card ? styles.cardSlot : undefined}>
      {body}
      {/* `box-none`: the strip above and below the button still opens the game. */}
      <View style={styles.menu} pointerEvents="box-none">
        {menu}
      </View>
    </View>
  );
});

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
  /** `flex: 1` so every card in a `GameGridRow` fills its slot and a row's
   * cards share the tallest one's height. */
  card: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
  },
  cardPressed: {
    backgroundColor: PlatformColor("tertiarySystemGroupedBackground"),
  },
  withMenu: { paddingRight: MENU_SIZE + 8 },
  /** Gives a wrapped card its `GameGridRow` slot, as the bare card's `flex: 1` does. */
  cardSlot: { flex: 1 },
  menu: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 4,
    width: MENU_SIZE,
    justifyContent: "center",
  },
  text: { flex: 1, gap: 2 },
  title: { ...Type.headline, color: PlatformColor("label") },
  subtitle: { ...Type.subheadline, color: PlatformColor("secondaryLabel") },
});
