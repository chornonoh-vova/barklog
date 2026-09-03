import { bigint, boolean, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./backlog.js";

/** Duplicated in `packages/contracts` — see the parity test. */
export const SUBSCRIPTION_STORES = ["app_store", "play_store", "stripe", "promotional"] as const;
export type SubscriptionStoreValue = (typeof SUBSCRIPTION_STORES)[number];

export const PERIOD_TYPES = ["normal", "trial", "intro", "promotional"] as const;
export type PeriodTypeValue = (typeof PERIOD_TYPES)[number];

export const subscriptionStore = pgEnum("subscription_store", SUBSCRIPTION_STORES);
export const periodType = pgEnum("subscription_period_type", PERIOD_TYPES);

export const subscriptions = pgTable("subscriptions", {
  // The Clerk `sub`, which is also the RevenueCat App User ID — so no mapping.
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(),
  store: subscriptionStore("store").notNull(),
  periodType: periodType("period_type").notNull(),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull(),
  // null is a lifetime entitlement, not an unknown expiry.
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  willRenew: boolean("will_renew").notNull(),
  // Never an input to entitlement — see isPremium. It exists so revenue
  // queries can filter our own device testing out.
  sandbox: boolean("sandbox").notNull(),
  // Ordering guard: RevenueCat retries and can deliver out of order, so a
  // retried INITIAL_PURCHASE after a CANCELLATION must not resurrect the row.
  lastEventAtMs: bigint("last_event_at_ms", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionEvents = pgTable("subscription_events", {
  // The RevenueCat event id, so ON CONFLICT DO NOTHING is the idempotency check.
  id: text("id").primaryKey(),
  // Not a foreign key: an event for an unknown user is worth logging. Nullable
  // because account deletion scrubs the identifier while keeping the row —
  // revenue queries outlive the account. See queries/users.ts.
  userId: text("user_id"),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});
