import {
  FREE_ACTIVE_SLOTS,
  SLOT_CONSUMING_STATUSES,
  slotDelta,
  type BacklogStatus,
} from "@repo/contracts";
import {
  countBacklogEntriesByStatus,
  gameExists,
  getBacklogEntry,
  getSubscription,
  lockUser,
  upsertBacklogEntry,
  type BacklogEntry,
} from "@repo/db";

import { isPremium } from "../entitlement.js";
import type { Db } from "../types.js";

export type EntryWriteOutcome =
  | { kind: "saved"; entry: BacklogEntry; created: boolean }
  | { kind: "capped"; activeCount: number; toFree: number }
  | { kind: "unknown-game" };

export async function writeBacklogEntry(
  db: Db,
  input: { userId: string; gameId: number; status: BacklogStatus; rating?: number | null },
  now: Date,
): Promise<EntryWriteOutcome> {
  const { userId, gameId, status, rating } = input;

  if (!(await gameExists(db, gameId))) {
    return { kind: "unknown-game" };
  }

  return db.transaction(async (tx): Promise<EntryWriteOutcome> => {
    // The cap's whole mechanism, and it rests on READ COMMITTED: the row
    // lock serialises the racers, and the per-statement snapshot means the
    // loser's count below sees the winner's committed insert. Under
    // REPEATABLE READ the count would reuse the pre-lock snapshot, both
    // racers would read 9, and the cap would silently stop holding.
    await lockUser(tx, userId);

    const existing = await getBacklogEntry(tx, userId, gameId);
    const delta = slotDelta(existing?.status ?? null, status);

    // Only a slot-consuming transition can be blocked, so finishing or
    // re-rating a game costs no extra queries.
    if (delta > 0) {
      const subscription = await getSubscription(tx, userId);

      if (!isPremium(subscription, now)) {
        const activeCount = await countBacklogEntriesByStatus(tx, userId, SLOT_CONSUMING_STATUSES);

        if (activeCount + delta > FREE_ACTIVE_SLOTS) {
          // A lapsed subscriber can sit above the cap, where finishing a single
          // game frees nothing usable. Say how many it actually takes.
          return { kind: "capped", activeCount, toFree: activeCount - FREE_ACTIVE_SLOTS + 1 };
        }
      }
    }

    const { entry, created } = await upsertBacklogEntry(tx, { userId, gameId, status, rating });

    return { kind: "saved", entry, created };
  });
}
