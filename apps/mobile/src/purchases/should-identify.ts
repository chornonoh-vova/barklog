export type IdentifyAction = "none" | "login" | "logout";

/**
 * `undefined` is Clerk unresolved, `null` is signed out. Treating them alike
 * logs out mid session-establishment, detaching the entitlement mid-purchase —
 * the same distinction `should-clear-cache.ts` draws.
 */
export function identifyAction(
  previous: string | null | undefined,
  current: string | null | undefined,
): IdentifyAction {
  if (current === undefined) return "none";
  if (previous === current) return "none";

  return current === null ? "logout" : "login";
}
