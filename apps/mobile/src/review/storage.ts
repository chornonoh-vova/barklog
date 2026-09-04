import AsyncStorage from "@react-native-async-storage/async-storage";

/** AsyncStorage, matching `onboarding/storage.ts`: a reinstall is a fresh
 * relationship with the app, so the flag should not survive one. */
const KEY = "barklog.review.asked";

/** A failed read resolves to `true` (asked), deliberately, and for the opposite
 * reason to onboarding's default: iOS grants three prompts a year and drops the
 * rest silently, so spending one on a storage error is worse than staying quiet
 * and asking on a later launch. */
export async function readHasAskedForReview(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) !== null;
  } catch {
    return true;
  }
}

/** Never rejects: the caller marks before prompting and must not be derailed. */
export async function markAskedForReview(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, "1");
  } catch {
    // Ignored: see above.
  }
}
