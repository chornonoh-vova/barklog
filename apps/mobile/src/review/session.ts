/**
 * Module state, not React state: the flag has to outlive the paywall's own
 * unmount and reset only when the process does. One launch, one decision.
 */
let paywallSeen = false;

export function markPaywallSeen(): void {
  paywallSeen = true;
}

export function hasSeenPaywallThisSession(): boolean {
  return paywallSeen;
}

/** Test-only: module state would otherwise leak between cases. */
export function resetSession(): void {
  paywallSeen = false;
}
