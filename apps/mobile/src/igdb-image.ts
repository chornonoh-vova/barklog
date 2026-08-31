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

export function screenshotUrl(imageId: string): string {
  return `${BASE}/t_screenshot_med_2x/${imageId}.jpg`;
}
