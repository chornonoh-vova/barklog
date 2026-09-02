import type { BacklogStatus } from "./backlog.js";

/** Unfinished games only — completing or abandoning one returns its slot. */
export const FREE_ACTIVE_SLOTS = 10;

export const SLOT_CONSUMING_STATUSES = ["waiting", "playing"] as const;

export type SlotConsumingStatus = (typeof SLOT_CONSUMING_STATUSES)[number];

function consumesSlot(status: BacklogStatus | null): boolean {
  return status !== null && (SLOT_CONSUMING_STATUSES as readonly string[]).includes(status);
}

/**
 * The cap applies to this, never to the total: finishing a game must succeed at
 * 10/10, and reopening one must not. `from` is null for a game not yet added.
 */
export function slotDelta(from: BacklogStatus | null, to: BacklogStatus): -1 | 0 | 1 {
  const before = consumesSlot(from);
  const after = consumesSlot(to);

  if (before === after) return 0;

  return after ? 1 : -1;
}

/** Duplicated in the db schema, where `pgEnum` needs the values. See status-parity. */
export const SUBSCRIPTION_STORES = ["app_store", "play_store", "stripe", "promotional"] as const;
export type SubscriptionStore = (typeof SUBSCRIPTION_STORES)[number];

export const PERIOD_TYPES = ["normal", "trial", "intro", "promotional"] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];
