/**
 * Pure and named so it is testable: without it, the next person to sign in on a
 * shared device sees the previous user's backlog from cache.
 *
 * Keyed on the user id rather than a signed-in flag because switching the active
 * Clerk session never passes through a signed-out state — `setActive` swaps the
 * user with `isSignedIn` true throughout, so a boolean edge would never fire.
 *
 * `undefined` is "not yet known" and never clears; `null` is signed out.
 */
export function shouldClearCache(
  previous: string | null | undefined,
  next: string | null | undefined,
): boolean {
  if (previous === undefined || next === undefined) return false;

  // Leaving a known user. Signing in from signed-out has nothing to clear —
  // the sign-out already did it.
  return previous !== null && previous !== next;
}
