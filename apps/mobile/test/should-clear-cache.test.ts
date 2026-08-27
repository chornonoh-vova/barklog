import { describe, expect, it } from "vitest";

import { shouldClearCache } from "@/auth/should-clear-cache";

describe("shouldClearCache", () => {
  it("clears on sign-out", () => {
    expect(shouldClearCache(true, false)).toBe(true);
  });

  it("does not clear on first load when signed out", () => {
    // The critical case: clearing here would be harmless but the guard exists
    // so a cold start is never mistaken for a sign-out.
    expect(shouldClearCache(undefined, false)).toBe(false);
  });

  it("does not clear on first load when already signed in", () => {
    expect(shouldClearCache(undefined, true)).toBe(false);
  });

  it("does not clear on sign-in", () => {
    expect(shouldClearCache(false, true)).toBe(false);
  });

  it("does not clear on a repeat render in either state", () => {
    expect(shouldClearCache(true, true)).toBe(false);
    expect(shouldClearCache(false, false)).toBe(false);
  });

  it("does not clear while the session is still loading", () => {
    // `isSignedIn` is `boolean | undefined` while Clerk re-establishes a
    // session (e.g. a token refresh in flight). `undefined` must never be
    // read as a sign-out.
    expect(shouldClearCache(true, undefined)).toBe(false);
  });
});
