import { FREE_ACTIVE_SLOTS, slotDelta, type BacklogStatus } from "@repo/contracts";

/**
 * An unknown `activeCount` returns false on purpose: guessing would refuse a
 * legitimate add while stats load, and the 402 handler is the backstop.
 */
export function wouldExceedSlots(input: {
  premium: boolean;
  activeCount: number | undefined;
  from: BacklogStatus | null;
  to: BacklogStatus;
}): boolean {
  if (input.premium || input.activeCount === undefined) return false;

  const delta = slotDelta(input.from, input.to);
  if (delta <= 0) return false;

  return input.activeCount + delta > FREE_ACTIVE_SLOTS;
}
