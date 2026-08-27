import { describe, expect, it } from "vitest";

import { shouldClearCache } from "@/auth/should-clear-cache";

const A = "user_2abc";
const B = "user_2xyz";

describe("shouldClearCache", () => {
  it("clears on sign-out", () => {
    expect(shouldClearCache(A, null)).toBe(true);
  });

  it("clears when the active user changes without signing out", () => {
    // `setActive` on a multi-session instance swaps the user with `isSignedIn`
    // true the whole way through, so this never appears as a sign-out edge.
    expect(shouldClearCache(A, B)).toBe(true);
  });

  it("does not clear on first load when signed out", () => {
    // The critical case: clearing here would be harmless but the guard exists
    // so a cold start is never mistaken for a sign-out.
    expect(shouldClearCache(undefined, null)).toBe(false);
  });

  it("does not clear on first load when already signed in", () => {
    expect(shouldClearCache(undefined, A)).toBe(false);
  });

  it("does not clear on sign-in", () => {
    // The sign-out that preceded it already emptied the cache.
    expect(shouldClearCache(null, A)).toBe(false);
  });

  it("does not clear on a repeat render in either state", () => {
    expect(shouldClearCache(A, A)).toBe(false);
    expect(shouldClearCache(null, null)).toBe(false);
  });

  it("does not clear while the session is still loading", () => {
    // `userId` is `undefined` while Clerk re-establishes a session (e.g. a
    // token refresh in flight). It must never be read as a sign-out or as a
    // different user.
    expect(shouldClearCache(A, undefined)).toBe(false);
    expect(shouldClearCache(undefined, undefined)).toBe(false);
  });
});
