/** Exactly as created in RevenueCat — not `premium`, not `ad_free`. */
export const PREMIUM_ENTITLEMENT = "barklog_premium";

/**
 * `addCustomerInfoUpdateListener` fires on attach and on every CustomerInfo
 * refresh, the SDK's foreground cache refresh included, and each firing would
 * otherwise cost an authenticated POST, an outbound RevenueCat call and an
 * upsert — which would make the 10/min `refresh` rate limit load-bearing for
 * normal use. Only a change in the entitlement is worth a refresh.
 *
 * `undefined` is the attach firing: nothing has changed yet, so it only seeds
 * the comparison. The paywall sheet's own callbacks cover the two deliberate
 * events; this listener exists for changes that happen outside it.
 */
export function entitlementChanged(previous: boolean | undefined, current: boolean): boolean {
  return previous !== undefined && previous !== current;
}
