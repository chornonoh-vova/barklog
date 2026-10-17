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

/**
 * Recent searches live on disk, so the in-memory edge above is not enough: a
 * session revoked while the app was closed comes back as a cold start with no
 * user, and the next sign-in would inherit the last one's queries. Any
 * signed-out state clears them.
 */
export function shouldClearRecents(
  previous: string | null | undefined,
  next: string | null | undefined,
): boolean {
  return next === null || shouldClearCache(previous, next);
}
