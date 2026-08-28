/**
 * Pure and testable: the awkward cases — a reinstall whose Clerk session
 * outlived its AsyncStorage, and a read still in flight — are hard to reach in a
 * simulator. `undefined` means "not yet known" for both inputs, never "no".
 */
export type OnboardingDecision =
  /** Render nothing. The splash is still up. */
  | "pending"
  | "show"
  /** Hand off to the auth gate. */
  | "complete";

export function onboardingDecision(
  hasSeen: boolean | undefined,
  isSignedIn: boolean | undefined,
): OnboardingDecision {
  if (hasSeen === undefined) return "pending";

  // Deliberately before the Clerk check: the common launch must not be held
  // waiting on a session state it does not need.
  if (hasSeen) return "complete";

  if (isSignedIn === undefined) return "pending";

  // An existing session means an existing account, and nobody makes an account
  // without having seen what the app is. The caller persists this.
  return isSignedIn ? "complete" : "show";
}
