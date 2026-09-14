import type { ShareSourceWire } from "@repo/contracts";

const THUMB_HEIGHT = 64;
const DEFAULT_RATIO = 16 / 9;
const MIN_RATIO = 0.5;
const MAX_RATIO = 1.8;

/**
 * Height fixed, width left to Yoga's `aspectRatio`. A bare height gives a
 * zero-width view: layout runs before the image decodes, and expo-image fills
 * the box it is given rather than reporting an intrinsic size back into
 * layout. `aspectRatio` makes the width deterministic up front, so the row
 * does not reflow when the image lands, and the placeholder branch (no image
 * at all) gets an identical box.
 */
export function sourceThumbSize(source: ShareSourceWire): { height: number; aspectRatio: number } {
  const { thumbnailWidth: width, thumbnailHeight: height } = source;

  if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) {
    return { height: THUMB_HEIGHT, aspectRatio: DEFAULT_RATIO };
  }

  return {
    height: THUMB_HEIGHT,
    aspectRatio: Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height)),
  };
}
