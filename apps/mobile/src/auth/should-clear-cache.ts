/**
 * Keyed on the user id, not a signed-in flag: `setActive` swaps users with
 * `isSignedIn` true throughout, so a boolean edge would never fire and the next
 * user would see the previous one's backlog from cache.
 *
 * `undefined` is "not yet known" and never clears; `null` is signed out.
 */
export function shouldClearCache(
  previous: string | null | undefined,
  next: string | null | undefined,
): boolean {
  if (previous === undefined || next === undefined) return false;

  return previous !== null && previous !== next;
}
