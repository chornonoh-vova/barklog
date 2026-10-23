/**
 * Completions, not additions: adding is one tap from Search, Explore or the
 * share extension, so a keen user can pile up dozens on install day. Finishing
 * three games cannot be rushed.
 */
export const COMPLETIONS_BEFORE_REVIEW = 3;

/**
 * `undefined` means "not known yet", never "no": iOS grants three prompts a
 * year and drops the rest silently, so a guess that spends one early is
 * unrecoverable while waiting for the next render costs nothing.
 */
export function shouldRequestReview(input: {
  completed: number | undefined;
  asked: boolean | undefined;
  sawPaywall: boolean;
}): boolean {
  if (input.completed === undefined || input.asked === undefined) return false;

  if (input.asked) return false;

  // The paywall is reachable from the same screen this fires on, and asking
  // right after someone declined to pay reads as tone-deaf.
  if (input.sawPaywall) return false;

  return input.completed >= COMPLETIONS_BEFORE_REVIEW;
}
