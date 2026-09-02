import { FREE_ACTIVE_SLOTS, slotDelta, type BacklogStatus } from "@repo/contracts";

/**
 * An unknown `activeCount` or `premium` returns false on purpose: guessing
 * would refuse a legitimate add while `/me` and the stats load — and an unknown
 * entitlement guessed as "free" would refuse a paying user outright. The
 * server's 402 is the backstop for both.
 */
export function wouldExceedSlots(input: {
  premium: boolean | undefined;
  activeCount: number | undefined;
  from: BacklogStatus | null;
  to: BacklogStatus;
}): boolean {
  if (input.premium !== false || input.activeCount === undefined) return false;

  const delta = slotDelta(input.from, input.to);
  if (delta <= 0) return false;

  return input.activeCount + delta > FREE_ACTIVE_SLOTS;
}
