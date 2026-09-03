import { eq, sql } from "drizzle-orm";

import type { Queryable } from "../client.js";
import { users } from "../schema/backlog.js";
import { subscriptionEvents } from "../schema/subscriptions.js";

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
