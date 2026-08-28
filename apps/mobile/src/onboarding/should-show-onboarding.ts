/**
 * Pure and named so it is testable: the two cases that matter — a reinstall
 * whose Clerk session outlived its AsyncStorage, and a storage read still in
 * flight — are both awkward to reach in a simulator and easy to get wrong.
 *
 * `undefined` means "not yet known" for both inputs, never "no". `hasSeen` is
 * unknown until AsyncStorage answers; `isSignedIn` is unknown until Clerk has
 * read the keychain.
 */
export type OnboardingDecision =
  /** Render nothing. The splash is still up. */
  | "pending"
  /** Render the pages. */
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
