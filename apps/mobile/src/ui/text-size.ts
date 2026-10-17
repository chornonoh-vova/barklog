/** Just under iOS's first accessibility size (AX1 reports ~1.65); every
 * standard size, up to xxxLarge at ~1.35, stays below it. */
export const ACCESSIBILITY_FONT_SCALE = 1.6;

/** The HIG asks horizontal layouts to stack at these sizes so text gets the
 * full width. */
export function isAccessibilitySize(fontScale: number): boolean {
  return Number.isFinite(fontScale) && fontScale >= ACCESSIBILITY_FONT_SCALE;
}
