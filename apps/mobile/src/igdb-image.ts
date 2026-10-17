/** `_2x` is the retina variant every iPhone needs. */
const BASE = "https://images.igdb.com/igdb/image/upload";

export type CoverSize = "small" | "big";

const COVER_TRANSFORMS: Record<CoverSize, string> = {
  small: "t_cover_small_2x",
  big: "t_cover_big_2x",
};

export function coverUrl(imageId: string | null, size: CoverSize): string | null {
  if (imageId === null) return null;

  return `${BASE}/${COVER_TRANSFORMS[size]}/${imageId}.jpg`;
}

export type ScreenshotSize = "med" | "huge";

/** `huge` is for the full-screen viewer; `med` is visibly soft there, and
 * `t_1080p_2x` is past any iPhone and paid for on cellular. */
const SCREENSHOT_TRANSFORMS: Record<ScreenshotSize, string> = {
  med: "t_screenshot_med_2x",
  huge: "t_screenshot_huge_2x",
};

export function screenshotUrl(imageId: string, size: ScreenshotSize): string {
  return `${BASE}/${SCREENSHOT_TRANSFORMS[size]}/${imageId}.jpg`;
}
