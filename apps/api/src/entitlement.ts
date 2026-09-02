import type { SubscriptionRow } from "@repo/db";

/**
 * `sandbox` is deliberately absent: App Review buys in Apple's sandbox against
 * the production build, so refusing those entitlements shows a reviewer a
 * completed purchase and an unchanged paywall — a documented rejection.
 */
export function isPremium(row: SubscriptionRow | null, now: Date): boolean {
  if (row === null) return false;

  return row.expiresAt === null || row.expiresAt > now;
}
