import { describe, expect, it } from "vitest";

import { shouldClearCache, shouldClearDeviceData } from "@/auth/should-clear-cache";

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

describe("shouldClearDeviceData", () => {
  it("clears whenever the app is signed out, including on a cold start", () => {
    // A session revoked while the app was closed: the cold start sees no user.
    expect(shouldClearDeviceData(undefined, null)).toBe(true);
    expect(shouldClearDeviceData(A, null)).toBe(true);
  });

  it("clears when the active user changes", () => {
    expect(shouldClearDeviceData(A, B)).toBe(true);
  });

  it("keeps them for the same user and while loading", () => {
    expect(shouldClearDeviceData(undefined, A)).toBe(false);
    expect(shouldClearDeviceData(A, A)).toBe(false);
    expect(shouldClearDeviceData(A, undefined)).toBe(false);
  });
});
