import { PlatformColor, StyleSheet, useWindowDimensions, View } from "react-native";

import { Cover } from "@/components/cover";
import { Mascot } from "@/components/mascot";

import type { OnboardingCover } from "./covers";

/** Where each cover's centre sits, as fractions of the hero, and its tilt. */
const PLACEMENTS = [
  { x: 0.2, y: 0.2, rotate: "-9deg" },
  { x: 0.8, y: 0.16, rotate: "7deg" },
  { x: 0.1, y: 0.74, rotate: "6deg" },
  { x: 0.9, y: 0.7, rotate: "-8deg" },
] as const;

/** Wide enough for the layout on any iPhone, capped so iPad keeps the
 * phone composition instead of stretching it. */
const MAX_WIDTH = 360;

/**
 * The welcome screen's art: the mascot on a tile, with game covers tilted
 * around it. Height follows the window, so a short phone gives up hero before
 * the feature rows below it run out of room. A cover that never loads stays
 * `Cover`'s same-shaped placeholder.
 */
export function CoverHero({ covers }: { covers: readonly OnboardingCover[] }) {
  const window = useWindowDimensions();
  const width = Math.min(window.width - 32, MAX_WIDTH);
  const height = Math.round(Math.min(Math.max(window.height * 0.27, 150), 240));
  const coverWidth = Math.round(height * 0.27);
  const coverHeight = (coverWidth * 4) / 3;
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
  // Opaque, not a translucent fill: a cover that has not loaded reads as a
  // placeholder on a white background, and iOS can only draw the shadow from
  // the shape (no per-frame offscreen pass, no LogBox advice) over a solid one.
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
