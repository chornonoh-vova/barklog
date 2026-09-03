import { eq, sql } from "drizzle-orm";

import type { Queryable } from "../client.js";
import { deletedUsers, users } from "../schema/backlog.js";
import { subscriptionEvents } from "../schema/subscriptions.js";

/**
 * The keep-list, named once so the two implementations of it below have
 * something a test can hold them both to. It cannot be interpolated into the
 * SQL — that statement names each key twice, as a literal and as a path — so
 * `test/scrub-parity.test.ts` asserts the two agree instead.
 */
export const SCRUBBED_EVENT_KEYS = [
  "product_id",
  "store",
  "period_type",
  "purchased_at_ms",
  "expiration_at_ms",
  "environment",
] as const;

/**
 * `backlog_entries` and `subscriptions` both declare `onDelete: cascade` on
 * `users.id`, so this one statement clears them too. False for an absent user:
 * a redelivered `user.deleted` must succeed, not throw.
 */
export async function deleteUser(db: Queryable, userId: string): Promise<boolean> {
  const deleted = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });

  return deleted.length > 0;
}

/**
 * Keeps the row — revenue queries outlive the account, and `subscription_events`
 * is deliberately not a foreign key — while removing what identifies a person.
 *
 * A keep-list, not a drop-list: RevenueCat adds fields without warning, and a
 * drop-list would retain every future addition. `jsonb_strip_nulls` removes the
 * keys whose source field was absent, so a lifetime purchase loses its null
 * `expiration_at_ms` rather than storing a JSON null.
 */
export async function scrubSubscriptionEvents(db: Queryable, userId: string): Promise<number> {
  const scrubbed = await db
    .update(subscriptionEvents)
    .set({
      userId: null,
      payload: sql`jsonb_strip_nulls(jsonb_build_object(
        'product_id',      ${subscriptionEvents.payload} -> 'product_id',
        'store',           ${subscriptionEvents.payload} -> 'store',
        'period_type',     ${subscriptionEvents.payload} -> 'period_type',
        'purchased_at_ms', ${subscriptionEvents.payload} -> 'purchased_at_ms',
        'expiration_at_ms',${subscriptionEvents.payload} -> 'expiration_at_ms',
        'environment',     ${subscriptionEvents.payload} -> 'environment'
      ))`,
    })
    .where(eq(subscriptionEvents.userId, userId))
    .returning({ id: subscriptionEvents.id });

  return scrubbed.length;
}

/**
 * The same keep-list applied before a row is written rather than after. An
 * event that arrives once the account is gone has nothing to update afterwards,
 * so it is reduced on the way in. Absent and null fields are dropped rather
 * than stored as JSON null, which is what `jsonb_strip_nulls` does above.
 */
export function scrubEventPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const scrubbed: Record<string, unknown> = {};

  for (const key of SCRUBBED_EVENT_KEYS) {
    const value = payload[key];

    if (value !== undefined && value !== null) scrubbed[key] = value;
  }

  return scrubbed;
}

/**
 * Outlives the `users` row it replaces. Idempotent, because Clerk redelivers
 * and a redelivery must not be the thing that fails the transaction.
 */
export async function recordUserDeletion(db: Queryable, userId: string): Promise<void> {
  await db
    .insert(deletedUsers)
    .values({ id: userId })
    .onConflictDoNothing({ target: deletedUsers.id });
}

/** Asked of every RevenueCat event, so that none of them can recreate the user. */
export async function isUserDeleted(db: Queryable, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: deletedUsers.id })
    .from(deletedUsers)
    .where(eq(deletedUsers.id, userId))
    .limit(1);

  return rows.length > 0;
}
