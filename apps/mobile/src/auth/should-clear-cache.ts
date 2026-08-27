/**
 * Whether a change in Clerk's `isSignedIn` means the query cache must be
 * emptied.
 *
 * This exists as a named function rather than an inline comparison inside the
 * effect because it guards the one auth path with a user-visible failure mode:
 * without it, the next person to sign in on a shared device sees the previous
 * user's backlog rendered from cache before the first refetch lands. A pure
 * function is testable; an inline comparison in a `useEffect` is not.
 */
export function shouldClearCache(
  previous: boolean | undefined,
  next: boolean | undefined,
): boolean {
  return previous === true && next === false;
}
