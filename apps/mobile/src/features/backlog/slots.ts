import {
  FREE_ACTIVE_SLOTS,
  SLOT_CONSUMING_STATUSES,
  type BacklogListItemWire,
  type BacklogStatus,
} from "@repo/contracts";

import { i18n } from "@/lib/i18n/instance";

export function countStatus(items: readonly BacklogListItemWire[], status: BacklogStatus): number {
  return items.filter((item) => item.status === status).length;
}

/**
 * The server counts with `SLOT_CONSUMING_STATUSES`; derive from the same
 * constant rather than restating `waiting + playing`, so making a status
 * slot-consuming moves both sides at once.
 */
export function activeSlotsUsed(items: readonly BacklogListItemWire[]): number {
  return SLOT_CONSUMING_STATUSES.reduce((used, status) => used + countStatus(items, status), 0);
}

/** null when there is nothing to say — premium, or the list not loaded. */
export function slotsLabel(
  items: readonly BacklogListItemWire[] | undefined,
  premium: boolean,
): string | null {
  if (premium || items === undefined) return null;

  const used = activeSlotsUsed(items);

  if (used >= FREE_ACTIVE_SLOTS) return i18n.t("backlog.slotsFull");

  return i18n.t("backlog.slotsUsed", { used, total: FREE_ACTIVE_SLOTS });
}
