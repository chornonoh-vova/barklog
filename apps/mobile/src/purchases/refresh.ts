import type { Endpoints } from "@/api/endpoints";

/**
 * Two attempts, not more: this runs on user-initiated events only, so it must
 * stay well clear of the 10/min `refresh` rate limit.
 */
const REFRESH_ATTEMPTS = 2;
const REFRESH_RETRY_MS = 2_000;

/**
 * Asks the server to re-read RevenueCat, retrying once and never rethrowing.
 *
 * Shared by the provider's entitlement listener and the paywall sheet's
 * purchase and restore callbacks, because a rejection has nowhere to go in
 * either: one runs inside a native listener callback, the other outlives its
 * component. Swallowing it silently would be worse, though — this POST is the
 * only way a subscription whose webhook never landed reaches our database, so a
 * failure here is why a paying user is still on the free tier.
 */
export async function refreshSubscription(
  api: Pick<Endpoints, "refreshSubscription">,
): Promise<void> {
  for (let attempt = 1; attempt <= REFRESH_ATTEMPTS; attempt += 1) {
    try {
      await api.refreshSubscription();
      return;
    } catch (error) {
      if (__DEV__) {
        console.warn(`refreshSubscription attempt ${attempt} failed`, error);
      }

      if (attempt < REFRESH_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, REFRESH_RETRY_MS));
      }
    }
  }
}
