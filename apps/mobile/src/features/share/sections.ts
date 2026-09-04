import type { GameSummaryWire, ShareBasis } from "@repo/contracts";

/**
 * Kept free of react-native for the same reason as `empty-states.ts`: the copy
 * and the grouping are the parts worth testing, and they stay runnable in
 * plain Node.
 */
export interface ShareSection {
  /** `null` renders no header — see `toShareSections` on why `unavailable` gets none. */
  title: string | null;
  data: GameSummaryWire[];
}

/**
 * At most one section, because the extraction stops at the first tier that
 * applies. A `SectionList` is still the right shape: the header is what makes
 * the assumption visible, and it stays put while the results scroll.
 */
export function toShareSections(
  basis: ShareBasis,
  items: GameSummaryWire[],
  author: string | null,
): ShareSection[] {
  if (items.length === 0 || basis === "none") return [];

  const title =
    basis === "title"
      ? "Matches for the video title"
      : basis === "channel"
        ? (author ?? "This channel") + "'s usual games"
        : // `unavailable` has the same rows a `title` basis would, but a header
        // would claim a match the server disclaimed. The orange notice above
        // the list explains these instead.
        null;

  return [{ title, data: items }];
}
