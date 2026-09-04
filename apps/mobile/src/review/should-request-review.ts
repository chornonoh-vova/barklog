/**
 * Completions, not additions. Adding is one tap from Search, Explore or the
 * share extension, so a keen user can pile up dozens on install day without
 * having used the app for what it is. Finishing three games cannot be rushed,
 * and it is the moment the tracker has actually paid off.
 */
export const COMPLETIONS_BEFORE_REVIEW = 3;

/**
 * `undefined` for either input means "not known yet", never "no": iOS allows
 * three prompts a year and silently drops the rest, so a guess that spends one
 * early is unrecoverable, while waiting for the next render costs nothing.
 */
export function shouldRequestReview(input: {
  completed: number | undefined;
  asked: boolean | undefined;
  sawPaywall: boolean;
}): boolean {
  if (input.completed === undefined || input.asked === undefined) return false;

  if (input.asked) return false;

  // Asking right after someone declined to pay reads as tone-deaf, and the
  // paywall is reachable from the same screen this prompt fires on.
  if (input.sawPaywall) return false;

  return input.completed >= COMPLETIONS_BEFORE_REVIEW;
}
