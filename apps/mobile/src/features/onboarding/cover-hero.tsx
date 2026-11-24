import { PlatformColor, StyleSheet, useWindowDimensions, View } from "react-native";

import { Cover } from "@/components/cover";
import { Mascot } from "@/components/mascot";
import { COVER_ASPECT } from "@/ui/theme";

import type { OnboardingCover } from "./covers";

/** Cover centres as fractions of the hero, with their tilt. */
const PLACEMENTS = [
  { x: 0.2, y: 0.2, rotate: "-9deg" },
  { x: 0.8, y: 0.16, rotate: "7deg" },
  { x: 0.1, y: 0.74, rotate: "6deg" },
  { x: 0.9, y: 0.7, rotate: "-8deg" },
] as const;

/** Capped so iPad keeps the phone composition. */
const MAX_WIDTH = 360;

/** Height follows the window, so short phones shrink the hero before the rows. */
export function CoverHero({ covers }: { covers: readonly OnboardingCover[] }) {
  const window = useWindowDimensions();
  const width = Math.min(window.width - 32, MAX_WIDTH);
  const height = Math.round(Math.min(Math.max(window.height * 0.27, 150), 240));
  const coverWidth = Math.round(height * 0.27);
  const coverHeight = coverWidth / COVER_ASPECT;
  const tile = Math.round(height * 0.5);

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
          styles.tile,
          { width: tile, height: tile, left: (width - tile) / 2, top: (height - tile) / 2 },
        ]}
      >
        <Mascot illustration="default" size={Math.round(tile * 0.82)} />
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
  tile: {
    position: "absolute",
    borderRadius: 28,
    borderCurve: "continuous",
    backgroundColor: PlatformColor("secondarySystemBackground"),
    alignItems: "center",
    justifyContent: "center",
  },
});
