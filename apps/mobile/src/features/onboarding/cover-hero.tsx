import { SymbolView } from "expo-symbols";
import { PlatformColor, StyleSheet, useWindowDimensions, View } from "react-native";

import { Cover } from "@/components/cover";
import { Mascot } from "@/components/mascot";
import { Brand, COVER_ASPECT } from "@/ui/theme";

import type { OnboardingCover } from "./covers";

/** Cover centres as fractions of the hero, with their tilt. */
const PLACEMENTS = [
  { x: 0.17, y: 0.17, rotate: "-10deg" },
  { x: 0.83, y: 0.15, rotate: "9deg" },
  { x: 0.07, y: 0.52, rotate: "7deg" },
  { x: 0.93, y: 0.5, rotate: "-7deg" },
  { x: 0.2, y: 0.86, rotate: "-6deg" },
  { x: 0.8, y: 0.84, rotate: "5deg" },
] as const;
const MASCOT_CENTER_Y = 0.4;
const GAMEPAD_CENTER_Y = 0.86;

/** Capped so iPad keeps the phone composition. */
const MAX_WIDTH = 360;

/** Height follows the window, so short phones shrink the hero before the rows. */
export function CoverHero({ covers }: { covers: readonly OnboardingCover[] }) {
  const window = useWindowDimensions();
  const width = Math.min(window.width - 32, MAX_WIDTH);
  const height = Math.round(Math.min(Math.max(window.height * 0.3, 170), 260));
  const coverWidth = Math.round(height * 0.2);
  const coverHeight = coverWidth / COVER_ASPECT;
  const mascot = Math.round(height * 0.6);
  const gamepad = Math.round(height * 0.14);

  return (
    <View
      style={{ width, height }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {PLACEMENTS.map((placement, index) => {
        const cover = covers[index];
        if (cover === undefined) return null;

        return (
          <View
            key={cover.coverImageId}
            style={[
              styles.cover,
              {
                left: placement.x * width - coverWidth / 2,
                top: placement.y * height - coverHeight / 2,
                transform: [{ rotate: placement.rotate }],
              },
            ]}
          >
            <Cover imageId={cover.coverImageId} size="big" width={coverWidth} />
          </View>
        );
      })}
      <View
        style={[
          styles.absolute,
          { left: (width - mascot) / 2, top: MASCOT_CENTER_Y * height - mascot / 2 },
        ]}
      >
        <Mascot illustration="default" size={mascot} />
      </View>
      <View
        style={[
          styles.absolute,
          styles.gamepad,
          { left: (width - gamepad) / 2, top: GAMEPAD_CENTER_Y * height - gamepad / 2 },
        ]}
      >
        <SymbolView name="gamecontroller.fill" size={gamepad} tintColor={Brand.tint} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Opaque: iOS can only shadow a solid shape cheaply, and an unloaded cover
  // still shows as a placeholder on white.
  cover: {
    position: "absolute",
    borderRadius: 6,
    backgroundColor: PlatformColor("secondarySystemBackground"),
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  absolute: { position: "absolute" },
  gamepad: { transform: [{ rotate: "-12deg" }] },
});
