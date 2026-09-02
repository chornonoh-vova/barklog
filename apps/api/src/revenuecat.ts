import { createHmac, timingSafeEqual } from "node:crypto";

import { REVENUECAT_PERIOD_MAP, REVENUECAT_STORE_MAP, type RevenueCatEvent } from "@repo/contracts";
import type { SubscriptionRow } from "@repo/db";

/** Length check first: `timingSafeEqual` throws on a mismatch. */
function constantTimeEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

export function secretMatches(header: string | undefined, secret: string): boolean {
  return header !== undefined && constantTimeEquals(header, secret);
}

/**
 * `X-RevenueCat-Webhook-Signature: t=<unix>,v1=<hmac_sha256_hex>`, computed over
 * `${t}.${rawBody}`.
 *
 * `rawBody` must be the bytes as received. Re-serialising a parsed object
 * changes them, and every legitimate request then fails — uniformly, so it
 * reads as a wrong secret rather than a bytes problem.
 */
export function signatureMatches(
  header: string | undefined,
  rawBody: string,
  secret: string,
): boolean {
  if (header === undefined) return false;

  const parts = new Map(
    header.split(",").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()] as const;
    }),
  );

  const timestamp = parts.get("t");
  const provided = parts.get("v1");
  if (timestamp === undefined || provided === undefined) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

  return constantTimeEquals(provided, expected);
}

/** null when the event carries no subscription state — blanking a real purchase. */
export function toSubscriptionRow(event: RevenueCatEvent): SubscriptionRow | null {
  if (
    event.product_id === undefined ||
    event.store === undefined ||
    event.period_type === undefined ||
    event.purchased_at_ms === undefined
  ) {
    return null;
  }

  return {
    userId: event.app_user_id,
    productId: event.product_id,
    store: REVENUECAT_STORE_MAP[event.store],
    periodType: REVENUECAT_PERIOD_MAP[event.period_type],
    purchasedAt: new Date(event.purchased_at_ms),
    // Absent and null both mean "does not expire".
    expiresAt:
      event.expiration_at_ms === undefined || event.expiration_at_ms === null
        ? null
        : new Date(event.expiration_at_ms),
    // Auto-renew off. The entitlement still stands until expiry — see isPremium.
    willRenew: event.cancel_reason === undefined || event.cancel_reason === null,
    sandbox: event.environment === "SANDBOX",
    lastEventAtMs: event.event_timestamp_ms,
  };
}
