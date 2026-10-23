import type { MeResponse } from "@repo/contracts";
import { getSubscription } from "@repo/db";
import type { Queryable, SubscriptionRow } from "@repo/db";

import { toEntitlement } from "./serialize.js";

/**
 * `sandbox` is deliberately absent: App Review buys in Apple's sandbox against
 * the production build, so refusing those entitlements shows a reviewer a
 * completed purchase and an unchanged paywall — a documented rejection.
 */
export function isPremium(row: SubscriptionRow | null, now: Date): boolean {
  if (row === null) return false;

  return row.expiresAt === null || row.expiresAt > now;
}

/** The one place `/me` and `/subscription/refresh` build their response, so they cannot drift. */
export async function readEntitlement(
  db: Queryable,
  userId: string,
  now: Date,
): Promise<MeResponse> {
  const row = await getSubscription(db, userId);

  return {
    premium: isPremium(row, now),
    entitlement: row === null ? null : toEntitlement(row),
  };
}
