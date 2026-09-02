import { createHmac, timingSafeEqual } from "node:crypto";

import { REVENUECAT_PERIOD_MAP, REVENUECAT_STORE_MAP, type RevenueCatEvent } from "@repo/contracts";
import type { SubscriptionRow } from "@repo/db";

import type { RevenueCatClient } from "./types.js";

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

const SUBSCRIBERS_URL = "https://api.revenuecat.com/v1/subscribers";

export const PREMIUM_ENTITLEMENT = "barklog_premium";

interface SubscriberResponse {
  subscriber?: {
    entitlements?: Record<
      string,
      { product_identifier?: string; purchase_date?: string; expires_date?: string | null }
    >;
    subscriptions?: Record<
      string,
      {
        store?: string;
        period_type?: string;
        purchase_date?: string;
        expires_date?: string | null;
        unsubscribe_detected_at?: string | null;
        is_sandbox?: boolean;
      }
    >;
  };
}

export function createRevenueCatClient(apiKey: string): RevenueCatClient {
  return {
    async fetchSubscriber(appUserId) {
      const response = await fetch(`${SUBSCRIBERS_URL}/${encodeURIComponent(appUserId)}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`RevenueCat answered ${response.status}`);
      }

      const body = (await response.json()) as SubscriberResponse;
      const entitlement = body.subscriber?.entitlements?.[PREMIUM_ENTITLEMENT];
      const productId = entitlement?.product_identifier;

      if (entitlement === undefined || productId === undefined) return null;

      const subscription = body.subscriber?.subscriptions?.[productId];

      return {
        userId: appUserId,
        productId,
        // Defaults for a promotional grant made in the RevenueCat dashboard,
        // which carries an entitlement but no store subscription. The app is
        // iOS-only, so app_store is the honest guess; "normal" is the period
        // that does not claim a trial the user may not actually have.
        store:
          REVENUECAT_STORE_MAP[
            (subscription?.store?.toUpperCase() ?? "APP_STORE") as keyof typeof REVENUECAT_STORE_MAP
          ],
        periodType:
          REVENUECAT_PERIOD_MAP[
            (subscription?.period_type?.toUpperCase() ??
              "NORMAL") as keyof typeof REVENUECAT_PERIOD_MAP
          ],
        // The entitlement's own purchase_date is the trustworthy source; a
        // subscription block, when present, carries the same fact and is a
        // fallback for older payloads. Never fabricate "purchased right now".
        purchasedAt: new Date(
          entitlement.purchase_date ?? subscription?.purchase_date ?? Date.now(),
        ),
        expiresAt: entitlement.expires_date ? new Date(entitlement.expires_date) : null,
        // Unknown renewal is treated as "will not renew": a false negative on
        // the paywall is harmless, a false positive tells the app a lapsing
        // subscription is healthy.
        willRenew: subscription === undefined ? false : !subscription.unsubscribe_detected_at,
        sandbox: subscription?.is_sandbox ?? false,
        // The freshest answer available, so it must beat the staleness guard.
        lastEventAtMs: Date.now(),
      };
    },
  };
}
