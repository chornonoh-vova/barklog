import * as StoreReview from "expo-store-review";

/**
 * The Profile tab's "Rate on the App Store" link: the App Store page from
 * `ios.appStoreUrl` in `app.json` (read by `StoreReview.storeUrl()`), opened
 * on the review composer. `null` when the build carries no store URL, and the
 * row is then left out.
 *
 * A link, not `StoreReview.requestReview()`: Apple forbids asking for the
 * system prompt from a button, and the system may silently show nothing. The
 * automatic prompt stays with `useReviewPrompt`.
 */
export function appStoreReviewUrl(): string | null {
  const store = StoreReview.storeUrl();
  if (!store) return null;

  const url = new URL(store);
  url.searchParams.set("action", "write-review");
  return url.toString();
}
