import * as StoreReview from "expo-store-review";

/** A link, not `requestReview()`: Apple forbids the system prompt from a button. */
export function appStoreReviewUrl(): string | null {
  const store = StoreReview.storeUrl();
  if (!store) return null;

  const url = new URL(store);
  url.searchParams.set("action", "write-review");
  return url.toString();
}
