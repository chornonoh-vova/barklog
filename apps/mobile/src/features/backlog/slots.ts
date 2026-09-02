import { FREE_ACTIVE_SLOTS, type BacklogStatsWire } from "@repo/contracts";

/** null when there is nothing to say — premium, or stats not loaded. */
export function slotsLabel(stats: BacklogStatsWire | undefined, premium: boolean): string | null {
  if (premium || stats === undefined) return null;

  const used = stats.counts.waiting + stats.counts.playing;

  if (used >= FREE_ACTIVE_SLOTS) return "All spots full — finish a game to free one";

  return `${used} of ${FREE_ACTIVE_SLOTS} spots used`;
}
