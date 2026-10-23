/** `undefined` means "not yet known" for both inputs, never "no". */
export type OnboardingDecision = "pending" | "show" | "complete";

export function onboardingDecision(
  hasSeen: boolean | undefined,
  isSignedIn: boolean | undefined,
): OnboardingDecision {
  if (hasSeen === undefined) return "pending";

  if (hasSeen) return "complete";

  if (isSignedIn === undefined) return "pending";

  return isSignedIn ? "complete" : "show";
}
