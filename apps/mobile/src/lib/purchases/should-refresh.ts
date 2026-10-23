/** Exactly as created in RevenueCat — not `premium`, not `ad_free`. */
export const PREMIUM_ENTITLEMENT = "barklog_premium";

/**
 * `addCustomerInfoUpdateListener` does not fire on attach — registering only
 * appends to an array, and every firing comes from the native emitter — so the
 * first CustomerInfo we see is whatever the SDK pushes next, including its
 * foreground cache refresh. Each firing would otherwise cost an authenticated
 * POST, an outbound RevenueCat call and an upsert, which would make the 10/min
 * `refresh` rate limit load-bearing for normal use. Only a change in the
 * entitlement is worth a refresh.
 *
 * `undefined` is a comparison nothing has seeded yet — a fresh launch, or an
 * identity change — so it spends no refresh. The deliberate events belong to
 * the paywall sheet instead: its `onPurchaseCompleted` and `onRestoreCompleted`
 * call `refreshSubscription` themselves, which is also the client's only route
 * back from a webhook that never landed. This listener exists for the changes
 * that happen outside the sheet.
 */
export function entitlementChanged(previous: boolean | undefined, current: boolean): boolean {
  return previous !== undefined && previous !== current;
}
