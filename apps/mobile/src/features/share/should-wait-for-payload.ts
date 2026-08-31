/**
 * Pure, and with no react-native in its graph, so the one piece of this feature
 * that is pure decision-making is testable in plain Node — the same shape as
 * `auth/should-clear-cache.ts`.
 */
export function shouldWaitForPayload(state: {
  isResolving: boolean;
  sharedCount: number;
  resolvedCount: number;
  hasError: boolean;
  hasAttempted: boolean;
}): boolean {
  if (state.isResolving) return true;

  // No share at all: `/shared` reached by deep link, or the app opened
  // normally. Nothing is coming, so nothing is worth waiting for.
  if (state.sharedCount === 0) return false;

  // A share exists but `isResolving` is false, which is ambiguous: it is also
  // the state on the very first frame, before the hook's effect has started
  // resolving. These two say the attempt is over, so the ambiguity is settled.
  if (state.hasError || state.hasAttempted) return false;

  return state.resolvedCount === 0;
}
