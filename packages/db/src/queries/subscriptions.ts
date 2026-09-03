import { eq, sql } from "drizzle-orm";

import type { Queryable } from "../client.js";
import {
  subscriptionEvents,
  subscriptions,
  type PeriodTypeValue,
  type SubscriptionStoreValue,
} from "../schema/subscriptions.js";

export interface SubscriptionRow {
  userId: string;
  productId: string;
  store: SubscriptionStoreValue;
  periodType: PeriodTypeValue;
  purchasedAt: Date;
  expiresAt: Date | null;
  willRenew: boolean;
  sandbox: boolean;
  lastEventAtMs: number;
}

/** Verbatim, expired and sandbox rows included — judging it belongs in apps/api. */
export async function getSubscription(
  db: Queryable,
  userId: string,
): Promise<SubscriptionRow | null> {
  const rows = await db
    .select({
      userId: subscriptions.userId,
      productId: subscriptions.productId,
      store: subscriptions.store,
      periodType: subscriptions.periodType,
      purchasedAt: subscriptions.purchasedAt,
      expiresAt: subscriptions.expiresAt,
      willRenew: subscriptions.willRenew,
      sandbox: subscriptions.sandbox,
      lastEventAtMs: subscriptions.lastEventAtMs,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Refuses to apply behind a newer event. `>=`, not `>`: a redelivery of the
 * newest event must still apply, since a partial write looks like none.
 */
export async function upsertSubscription(db: Queryable, row: SubscriptionRow): Promise<void> {
  await db
    .insert(subscriptions)
    .values({ ...row, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        productId: row.productId,
        store: row.store,
        periodType: row.periodType,
        purchasedAt: row.purchasedAt,
        expiresAt: row.expiresAt,
        willRenew: row.willRenew,
        sandbox: row.sandbox,
        lastEventAtMs: row.lastEventAtMs,
        updatedAt: new Date(),
      },
      where: sql`${subscriptions.lastEventAtMs} <= ${row.lastEventAtMs}`,
    });
}

/** False when the event id was already stored — the webhook's idempotency check. */
export async function recordSubscriptionEvent(
  db: Queryable,
  // Null for an event that arrived after the account was deleted: the row is
  // kept for the revenue queries, without the person it belonged to.
  event: { id: string; userId: string | null; type: string; payload: unknown },
): Promise<boolean> {
  const inserted = await db
    .insert(subscriptionEvents)
    .values({
      id: event.id,
      userId: event.userId,
      type: event.type,
      payload: event.payload as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: subscriptionEvents.id })
    .returning({ id: subscriptionEvents.id });

  return inserted.length > 0;
}
