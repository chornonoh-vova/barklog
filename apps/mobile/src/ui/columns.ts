/**
 * Layout decisions for wide windows: iPad, iPad Split View, iPhone landscape
 * and iPhone Duo's inner display. Every input is a width the caller measured —
 * never a device idiom or orientation, which Apple's iPhone Duo guidance rules
 * out — so the same numbers hold when a window is resized live.
 */

import { ACCESSIBILITY_FONT_SCALE } from "@/ui/text-size";

/** Narrowest a card may get before it drops a column. */
const CARD_MIN_WIDTH = 320;

/** Outer margin, matching the 16pt list inset used everywhere else. */
export const GUTTER = 16;

export const COLUMN_GAP = 12;

/** More than three cards of row content stop reading as a list. */
export const MAX_COLUMNS = 3;

/** Text grows cards up to this scale; past it, AX sizes would force one column
 * even on a 13-inch iPad. */
const MAX_TEXT_SCALE = ACCESSIBILITY_FONT_SCALE;

export const DETAIL_SPLIT_MIN_WIDTH = 700;

export const SHEET_MIN_WIDTH = 700;

const usable = (value: number) => Number.isFinite(value) && value > 0;

const textScale = (fontScale: number) =>
  usable(fontScale) ? Math.min(fontScale, MAX_TEXT_SCALE) : 1;

/** How many cards fit side by side in `width` points. */
export function columnCount(width: number, fontScale: number): number {
  if (!usable(width)) return 1;

  const card = CARD_MIN_WIDTH * textScale(fontScale);
  const fit = Math.floor((width - 2 * GUTTER + COLUMN_GAP) / (card + COLUMN_GAP));

  return Math.min(Math.max(fit, 1), MAX_COLUMNS);
}

/** Splits `items` into rows of `columns`; the last row may be short. */
export function chunk<T>(items: readonly T[], columns: number): T[][] {
  const size = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];

  for (let start = 0; start < items.length; start += size) {
    rows.push(items.slice(start, start + size));
  }

  return rows;
}

/** Whether the game detail has room for its two-column layout. */
export function detailIsSplit(width: number, fontScale: number): boolean {
  return usable(width) && width >= DETAIL_SPLIT_MIN_WIDTH * textScale(fontScale);
}

/** Whether a modal should be a page sheet rather than cover the window. */
export function prefersSheet(windowWidth: number): boolean {
  return usable(windowWidth) && windowWidth >= SHEET_MIN_WIDTH;
}

/** The width content can use once the side safe-area insets are taken out: the
 * Dynamic Island in iPhone landscape, and the asymmetric insets of iPhone Duo. A
 * vertical scroll view's `contentInsetAdjustmentBehavior` only pads the
 * scrolling axis, so the sides are ours to handle. */
export function contentWidth(width: number, left: number, right: number): number {
  return Math.max(0, width - left - right);
}
