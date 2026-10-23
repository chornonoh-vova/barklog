import type { BacklogStatus } from "@repo/contracts";

/**
 * A status change is the one backlog edit worth a haptic: it is the decision
 * the app exists to record. A rating-only edit arrives with the status
 * unchanged and stays quiet. `undefined` — neither the game's page nor the list
 * was cached, so the old status is unknown — still plays, because a status was
 * picked on purpose.
 */
export function shouldPlayStatusHaptic(
  previous: BacklogStatus | null | undefined,
  next: BacklogStatus,
): boolean {
  return previous !== next;
}
