import * as v from "valibot";

import type { PERIOD_TYPES, SUBSCRIPTION_STORES } from "./subscription.js";

/** Uppercase on the wire; our enums are lowercase — hence the maps below. */
export const REVENUECAT_STORES = [
  "APP_STORE",
  "MAC_APP_STORE",
  "PLAY_STORE",
  "STRIPE",
  "PROMOTIONAL",
] as const;

export const REVENUECAT_PERIOD_TYPES = ["NORMAL", "TRIAL", "INTRO", "PROMOTIONAL"] as const;

/**
 * `v.object`, not `v.strictObject`: RevenueCat adds fields without warning, and
 * a strict schema would turn every addition into a 422 and a retry storm.
 */
export const revenueCatEventSchema = v.object({
  event: v.object({
    id: v.pipe(v.string(), v.minLength(1)),
    type: v.pipe(v.string(), v.minLength(1)),
    app_user_id: v.pipe(v.string(), v.minLength(1)),
    event_timestamp_ms: v.number(),
    // Absent on TRANSFER and SUBSCRIBER_ALIAS.
    product_id: v.optional(v.string()),
    store: v.optional(v.picklist(REVENUECAT_STORES)),
    period_type: v.optional(v.picklist(REVENUECAT_PERIOD_TYPES)),
    purchased_at_ms: v.optional(v.number()),
    // null for a lifetime purchase.
    expiration_at_ms: v.optional(v.nullable(v.number())),
    cancel_reason: v.optional(v.nullable(v.string())),
    environment: v.optional(v.picklist(["SANDBOX", "PRODUCTION"])),
  }),
});

export type RevenueCatEvent = v.InferOutput<typeof revenueCatEventSchema>["event"];

export const REVENUECAT_STORE_MAP: Record<
  (typeof REVENUECAT_STORES)[number],
  (typeof SUBSCRIPTION_STORES)[number]
> = {
  APP_STORE: "app_store",
  MAC_APP_STORE: "app_store",
  PLAY_STORE: "play_store",
  STRIPE: "stripe",
  PROMOTIONAL: "promotional",
};

export const REVENUECAT_PERIOD_MAP: Record<
  (typeof REVENUECAT_PERIOD_TYPES)[number],
  (typeof PERIOD_TYPES)[number]
> = {
  NORMAL: "normal",
  TRIAL: "trial",
  INTRO: "intro",
  PROMOTIONAL: "promotional",
};
