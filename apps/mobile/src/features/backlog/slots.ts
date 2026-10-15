import { FREE_ACTIVE_SLOTS, SLOT_CONSUMING_STATUSES, type BacklogStatsWire } from "@repo/contracts";

import { i18n } from "@/i18n/instance";

/**
 * The server counts with `SLOT_CONSUMING_STATUSES`; derive from the same
 * constant rather than restating `waiting + playing`, so making a status
 * slot-consuming moves both sides at once.
 */
export function activeSlotsUsed(stats: BacklogStatsWire): number {
  return SLOT_CONSUMING_STATUSES.reduce((used, status) => used + stats.counts[status], 0);
}

/** null when there is nothing to say — premium, or stats not loaded. */
export function slotsLabel(stats: BacklogStatsWire | undefined, premium: boolean): string | null {
  if (premium || stats === undefined) return null;

  const used = activeSlotsUsed(stats);

  if (used >= FREE_ACTIVE_SLOTS) return i18n.t("backlog.slotsFull");

  return i18n.t("backlog.slotsUsed", { used, total: FREE_ACTIVE_SLOTS });
}
