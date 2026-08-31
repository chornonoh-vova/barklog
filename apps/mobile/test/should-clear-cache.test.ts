import { describe, expect, it } from "vitest";

import { shouldClearCache } from "@/auth/should-clear-cache";

const A = "user_2abc";
const B = "user_2xyz";

describe("shouldClearCache", () => {
  it("clears on sign-out", () => {
    expect(shouldClearCache(A, null)).toBe(true);
  });

  it("clears when the active user changes without signing out", () => {
    expect(shouldClearCache(A, B)).toBe(true);
  });

  it("does not clear on first load when signed out", () => {
    expect(shouldClearCache(undefined, null)).toBe(false);
  });

  it("does not clear on first load when already signed in", () => {
    expect(shouldClearCache(undefined, A)).toBe(false);
  });

  it("does not clear on sign-in", () => {
    expect(shouldClearCache(null, A)).toBe(false);
  });

  it("does not clear on a repeat render in either state", () => {
    expect(shouldClearCache(A, A)).toBe(false);
    expect(shouldClearCache(null, null)).toBe(false);
  });

  it("does not clear while the session is still loading", () => {
    expect(shouldClearCache(A, undefined)).toBe(false);
    expect(shouldClearCache(undefined, undefined)).toBe(false);
  });
});
